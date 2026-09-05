/**
 * Wire protocol types for Turbine Dedicated Relay and Mobile Companion.
 */

export type ClientRole = 'desktop' | 'mobile';

export interface RegisterSessionRequest {
  sessionId: string;
  token: string;
  machineName?: string;
}

export interface RegisterSessionResponse {
  sessionId: string;
  pairingCode: string;
  token: string;
  expiresAt: number;
}

export interface JoinSessionRequest {
  sessionId?: string;
  pairingCode?: string;
  token?: string;
  deviceName?: string;
}

export interface RelayMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp?: number;
}

// System notifications from relay
export interface PeerEventPayload {
  role: ClientRole;
  deviceName?: string;
  timestamp: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

// Terminal messages
export interface TerminalInputPayload {
  paneId: string;
  data: string;
}

export interface TerminalOutputPayload {
  paneId: string;
  data: string;
}

export interface TerminalResizePayload {
  paneId: string;
  cols: number;
  rows: number;
}

// Swarm messages
export interface SwarmStartPayload {
  prompt: string;
  role?: string;
  presetId?: string;
  projectPath?: string;
}

export interface SwarmKillPayload {
  runId: string;
}

// Task messages
export interface TaskUpdateStatusPayload {
  id: string;
  status: string;
}

export interface TaskCreatePayload {
  title: string;
  description?: string;
  status: string;
  projectPath: string;
}

export interface TaskRunPayload {
  taskId: string;
  prompt: string;
  presetId?: string;
}

// Diff messages
export interface DiffRequestPayload {
  projectPath: string;
}

export interface DiffDataPayload {
  projectPath: string;
  diff: string;
}
