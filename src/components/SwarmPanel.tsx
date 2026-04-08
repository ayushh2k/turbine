import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { useSwarmStore } from '../state/swarmStore';
import { useAgentStore } from '../state/agentStore';
import type { SwarmRun, SwarmAgent, MailboxMessage, AgentPreset, WorkflowStep } from '../types';
import { DEFAULT_AGENT_ROLES } from '../types';
import { SwarmHistory } from './SwarmHistory';
import './SwarmPanel.css';

interface SwarmPanelProps {
  projectPath: string;
  workspaceId: string;
  sourcePaneId?: string | null;
  onFocus?: () => void;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[^[\]]/g, '')
    .replace(/\r(?!\n)/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

function buildPreviewLines(output: string, maxLines = 20): string {
  const lines = stripAnsi(output)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  const compact: string[] = [];
  let previous = '';
  let repeatCount = 0;

  const flush = () => {
    if (!previous) return;
    compact.push(repeatCount > 1 ? `${previous} [x${repeatCount}]` : previous);
  };

  for (const line of lines) {
    if (line === previous) {
      repeatCount += 1;
      continue;
    }
    flush();
    previous = line;
    repeatCount = 1;
  }
  flush();

  return compact.slice(-maxLines).join('\n');
}

type ViewId = 'runs' | 'new-run' | 'workflow' | 'config' | 'history';

export function SwarmPanel({ projectPath, workspaceId, sourcePaneId = null, onFocus }: SwarmPanelProps) {
  const runs = useSwarmStore((s) => s.runs);
  const messages = useSwarmStore((s) => s.messages);
  const agents = useSwarmStore((s) => s.agents);
  const outputBuffers = useSwarmStore((s) => s.outputBuffers);
  const workflowSteps = useSwarmStore((s) => s.workflowSteps);
  const activeRunId = useSwarmStore((s) => s.activeRunId);
  const loadRuns = useSwarmStore((s) => s.loadRuns);
  const loadMessages = useSwarmStore((s) => s.loadMessages);
  const loadAgents = useSwarmStore((s) => s.loadAgents);
  const loadWorkflowSteps = useSwarmStore((s) => s.loadWorkflowSteps);
  const setActiveRun = useSwarmStore((s) => s.setActiveRun);
  const updateRunStatus = useSwarmStore((s) => s.updateRunStatus);
  const startAdHocRun = useSwarmStore((s) => s.startAdHocRun);
  const spawnAgent = useSwarmStore((s) => s.spawnAgent);
  const killAgent = useSwarmStore((s) => s.killAgent);
  const deleteRun = useSwarmStore((s) => s.deleteRun);
  const postMessage = useSwarmStore((s) => s.postMessage);
  const initListeners = useSwarmStore((s) => s.initListeners);
  const saveWorkflowSteps = useSwarmStore((s) => s.saveWorkflowSteps);

  const presets = useAgentStore((s) => s.presets);
  const loadPresets = useAgentStore((s) => s.loadPresets);
  const savePreset = useAgentStore((s) => s.savePreset);
  const deletePreset = useAgentStore((s) => s.deletePreset);

  const [view, setView] = useState<ViewId>('runs');
  const [prompt, setPrompt] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [workflowDraft, setWorkflowDraft] = useState<Array<{ presetId: string; promptOverride: string; parallel: boolean }>>([]);

  const projectRuns = useMemo(
    () => runs.filter((r) => r.project_path === projectPath),
    [runs, projectPath],
  );

  const activeRun = useMemo(
    () => projectRuns.find((r) => r.id === activeRunId) ?? null,
    [projectRuns, activeRunId],
  );

  const activeAgents = useMemo(
    () => (activeRunId ? agents.get(activeRunId) ?? [] : []),
    [agents, activeRunId],
  );

  const activeMessages = useMemo(
    () => (activeRunId ? messages.get(activeRunId) ?? [] : []),
    [messages, activeRunId],
  );

  const activeSteps = useMemo(
    () => (activeRunId ? workflowSteps.get(activeRunId) ?? [] : []),
    [workflowSteps, activeRunId],
  );

  useEffect(() => {
    void loadRuns(projectPath);
    void loadPresets();
    void initListeners();
  }, [projectPath, loadRuns, loadPresets, initListeners]);

  useEffect(() => {
    if (activeRunId) {
      void loadMessages(activeRunId);
      void loadAgents(activeRunId);
      void loadWorkflowSteps(activeRunId);
    }
  }, [activeRunId, loadMessages, loadAgents, loadWorkflowSteps]);

  const handleQuickRun = useCallback(
    async (preset: AgentPreset) => {
      const run = await startAdHocRun(projectPath, prompt || undefined, workspaceId, sourcePaneId);
      await spawnAgent(run.id, preset.id, prompt || null, projectPath);
      setPrompt('');
      setView('runs');
    },
    [projectPath, prompt, startAdHocRun, spawnAgent, workspaceId, sourcePaneId],
  );

  const handleWorkflowRun = useCallback(async () => {
    if (workflowDraft.length === 0) return;
    const run = await startAdHocRun(projectPath, prompt || undefined, workspaceId, sourcePaneId);

    const steps: WorkflowStep[] = workflowDraft.map((draft, i) => {
      const dependsOn: string[] = [];
      if (i > 0 && !draft.parallel) {
        for (let j = i - 1; j >= 0; j--) {
          dependsOn.push(`step-${j}`);
          if (!workflowDraft[j].parallel) break;
        }
      }
      return {
        id: `step-${i}`,
        swarm_run_id: run.id,
        step_order: i,
        preset_id: draft.presetId,
        prompt_override: draft.promptOverride || null,
        depends_on_json: JSON.stringify(dependsOn),
        status: 'pending',
        agent_id: null,
      };
    });

    await saveWorkflowSteps(run.id, steps);

    for (const step of steps) {
      const deps: string[] = JSON.parse(step.depends_on_json);
      if (deps.length === 0) {
        const preset = presets.find((p) => p.id === step.preset_id);
        if (preset) {
          await spawnAgent(run.id, preset.id, step.prompt_override ?? prompt ?? null, projectPath);
        }
      }
    }

    setWorkflowDraft([]);
    setPrompt('');
    setView('runs');
  }, [projectPath, prompt, workflowDraft, startAdHocRun, spawnAgent, saveWorkflowSteps, presets, workspaceId, sourcePaneId]);

  const handleSendMessage = useCallback(() => {
    if (!activeRunId || !userMessage.trim()) return;
    void postMessage(activeRunId, 'User', userMessage.trim());
    setUserMessage('');
  }, [activeRunId, userMessage, postMessage]);

  const handleBackToList = useCallback(() => {
    setActiveRun(null);
  }, [setActiveRun]);

  // Show detail view when a run is selected
  const showDetail = activeRun && (view === 'runs' || view === 'new-run');

  return (
    <div className="swarm-panel" onClick={onFocus}>
      {/* ── Header ── */}
      <div className="swarm-panel__header">
        <div className="swarm-panel__header-top">
          <h2 className="swarm-panel__title">Agent Swarm</h2>
          {projectRuns.length > 0 && (
            <span className="swarm-panel__count">{projectRuns.length}</span>
          )}
        </div>
        <nav className="swarm-panel__nav">
          <button
            className={`swarm-panel__nav-item ${view === 'runs' ? 'swarm-panel__nav-item--active' : ''}`}
            onClick={() => { setView('runs'); setActiveRun(null); }}
          >
            Runs
          </button>
          <button
            className={`swarm-panel__nav-item ${view === 'new-run' ? 'swarm-panel__nav-item--active' : ''}`}
            onClick={() => setView(view === 'new-run' ? 'runs' : 'new-run')}
          >
            Quick Run
          </button>
          <button
            className={`swarm-panel__nav-item ${view === 'workflow' ? 'swarm-panel__nav-item--active' : ''}`}
            onClick={() => setView(view === 'workflow' ? 'runs' : 'workflow')}
          >
            Workflow
          </button>
          <button
            className={`swarm-panel__nav-item ${view === 'config' ? 'swarm-panel__nav-item--active' : ''}`}
            onClick={() => setView(view === 'config' ? 'runs' : 'config')}
          >
            Settings
          </button>
          <button
            className={`swarm-panel__nav-item ${view === 'history' ? 'swarm-panel__nav-item--active' : ''}`}
            onClick={() => setView(view === 'history' ? 'runs' : 'history')}
          >
            History
          </button>
        </nav>
      </div>

      {/* ── New Run (Quick — single agent) ── */}
      {view === 'new-run' && (
        <div className="swarm-panel__new-run">
          <div className="swarm-panel__section-title">Launch a single agent</div>
          <textarea
            className="swarm-panel__prompt"
            placeholder="What should the agent work on? (optional)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
          <div className="swarm-panel__new-run-label">Choose an agent to run:</div>
          <div className="swarm-panel__new-run-list">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className="swarm-panel__agent-btn"
                onClick={() => void handleQuickRun(preset)}
              >
                <span className="swarm-panel__agent-btn-icon">
                  {preset.role === 'Builder' ? '▶' : preset.role === 'Reviewer' ? '◉' : preset.role === 'Orchestrator' ? '✦' : '◆'}
                </span>
                <span className="swarm-panel__agent-btn-info">
                  <span className="swarm-panel__agent-btn-name">{preset.name}</span>
                  <span className="swarm-panel__agent-btn-role">{preset.role}</span>
                </span>
                <span className="swarm-panel__agent-btn-arrow">&rarr;</span>
              </button>
            ))}
            {presets.length === 0 && (
              <EmptyState
                icon={'⚙'}
                title="No agents configured"
                description="Go to Settings tab to add agent presets like Claude Code, Gemini CLI, or Codex."
                action={{ label: 'Open Settings', onClick: () => setView('config') }}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Workflow Builder (multi-agent) ── */}
      {view === 'workflow' && (
        <WorkflowBuilder
          presets={presets}
          prompt={prompt}
          onPromptChange={setPrompt}
          steps={workflowDraft}
          onStepsChange={setWorkflowDraft}
          onStart={handleWorkflowRun}
        />
      )}

      {/* ── Agent Config ── */}
      {view === 'config' && (
        <PresetEditor
          presets={presets}
          onSave={(p) => void savePreset(p)}
          onDelete={(id) => void deletePreset(id)}
          onClose={() => setView('runs')}
        />
      )}

      {/* ── History View ── */}
      {view === 'history' && (
        <SwarmHistory projectPath={projectPath} />
      )}

      {/* ── Main Content: Run list or Run detail ── */}
      {(view === 'runs' || view === 'new-run') && !showDetail && (
        <div className="swarm-panel__body">
          {projectRuns.length === 0 && view === 'runs' && (
            <EmptyState
              icon={'⚡'}
              title="No swarm runs yet"
              description="Launch an agent to get started. Use Quick Run for a single agent, or Workflow to chain multiple agents together."
              action={{ label: 'Start a Quick Run', onClick: () => setView('new-run') }}
            />
          )}
          <div className="swarm-panel__run-list">
            {projectRuns.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                agents={agents.get(run.id) ?? []}
                onClick={() => setActiveRun(run.id)}
                onDelete={() => void deleteRun(run.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Active Run Detail ── */}
      {showDetail && activeRun && (
        <div className="swarm-panel__detail">
          <div className="swarm-panel__detail-header">
            <button className="swarm-panel__back-btn" onClick={handleBackToList} title="Back to runs">
              &larr;
            </button>
            <div className="swarm-panel__detail-title">
              <RunStatusBadge status={activeRun.status} />
              <span className="swarm-panel__detail-id">Run {activeRun.id.slice(0, 8)}</span>
            </div>
            <div className="swarm-panel__detail-actions">
              {activeRun.status === 'Running' && (
                <button
                  className="swarm-panel__action-btn swarm-panel__action-btn--warning"
                  onClick={() => void updateRunStatus(activeRun.id, 'Paused', activeRun.current_role)}
                >
                  Pause
                </button>
              )}
              {activeRun.status === 'Paused' && (
                <button
                  className="swarm-panel__action-btn swarm-panel__action-btn--primary"
                  onClick={() => void updateRunStatus(activeRun.id, 'Running', activeRun.current_role)}
                >
                  Resume
                </button>
              )}
              {(activeRun.status === 'Running' || activeRun.status === 'Paused') && (
                <button
                  className="swarm-panel__action-btn swarm-panel__action-btn--danger"
                  onClick={() => void updateRunStatus(activeRun.id, 'Failed', null)}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {activeRun.prompt && (
            <div className="swarm-panel__run-prompt">
              <span className="swarm-panel__run-prompt-label">Prompt</span>
              <p className="swarm-panel__run-prompt-text">{activeRun.prompt}</p>
            </div>
          )}

          {/* Workflow pipeline visualization */}
          {activeSteps.length > 0 && (
            <WorkflowPipelineView steps={activeSteps} agents={activeAgents} />
          )}

          {/* Agent cards */}
          <div className="swarm-panel__agents-section">
            <div className="swarm-panel__section-label">
              Agents ({activeAgents.length})
            </div>
            <div className="swarm-panel__agents">
              {activeAgents.length === 0 && (
                <div className="swarm-panel__empty-inline">No agents spawned yet.</div>
              )}
              {activeAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  output={outputBuffers.get(agent.pane_id) ?? ''}
                  onKill={() => void killAgent(agent.id)}
                />
              ))}
            </div>
          </div>

          {/* Mailbox */}
          <div className="swarm-panel__mailbox">
            <div className="swarm-panel__section-label">
              Mailbox
              {activeMessages.length > 0 && (
                <span className="swarm-panel__badge">{activeMessages.length}</span>
              )}
            </div>
            <div className="swarm-panel__messages">
              {activeMessages.length === 0 && (
                <div className="swarm-panel__empty-inline">No messages yet.</div>
              )}
              {activeMessages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>
            <div className="swarm-panel__message-input">
              <input
                type="text"
                placeholder="Send a message to agents..."
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
              />
              <button onClick={handleSendMessage} disabled={!userMessage.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Empty State ---------- */

function EmptyState({ icon, title, description, action }: {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="swarm-empty">
      <div className="swarm-empty__icon">{icon}</div>
      <div className="swarm-empty__title">{title}</div>
      <div className="swarm-empty__desc">{description}</div>
      {action && (
        <button className="swarm-empty__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ---------- Run Card ---------- */

function RunCard({ run, agents, onClick, onDelete }: {
  run: SwarmRun;
  agents: SwarmAgent[];
  onClick: () => void;
  onDelete: () => void;
}) {
  const runningCount = agents.filter((a) => a.status === 'running').length;
  const doneCount = agents.filter((a) => a.status === 'completed').length;
  const failedCount = agents.filter((a) => a.status === 'failed').length;
  const isActive = run.status === 'Running' || run.status === 'Initializing';

  return (
    <div
      className={`run-card ${isActive ? 'run-card--active' : ''} run-card--${run.status.toLowerCase()}`}
      onClick={onClick}
    >
      <div className="run-card__top">
        <RunStatusBadge status={run.status} />
        <span className="run-card__time">{relativeTime(run.updated_at ?? run.started_at)}</span>
        <button
          className="run-card__delete"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete run"
        >
          &times;
        </button>
      </div>
      {run.prompt && (
        <div className="run-card__prompt">
          {run.prompt.length > 100 ? run.prompt.slice(0, 100) + '...' : run.prompt}
        </div>
      )}
      {agents.length > 0 && (
        <div className="run-card__stats">
          {runningCount > 0 && <span className="run-card__stat run-card__stat--running">{runningCount} running</span>}
          {doneCount > 0 && <span className="run-card__stat run-card__stat--done">{doneCount} done</span>}
          {failedCount > 0 && <span className="run-card__stat run-card__stat--failed">{failedCount} failed</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- Run Status Badge ---------- */

function RunStatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  const icon = lower === 'running' ? '●' : lower === 'completed' ? '✓' : lower === 'failed' ? '✗' : lower === 'paused' ? '❚❚' : '○';
  return (
    <span className={`status-badge status-badge--${lower}`}>
      <span className="status-badge__dot">{icon}</span>
      {status}
    </span>
  );
}

/* ---------- Agent Card ---------- */

function AgentCard({ agent, output, onKill }: {
  agent: SwarmAgent;
  output: string;
  onKill: () => void;
}) {
  const [expanded, setExpanded] = useState(agent.status !== 'running');
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (expanded && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [expanded, output]);

  const previewLines =
    agent.status === 'running'
      ? 'Live output is in the linked terminal pane.'
      : buildPreviewLines(agent.output_summary ?? output) || (agent.status === 'pending' ? 'Waiting to start...' : 'No output captured.');

  return (
    <div className={`agent-card agent-card--${agent.status}`}>
      <div className="agent-card__header" onClick={() => setExpanded(!expanded)}>
        <div className="agent-card__left">
          <span className={`agent-card__indicator agent-card__indicator--${agent.status}`} />
          <div className="agent-card__info">
            <span className="agent-card__role">{agent.role}</span>
            <span className="agent-card__cmd" title={agent.command}>
              {agent.command.length > 40 ? agent.command.slice(0, 40) + '...' : agent.command}
            </span>
          </div>
        </div>
        <div className="agent-card__right">
          <span className="agent-card__time">
            {agent.status === 'running' ? relativeTime(agent.started_at) : relativeTime(agent.completed_at ?? agent.started_at)}
          </span>
          {agent.status === 'running' && (
            <button className="agent-card__kill" onClick={(e) => { e.stopPropagation(); onKill(); }}>
              Stop
            </button>
          )}
          {agent.exit_code !== null && (
            <span className={`agent-card__exit ${agent.exit_code === 0 ? 'agent-card__exit--ok' : 'agent-card__exit--err'}`}>
              {agent.exit_code === 0 ? '✓' : '✗'} {agent.exit_code}
            </span>
          )}
          <span className={`agent-card__chevron ${expanded ? 'agent-card__chevron--open' : ''}`}>
            &#9662;
          </span>
        </div>
      </div>
      {expanded && (
        <pre ref={outputRef} className="agent-card__output">
          {previewLines}
        </pre>
      )}
    </div>
  );
}

/* ---------- Workflow Pipeline View ---------- */

function WorkflowPipelineView({ steps, agents }: { steps: WorkflowStep[]; agents: SwarmAgent[] }) {
  const levels: WorkflowStep[][] = [];
  const placed = new Set<string>();

  while (placed.size < steps.length) {
    const level: WorkflowStep[] = [];
    for (const step of steps) {
      if (placed.has(step.id)) continue;
      const deps: string[] = JSON.parse(step.depends_on_json);
      if (deps.every((d) => placed.has(d))) {
        level.push(step);
      }
    }
    if (level.length === 0) break;
    level.forEach((s) => placed.add(s.id));
    levels.push(level);
  }

  const statusIcon = (status: string): string => {
    switch (status) {
      case 'running': return '●';
      case 'completed': return '✓';
      case 'failed': return '✗';
      default: return '○';
    }
  };

  return (
    <div className="wf-pipeline">
      <div className="swarm-panel__section-label">Pipeline</div>
      <div className="wf-pipeline__track">
        {levels.map((level, li) => (
          <div key={li} className="wf-pipeline__level">
            {li > 0 && <div className="wf-pipeline__connector" />}
            <div className="wf-pipeline__blocks">
              {level.map((step) => {
                const agent = agents.find((a) => a.id === step.agent_id);
                const status = agent?.status ?? step.status;
                return (
                  <div key={step.id} className={`wf-step wf-step--${status}`}>
                    <span className="wf-step__icon">{statusIcon(status)}</span>
                    <span className="wf-step__label">Step {step.step_order + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Workflow Builder ---------- */

function WorkflowBuilder({ presets, prompt, onPromptChange, steps, onStepsChange, onStart }: {
  presets: AgentPreset[];
  prompt: string;
  onPromptChange: (v: string) => void;
  steps: Array<{ presetId: string; promptOverride: string; parallel: boolean }>;
  onStepsChange: (steps: Array<{ presetId: string; promptOverride: string; parallel: boolean }>) => void;
  onStart: () => void;
}) {
  const addStep = () => {
    if (presets.length === 0) return;
    onStepsChange([...steps, { presetId: presets[0].id, promptOverride: '', parallel: false }]);
  };

  const removeStep = (i: number) => {
    onStepsChange(steps.filter((_, idx) => idx !== i));
  };

  const updateStep = (i: number, patch: Partial<typeof steps[number]>) => {
    onStepsChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  return (
    <div className="workflow-builder">
      <div className="swarm-panel__section-title">Chain multiple agents in sequence or parallel</div>

      <textarea
        className="swarm-panel__prompt"
        placeholder="Shared prompt for all steps (agents can override per-step)..."
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={2}
      />

      <div className="workflow-builder__steps">
        <div className="workflow-builder__steps-header">
          <span>Steps ({steps.length})</span>
          <button className="swarm-panel__action-btn swarm-panel__action-btn--primary" onClick={addStep}>
            + Add Step
          </button>
        </div>

        {steps.map((step, i) => (
          <div key={i} className="workflow-builder__step">
            <div className="workflow-builder__step-header">
              <span className="workflow-builder__step-num">{i + 1}</span>
              <select
                value={step.presetId}
                onChange={(e) => updateStep(i, { presetId: e.target.value })}
                className="workflow-builder__select"
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                ))}
              </select>
              <label className="workflow-builder__parallel">
                <input
                  type="checkbox"
                  checked={step.parallel}
                  onChange={(e) => updateStep(i, { parallel: e.target.checked })}
                />
                Parallel
              </label>
              <button className="workflow-builder__remove" onClick={() => removeStep(i)} title="Remove step">
                &times;
              </button>
            </div>
            <input
              className="workflow-builder__override"
              placeholder="Override prompt for this step (optional)"
              value={step.promptOverride}
              onChange={(e) => updateStep(i, { promptOverride: e.target.value })}
            />
          </div>
        ))}

        {steps.length === 0 && (
          <div className="swarm-panel__empty-inline">Click "Add Step" to build your workflow pipeline.</div>
        )}
      </div>

      {/* Visual preview */}
      {steps.length > 0 && (
        <div className="workflow-builder__preview">
          {steps.map((step, i) => {
            const preset = presets.find((p) => p.id === step.presetId);
            return (
              <div key={i} className="workflow-builder__preview-step">
                {i > 0 && <div className="workflow-builder__preview-arrow">{step.parallel ? '∥' : '↓'}</div>}
                <div className="workflow-builder__preview-block">
                  <span className="workflow-builder__preview-role">{preset?.role ?? '?'}</span>
                  <span>{preset?.name ?? 'Unknown'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        className="swarm-panel__cta"
        onClick={onStart}
        disabled={steps.length === 0}
      >
        Start Workflow ({steps.length} step{steps.length !== 1 ? 's' : ''})
      </button>
    </div>
  );
}

/* ---------- Preset Editor ---------- */

function PresetEditor({ presets, onSave, onDelete, onClose }: {
  presets: AgentPreset[];
  onSave: (preset: AgentPreset) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [editingPreset, setEditingPreset] = useState<AgentPreset | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [cmd, setCmd] = useState('');
  const [customRole, setCustomRole] = useState('');

  useEffect(() => {
    if (editingPreset) {
      setName(editingPreset.name);
      const isDefault = (DEFAULT_AGENT_ROLES as readonly string[]).includes(editingPreset.role);
      setRole(isDefault ? editingPreset.role : '__custom__');
      setCustomRole(isDefault ? '' : editingPreset.role);
      setCmd(editingPreset.cli_command_template);
    }
  }, [editingPreset]);

  const handleSave = () => {
    const finalRole = role === '__custom__' ? customRole.trim() : role;
    if (!name.trim() || !finalRole || !cmd.trim()) return;
    onSave({
      id: editingPreset?.id || crypto.randomUUID(),
      name: name.trim(),
      role: finalRole,
      cli_command_template: cmd.trim(),
    });
    setEditingPreset(null);
    setName(''); setRole(''); setCmd(''); setCustomRole('');
  };

  const handleNew = () => {
    setEditingPreset({ id: '', name: '', role: 'Builder', cli_command_template: '' });
  };

  return (
    <div className="preset-editor">
      <div className="preset-editor__top">
        <div className="swarm-panel__section-title">Configure your agent presets</div>
        <div className="preset-editor__top-actions">
          <button className="swarm-panel__action-btn swarm-panel__action-btn--primary" onClick={handleNew}>
            + New Agent
          </button>
          <button className="swarm-panel__action-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      <div className="preset-editor__help">
        Template variables: <code>{'{{prompt}}'}</code> <code>{'{{task.title}}'}</code> <code>{'{{task.description}}'}</code> <code>{'{{cwd}}'}</code>
      </div>

      <div className="preset-editor__list">
        {presets.map((p) => (
          <div
            key={p.id}
            className={`preset-editor__item ${editingPreset?.id === p.id ? 'preset-editor__item--editing' : ''}`}
            onClick={() => setEditingPreset(p)}
          >
            <div className="preset-editor__item-main">
              <span className="preset-editor__item-name">{p.name}</span>
              <span className="preset-editor__item-role">{p.role}</span>
            </div>
            <div className="preset-editor__item-cmd">{p.cli_command_template}</div>
            <button
              className="preset-editor__item-del"
              onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
              title="Delete"
            >
              &times;
            </button>
          </div>
        ))}
        {presets.length === 0 && (
          <EmptyState
            icon={'⚙'}
            title="No presets yet"
            description='Click "+ New Agent" to create your first agent preset.'
          />
        )}
      </div>

      {editingPreset && (
        <div className="preset-editor__form">
          <div className="preset-editor__form-title">
            {editingPreset.id ? 'Edit Agent' : 'New Agent'}
          </div>
          <input
            className="preset-editor__input"
            placeholder="Agent name (e.g. Claude Code)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="preset-editor__role-row">
            <select
              className="preset-editor__select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {DEFAULT_AGENT_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="__custom__">Custom...</option>
            </select>
            {role === '__custom__' && (
              <input
                className="preset-editor__input"
                placeholder="Custom role name"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
              />
            )}
          </div>
          <input
            className="preset-editor__input"
            placeholder='CLI command e.g. claude -p "{{prompt}}"'
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
          />
          <div className="preset-editor__form-actions">
            <button className="swarm-panel__action-btn" onClick={() => setEditingPreset(null)}>
              Cancel
            </button>
            <button className="swarm-panel__cta" onClick={handleSave}>
              {editingPreset.id ? 'Save Changes' : 'Create Agent'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Message Bubble ---------- */

function MessageBubble({ message }: { message: MailboxMessage }) {
  const isUser = message.sender_role === 'User';
  return (
    <div className={`msg-bubble ${isUser ? 'msg-bubble--user' : 'msg-bubble--agent'}`}>
      <div className="msg-bubble__header">
        <span className="msg-bubble__role">{message.sender_role}</span>
        <span className="msg-bubble__time">{relativeTime(message.created_at)}</span>
      </div>
      <div className="msg-bubble__content">{message.content}</div>
    </div>
  );
}
