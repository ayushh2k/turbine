import { useEffect, useMemo, useCallback } from 'react';
import { useSwarmStore } from '../state/swarmStore';
import type { SwarmRun, SwarmStatus, MailboxMessage } from '../types';
import './SwarmPanel.css';

interface SwarmPanelProps {
  projectPath: string;
  onFocus?: () => void;
}

const STATUS_ORDER: SwarmStatus[] = ['Initializing', 'Running', 'Reviewing', 'Completed', 'Failed'];

const STATUS_COLORS: Record<SwarmStatus, string> = {
  Initializing: '#ffc107',
  Running: '#00e5c8',
  Reviewing: '#82c4f0',
  Completed: '#4caf50',
  Failed: '#f44336',
};

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

export function SwarmPanel({ projectPath, onFocus }: SwarmPanelProps) {
  const runs = useSwarmStore((s) => s.runs);
  const messages = useSwarmStore((s) => s.messages);
  const activeRunId = useSwarmStore((s) => s.activeRunId);
  const loadRuns = useSwarmStore((s) => s.loadRuns);
  const loadMessages = useSwarmStore((s) => s.loadMessages);
  const setActiveRun = useSwarmStore((s) => s.setActiveRun);
  const updateRunStatus = useSwarmStore((s) => s.updateRunStatus);

  const projectRuns = useMemo(
    () => runs.filter((r) => r.project_path === projectPath),
    [runs, projectPath],
  );

  const activeRun = useMemo(
    () => projectRuns.find((r) => r.id === activeRunId) ?? null,
    [projectRuns, activeRunId],
  );

  const activeMessages = useMemo(
    () => (activeRunId ? messages.get(activeRunId) ?? [] : []),
    [messages, activeRunId],
  );

  useEffect(() => {
    void loadRuns(projectPath);
  }, [projectPath, loadRuns]);

  useEffect(() => {
    if (activeRunId) {
      void loadMessages(activeRunId);
    }
  }, [activeRunId, loadMessages]);

  const handleCancelRun = useCallback(
    (runId: string) => {
      void updateRunStatus(runId, 'Failed', null);
    },
    [updateRunStatus],
  );

  const handleCompleteRun = useCallback(
    (runId: string) => {
      void updateRunStatus(runId, 'Completed', null);
    },
    [updateRunStatus],
  );

  return (
    <div className="swarm-panel" onClick={onFocus}>
      <div className="swarm-panel__header">
        <h2 className="swarm-panel__title">Agent Swarm</h2>
        <span className="swarm-panel__count">
          {projectRuns.length} run{projectRuns.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="swarm-panel__body">
        {/* Run list */}
        <div className="swarm-panel__runs">
          {projectRuns.length === 0 && (
            <div className="swarm-panel__empty">
              No swarm runs yet. Start one from the Task Board.
            </div>
          )}
          {projectRuns.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              isActive={run.id === activeRunId}
              onSelect={() => setActiveRun(run.id)}
              onCancel={() => handleCancelRun(run.id)}
              onComplete={() => handleCompleteRun(run.id)}
            />
          ))}
        </div>

        {/* Mailbox for active run */}
        {activeRun && (
          <div className="swarm-panel__mailbox">
            <div className="swarm-panel__mailbox-header">
              <h3>Mailbox</h3>
              <StatusPipeline status={activeRun.status} currentRole={activeRun.current_role} />
            </div>
            <div className="swarm-panel__messages">
              {activeMessages.length === 0 && (
                <div className="swarm-panel__empty">No messages yet.</div>
              )}
              {activeMessages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function RunCard({
  run,
  isActive,
  onSelect,
  onCancel,
  onComplete,
}: {
  run: SwarmRun;
  isActive: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const isTerminal = run.status === 'Completed' || run.status === 'Failed';

  return (
    <div
      className={`swarm-panel__run-card ${isActive ? 'swarm-panel__run-card--active' : ''}`}
      onClick={onSelect}
    >
      <div className="swarm-panel__run-top">
        <span
          className="swarm-panel__run-status"
          style={{ color: STATUS_COLORS[run.status] }}
        >
          {run.status}
        </span>
        <span className="swarm-panel__run-time">
          {relativeTime(run.updated_at ?? run.started_at)}
        </span>
      </div>
      <div className="swarm-panel__run-meta">
        <span className="swarm-panel__run-id" title={run.id}>
          {run.id.slice(0, 8)}
        </span>
        {run.current_role && (
          <span className="swarm-panel__run-role">{run.current_role}</span>
        )}
      </div>
      {!isTerminal && (
        <div className="swarm-panel__run-actions">
          <button
            className="swarm-panel__action-btn swarm-panel__action-btn--complete"
            onClick={(e) => { e.stopPropagation(); onComplete(); }}
          >
            Complete
          </button>
          <button
            className="swarm-panel__action-btn swarm-panel__action-btn--cancel"
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function StatusPipeline({
  status,
  currentRole,
}: {
  status: SwarmStatus;
  currentRole: string | null;
}) {
  const activeIdx = STATUS_ORDER.indexOf(status);

  return (
    <div className="swarm-panel__pipeline">
      {STATUS_ORDER.map((s, i) => (
        <span
          key={s}
          className={[
            'swarm-panel__pipeline-step',
            i === activeIdx ? 'swarm-panel__pipeline-step--active' : '',
            i < activeIdx ? 'swarm-panel__pipeline-step--done' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={i === activeIdx ? { color: STATUS_COLORS[s] } : undefined}
        >
          {s}
        </span>
      ))}
      {currentRole && (
        <span className="swarm-panel__pipeline-role">{currentRole}</span>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: MailboxMessage }) {
  return (
    <div className="swarm-panel__message">
      <div className="swarm-panel__message-header">
        <span className="swarm-panel__message-role">{message.sender_role}</span>
        <span className="swarm-panel__message-time">
          {relativeTime(message.created_at)}
        </span>
      </div>
      <div className="swarm-panel__message-content">{message.content}</div>
    </div>
  );
}
