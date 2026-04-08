import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { SwarmRun, SwarmAgent, MailboxMessage, SwarmStatus, WorkflowStep, Task } from '../types';

const OUTPUT_BUFFER_MAX = 10 * 1024; // 10KB rolling buffer per agent
let listenerInitPromise: Promise<void> | null = null;
const processedAgentExits = new Set<string>();

/** Strip ANSI escape sequences from raw PTY output. */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[^[\]]/g, '')
    .replace(/\r(?!\n)/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

interface SwarmState {
  runs: SwarmRun[];
  messages: Map<string, MailboxMessage[]>;
  agents: Map<string, SwarmAgent[]>;       // run_id → agents
  outputBuffers: Map<string, string>;       // pane_id → rolling text output
  workflowSteps: Map<string, WorkflowStep[]>; // run_id → steps
  runWorkspaceIds: Map<string, string>;
  runSourcePaneIds: Map<string, string | null>;
  pendingAgentPanes: Array<{ agent: SwarmAgent; workspaceId: string; sourcePaneId: string | null; projectPath: string }>;
  activeRunId: string | null;

  // Event listener cleanup
  _unlisteners: UnlistenFn[];

  // Init / teardown
  initListeners: () => Promise<void>;
  cleanup: () => void;

  // Run management
  loadRuns: (projectPath: string) => Promise<void>;
  loadMessages: (swarmRunId: string) => Promise<void>;
  loadAgents: (swarmRunId: string) => Promise<void>;
  startRun: (task: Task, projectPath: string) => Promise<SwarmRun>;
  startAdHocRun: (projectPath: string, prompt?: string, workspaceId?: string, sourcePaneId?: string | null) => Promise<SwarmRun>;
  updateRunStatus: (runId: string, status: SwarmStatus, currentRole: string | null) => Promise<void>;
  postMessage: (swarmRunId: string, senderRole: string, content: string) => Promise<void>;
  setActiveRun: (runId: string | null) => void;
  deleteRun: (runId: string) => Promise<void>;
  consumePendingAgentPane: (paneId: string) => void;

  // Agent execution
  spawnAgent: (runId: string, presetId: string, prompt: string | null, cwd: string, taskTitle?: string, taskDescription?: string) => Promise<SwarmAgent>;
  killAgent: (agentId: string) => Promise<void>;
  restartAgent: (agent: SwarmAgent, cwd: string) => Promise<SwarmAgent>;

  // Workflow
  saveWorkflowSteps: (runId: string, steps: WorkflowStep[]) => Promise<void>;
  loadWorkflowSteps: (runId: string) => Promise<void>;
}

export const useSwarmStore = create<SwarmState>((set, get) => ({
  runs: [],
  messages: new Map(),
  agents: new Map(),
  outputBuffers: new Map(),
  workflowSteps: new Map(),
  runWorkspaceIds: new Map(),
  runSourcePaneIds: new Map(),
  pendingAgentPanes: [],
  activeRunId: null,
  _unlisteners: [],

  initListeners: async () => {
    if (get()._unlisteners.length > 0) return;
    if (listenerInitPromise) {
      await listenerInitPromise;
      return;
    }

    listenerInitPromise = (async () => {
      const unlisteners: UnlistenFn[] = [];

      // Listen for PTY output from swarm agents
      const unlisten1 = await listen<{ pane_id: string; data: number[] }>('pty_output', (event) => {
        const { pane_id, data } = event.payload;
        if (!pane_id.startsWith('swarm-')) return;

        const text = new TextDecoder().decode(new Uint8Array(data));
        set((s) => {
          const next = new Map(s.outputBuffers);
          const existing = next.get(pane_id) ?? '';
          let updated = existing + text;
          // Rolling buffer: keep last OUTPUT_BUFFER_MAX chars
          if (updated.length > OUTPUT_BUFFER_MAX) {
            updated = updated.slice(updated.length - OUTPUT_BUFFER_MAX);
          }
          next.set(pane_id, updated);
          return { outputBuffers: next };
        });
      });
      unlisteners.push(unlisten1);

      // Listen for PTY exit events from swarm agents
      const unlisten2 = await listen<{ pane_id: string; exit_code: number | null }>('pty_exit', (event) => {
        const { pane_id, exit_code } = event.payload;
        if (!pane_id.startsWith('swarm-')) return;

        const state = get();
        // Find which agent this belongs to
        for (const [runId, agentList] of state.agents) {
          const agent = agentList.find((a) => a.pane_id === pane_id);
          if (!agent) continue;
          if (agent.status !== 'running' && agent.status !== 'pending') break;

          const exitKey = `${runId}:${agent.id}`;
          if (processedAgentExits.has(exitKey)) break;
          processedAgentExits.add(exitKey);

          const newStatus = (exit_code === 0 || exit_code === null) ? 'completed' : 'failed';
          const rawOutput = state.outputBuffers.get(pane_id) ?? '';
          const outputSummary = rawOutput ? stripAnsi(rawOutput).slice(-4096) : null;

          const updatedAgent: SwarmAgent = {
            ...agent,
            status: newStatus,
            exit_code: exit_code,
            output_summary: outputSummary,
            completed_at: new Date().toISOString(),
          };

          // Persist agent update
          void invoke('save_swarm_agent', { agent: updatedAgent });

          // Update agents in store
          set((s) => {
            const nextAgents = new Map(s.agents);
            const list = nextAgents.get(runId) ?? [];
            nextAgents.set(runId, list.map((a) => (a.id === agent.id ? updatedAgent : a)));
            return { agents: nextAgents };
          });

          // Post a mailbox message about completion
          const statusLabel = newStatus === 'completed' ? 'completed successfully' : `failed (exit code: ${exit_code})`;
          void get().postMessage(runId, agent.role, `Agent ${statusLabel}.${outputSummary ? `\n\nOutput (last 500 chars):\n${outputSummary.slice(-500)}` : ''}`);

          // Try to advance workflow (spawns next steps if any are ready)
          const runSteps = get().workflowSteps.get(runId) ?? [];
          if (runSteps.length > 0) {
            // Workflow run — use engine to advance
            void invoke<SwarmAgent[]>('swarm_advance_run', {
              runId,
              completedAgentPaneId: pane_id,
              exitCode: exit_code,
              outputSummary: outputSummary,
            }).then((newAgents) => {
              if (newAgents.length > 0) {
                set((s) => {
                  const nextAgents = new Map(s.agents);
                  const list = nextAgents.get(runId) ?? [];
                  nextAgents.set(runId, [...list, ...newAgents]);
                  const workspaceId = s.runWorkspaceIds.get(runId);
                  const sourcePaneId = s.runSourcePaneIds.get(runId) ?? null;
                  const projectPath = s.runs.find((r) => r.id === runId)?.project_path;
                  const pendingAgentPanes = workspaceId && projectPath
                    ? [
                        ...s.pendingAgentPanes,
                        ...newAgents.map((agent) => ({ agent, workspaceId, sourcePaneId, projectPath })),
                      ]
                    : s.pendingAgentPanes;
                  return { agents: nextAgents, pendingAgentPanes };
                });
              }
              // Reload run state to get updated status
              void get().loadAgents(runId);
              void get().loadWorkflowSteps(runId);
              const projectPath = get().runs.find((r) => r.id === runId)?.project_path;
              if (projectPath) {
                void get().loadRuns(projectPath);
              }
            }).catch((e) => console.error('Failed to advance workflow', e));
          } else {
            // Non-workflow run — check if all agents done
            const updatedList = (get().agents.get(runId) ?? []);
            const allDone = updatedList.every((a) => a.status === 'completed' || a.status === 'failed' || a.status === 'cancelled');
            if (allDone) {
              const anyFailed = updatedList.some((a) => a.status === 'failed');
              void get().updateRunStatus(runId, anyFailed ? 'Failed' : 'Completed', null);
            }
          }

          break;
        }
      });
      unlisteners.push(unlisten2);

      set({ _unlisteners: unlisteners });
    })();

    try {
      await listenerInitPromise;
    } finally {
      listenerInitPromise = null;
    }
  },

  cleanup: () => {
    get()._unlisteners.forEach((fn) => fn());
    set({ _unlisteners: [] });
  },

  loadRuns: async (projectPath) => {
    try {
      const runs = await invoke<SwarmRun[]>('load_swarm_runs', { projectPath });
      set({ runs });
    } catch (e) {
      console.error('Failed to load swarm runs', e);
    }
  },

  loadMessages: async (swarmRunId) => {
    try {
      const msgs = await invoke<MailboxMessage[]>('load_mailbox_messages', { swarmRunId });
      set((s) => {
        const next = new Map(s.messages);
        next.set(swarmRunId, msgs);
        return { messages: next };
      });
    } catch (e) {
      console.error('Failed to load mailbox messages', e);
    }
  },

  loadAgents: async (swarmRunId) => {
    try {
      const agents = await invoke<SwarmAgent[]>('load_swarm_agents', { swarmRunId });
      set((s) => {
        const next = new Map(s.agents);
        next.set(swarmRunId, agents);
        return { agents: next };
      });
    } catch (e) {
      console.error('Failed to load swarm agents', e);
    }
  },

  startRun: async (task, projectPath) => {
    const run: SwarmRun = {
      id: crypto.randomUUID(),
      task_id: task.id,
      project_path: projectPath,
      status: 'Initializing',
      current_role: null,
      prompt: task.description ?? task.title,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await invoke('save_swarm_run', { run });
    set((s) => ({ runs: [run, ...s.runs], activeRunId: run.id }));
    return run;
  },

  startAdHocRun: async (projectPath, prompt, workspaceId, sourcePaneId) => {
    const run: SwarmRun = {
      id: crypto.randomUUID(),
      task_id: null,
      project_path: projectPath,
      status: 'Initializing',
      current_role: null,
      prompt: prompt ?? null,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await invoke('save_swarm_run', { run });
    set((s) => {
      const runWorkspaceIds = new Map(s.runWorkspaceIds);
      const runSourcePaneIds = new Map(s.runSourcePaneIds);
      if (workspaceId) {
        runWorkspaceIds.set(run.id, workspaceId);
      }
      runSourcePaneIds.set(run.id, sourcePaneId ?? null);
      return { runs: [run, ...s.runs], activeRunId: run.id, runWorkspaceIds, runSourcePaneIds };
    });
    return run;
  },

  updateRunStatus: async (runId, status, currentRole) => {
    const existing = get().runs.find((r) => r.id === runId);
    if (!existing) return;

    const updated: SwarmRun = {
      ...existing,
      status,
      current_role: currentRole,
      updated_at: new Date().toISOString(),
    };
    await invoke('save_swarm_run', { run: updated });
    set((s) => ({
      runs: s.runs.map((r) => (r.id === runId ? updated : r)),
    }));
  },

  postMessage: async (swarmRunId, senderRole, content) => {
    const msg: MailboxMessage = {
      id: crypto.randomUUID(),
      swarm_run_id: swarmRunId,
      sender_role: senderRole,
      content,
      created_at: new Date().toISOString(),
    };
    await invoke('save_mailbox_message', { message: msg });
    set((s) => {
      const next = new Map(s.messages);
      const existing = next.get(swarmRunId) ?? [];
      next.set(swarmRunId, [...existing, msg]);
      return { messages: next };
    });
  },

  setActiveRun: (runId) => set({ activeRunId: runId }),

  consumePendingAgentPane: (paneId) => {
    set((s) => ({
      pendingAgentPanes: s.pendingAgentPanes.filter((item) => item.agent.pane_id !== paneId),
    }));
  },

  deleteRun: async (runId) => {
    try {
      await invoke('delete_swarm_run', { runId });
      set((s) => {
        const nextAgents = new Map(s.agents);
        nextAgents.delete(runId);
        const nextMessages = new Map(s.messages);
        nextMessages.delete(runId);
        const nextSteps = new Map(s.workflowSteps);
        nextSteps.delete(runId);
        const nextWorkspaceIds = new Map(s.runWorkspaceIds);
        nextWorkspaceIds.delete(runId);
        const nextSourcePaneIds = new Map(s.runSourcePaneIds);
        nextSourcePaneIds.delete(runId);
        return {
          runs: s.runs.filter((r) => r.id !== runId),
          agents: nextAgents,
          messages: nextMessages,
          workflowSteps: nextSteps,
          runWorkspaceIds: nextWorkspaceIds,
          runSourcePaneIds: nextSourcePaneIds,
          pendingAgentPanes: s.pendingAgentPanes.filter((item) => item.agent.swarm_run_id !== runId),
          activeRunId: s.activeRunId === runId ? null : s.activeRunId,
        };
      });
    } catch (e) {
      console.error('Failed to delete swarm run', e);
    }
  },

  spawnAgent: async (runId, presetId, prompt, cwd, taskTitle, taskDescription) => {
    const agent = await invoke<SwarmAgent>('swarm_spawn_agent', {
      runId,
      presetId,
      prompt,
      cwd,
      env: null,
      taskTitle: taskTitle ?? null,
      taskDescription: taskDescription ?? null,
    });

    set((s) => {
      const nextAgents = new Map(s.agents);
      const list = nextAgents.get(runId) ?? [];
      nextAgents.set(runId, [...list, agent]);
      const nextOutputBuffers = new Map(s.outputBuffers);
      nextOutputBuffers.set(agent.pane_id, '');
      const workspaceId = s.runWorkspaceIds.get(runId);
      const sourcePaneId = s.runSourcePaneIds.get(runId) ?? null;
      const projectPath = s.runs.find((r) => r.id === runId)?.project_path;
      const pendingAgentPanes = workspaceId && projectPath
        ? [...s.pendingAgentPanes, { agent, workspaceId, sourcePaneId, projectPath }]
        : s.pendingAgentPanes;

      // Also update the run status to Running
      const nextRuns = s.runs.map((r) =>
        r.id === runId ? { ...r, status: 'Running' as SwarmStatus, current_role: agent.role } : r,
      );

      return { agents: nextAgents, outputBuffers: nextOutputBuffers, pendingAgentPanes, runs: nextRuns };
    });

    return agent;
  },

  killAgent: async (agentId) => {
    await invoke('swarm_kill_agent', { agentId });

    set((s) => {
      const nextAgents = new Map(s.agents);
      for (const [runId, list] of nextAgents) {
        const updated = list.map((a) =>
          a.id === agentId ? { ...a, status: 'cancelled' as const, completed_at: new Date().toISOString() } : a,
        );
        nextAgents.set(runId, updated);
      }
      return { agents: nextAgents };
    });
  },

  restartAgent: async (agent, cwd) => {
    // Kill existing if still running
    if (agent.status === 'running') {
      await get().killAgent(agent.id);
    }

    // Spawn a new agent with the same preset
    return get().spawnAgent(
      agent.swarm_run_id,
      agent.preset_id ?? '',
      null,
      cwd,
    );
  },

  saveWorkflowSteps: async (runId, steps) => {
    await invoke('save_workflow_steps', { steps });
    set((s) => {
      const next = new Map(s.workflowSteps);
      next.set(runId, steps);
      return { workflowSteps: next };
    });
  },

  loadWorkflowSteps: async (runId) => {
    try {
      const steps = await invoke<WorkflowStep[]>('load_workflow_steps', { swarmRunId: runId });
      set((s) => {
        const next = new Map(s.workflowSteps);
        next.set(runId, steps);
        return { workflowSteps: next };
      });
    } catch (e) {
      console.error('Failed to load workflow steps', e);
    }
  },
}));
