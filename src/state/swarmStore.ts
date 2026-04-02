import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { SwarmRun, MailboxMessage, SwarmStatus, Task } from '../types';

interface SwarmState {
  runs: SwarmRun[];
  messages: Map<string, MailboxMessage[]>; // swarm_run_id → messages
  activeRunId: string | null;

  loadRuns: (projectPath: string) => Promise<void>;
  loadMessages: (swarmRunId: string) => Promise<void>;

  /**
   * Start a new swarm run for a task. Creates the run record,
   * then returns the run so the caller can spawn panes per role.
   */
  startRun: (task: Task, projectPath: string) => Promise<SwarmRun>;

  /**
   * Advance the swarm to the next role, or mark completed/failed.
   */
  updateRunStatus: (runId: string, status: SwarmStatus, currentRole: string | null) => Promise<void>;

  /**
   * Post a message from an agent role into the swarm mailbox.
   */
  postMessage: (swarmRunId: string, senderRole: string, content: string) => Promise<void>;

  setActiveRun: (runId: string | null) => void;
}

export const useSwarmStore = create<SwarmState>((set, get) => ({
  runs: [],
  messages: new Map(),
  activeRunId: null,

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

  startRun: async (task, projectPath) => {
    const run: SwarmRun = {
      id: crypto.randomUUID(),
      task_id: task.id,
      project_path: projectPath,
      status: 'Initializing',
      current_role: null,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await invoke('save_swarm_run', { run });
    set((s) => ({ runs: [run, ...s.runs], activeRunId: run.id }));
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
}));
