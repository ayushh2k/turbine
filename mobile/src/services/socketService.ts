import type { Workspace, Task, SwarmRun, SwarmAgent, ConnectionStatus } from '../types';
import { getWebRTCBridge } from './WebRTCBridgeView';

type Listener = () => void;

export class SocketService {
  private pc: any | null = null;
  private dc: any | null = null;
  private status: ConnectionStatus = 'disconnected';
  private errorMessage: string | null = null;

  public workspaces: Workspace[] = [];
  public activeWorkspaceId: string = '';
  public tasks: Task[] = [];
  public swarmRuns: SwarmRun[] = [];
  public swarmAgents: SwarmAgent[] = [];
  public gitDiff: string = '';
  public focusedPaneId: string | null = null;
  public paneOutputs: Map<string, string> = new Map();
  public currentServerUrl: string = 'https://signaling-taupe.vercel.app';
  public connectionMode: 'p2p' = 'p2p';
  public region: string = 'P2P Direct (DTLS Encrypted)';
  public latencyMs: number | null = null;

  private listeners: Set<Listener> = new Set();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public notify() {
    this.listeners.forEach((fn) => fn());
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  public setStatus(status: ConnectionStatus, latency?: number) {
    this.status = status;
    if (latency !== undefined) {
      this.latencyMs = latency;
    }
    if (status === 'connected') {
      this.errorMessage = null;
    }
    this.notify();
  }

  public setErrorMessage(err: string) {
    this.errorMessage = err;
    this.status = 'error';
    this.notify();
  }

  /**
   * Connect directly via WebRTC DataChannel.
   * Prioritizes the iOS WebKit WebView bridge (works in Expo Go),
   * and falls back to native RTCPeerConnection (in production native APK/IPA builds).
   */
  public async connectP2P({
    signalingUrl,
    pairingCode,
  }: {
    signalingUrl: string;
    pairingCode: string;
  }): Promise<void> {
    this.disconnect();
    this.status = 'connecting';
    this.errorMessage = null;
    this.currentServerUrl = signalingUrl.trim().replace(/\/+$/, '');
    this.notify();

    const bridge = getWebRTCBridge();
    if (bridge) {
      // Use native WebKit WebRTC engine
      bridge.connect(this.currentServerUrl, pairingCode.trim().toUpperCase());
      return;
    }

    // Fallback for native runtime with global RTCPeerConnection
    const RTCPC = typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : (globalThis as any).RTCPeerConnection;
    if (!RTCPC) {
      throw new Error('WebRTC bridge is initializing. Please tap Connect again.');
    }

    const code = pairingCode.trim().toUpperCase();
    const resp = await fetch(`${this.currentServerUrl}/api/pair/${code}`);
    if (!resp.ok) {
      throw new Error('Pairing code not found or expired on signaling server');
    }

    const data = await resp.json();
    if (!data.offer) {
      throw new Error('No SDP offer found for code: ' + code);
    }

    const pc = new RTCPC({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    this.pc = pc;

    const localCandidates: any[] = [];
    const icePromise = new Promise<void>((resolve) => {
      pc.onicecandidate = (event: any) => {
        if (event.candidate) {
          localCandidates.push(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
        } else {
          resolve();
        }
      };
      setTimeout(resolve, 2000);
    });

    pc.ondatachannel = (event: any) => {
      const dc = event.channel;
      this.dc = dc;

      dc.onopen = () => {
        this.status = 'connected';
        this.errorMessage = null;
        this.startPing();
        this.notify();
      };

      dc.onmessage = (msgEvent: any) => {
        this.handleMessage(msgEvent.data);
      };

      dc.onclose = () => {
        this.status = 'disconnected';
        this.stopPing();
        this.notify();
      };

      dc.onerror = () => {
        this.status = 'error';
        this.notify();
      };
    };

    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await icePromise;

    await fetch(`${this.currentServerUrl}/api/pair/${code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answer: pc.localDescription,
        candidates: localCandidates,
      }),
    });
  }

  public disconnect() {
    this.stopPing();
    const bridge = getWebRTCBridge();
    if (bridge) {
      bridge.disconnect();
    }
    if (this.dc) {
      try { this.dc.close(); } catch {}
      this.dc = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch {}
      this.pc = null;
    }
    this.status = 'disconnected';
    this.notify();
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send('ping', { clientTime: Date.now() });
    }, 4000);
    this.send('ping', { clientTime: Date.now() });
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public send(type: string, payload: unknown) {
    const serialized = JSON.stringify({ type, payload, timestamp: Date.now() });
    const bridge = getWebRTCBridge();
    if (bridge) {
      bridge.send(serialized);
    } else if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(serialized);
    }
  }

  // --- Commands ---

  public sendTerminalInput(paneId: string, data: string) {
    this.send('terminal:input', { paneId, data });
  }

  public sendTerminalResize(paneId: string, cols: number, rows: number) {
    this.send('terminal:resize', { paneId, cols, rows });
  }

  public switchWorkspace(workspaceId: string) {
    this.activeWorkspaceId = workspaceId;
    this.send('workspace:switch', { workspaceId });
    this.notify();
  }

  public triggerSwarm(prompt: string) {
    this.send('swarm:start', { prompt });
  }

  public updateTaskStatus(id: string, status: string) {
    this.tasks = this.tasks.map((t) => (t.id === id ? { ...t, status } : t));
    this.send('task:update_status', { id, status });
    this.notify();
  }

  public createTask(title: string, projectPath?: string) {
    this.send('task:create', { title, projectPath: projectPath || '.' });
  }

  public requestDiff(projectPath: string = '.') {
    this.send('diff:request', { projectPath });
  }

  public setFocusedPane(paneId: string | null) {
    this.focusedPaneId = paneId;
    if (paneId) {
      this.send('terminal:switch_pane', { paneId });
    }
    this.notify();
  }

  public getPaneOutput(paneId: string): string {
    return this.paneOutputs.get(paneId) || '';
  }

  public clearPaneOutput(paneId: string) {
    this.paneOutputs.set(paneId, '');
    this.notify();
  }

  // --- Message Ingestion ---

  public handleMessage(rawData: string) {
    try {
      const msg = JSON.parse(rawData);
      switch (msg.type) {
        case 'pong': {
          const { clientTime } = msg.payload || {};
          if (clientTime) {
            this.latencyMs = Math.max(1, Date.now() - clientTime);
          }
          this.notify();
          break;
        }

        case 'state:sync': {
          const { workspaces, activeWorkspaceId, tasks, swarmRuns, swarmAgents, activePaneId } =
            msg.payload || {};
          if (workspaces) this.workspaces = workspaces;
          if (activeWorkspaceId) this.activeWorkspaceId = activeWorkspaceId;
          if (tasks) this.tasks = tasks;
          if (swarmRuns) this.swarmRuns = swarmRuns;
          if (swarmAgents) this.swarmAgents = swarmAgents;
          if (activePaneId && !this.focusedPaneId) this.focusedPaneId = activePaneId;
          this.notify();
          break;
        }

        case 'terminal:output': {
          const { paneId, data } = msg.payload || {};
          if (paneId && data) {
            const current = this.paneOutputs.get(paneId) || '';
            const updated = (current + data).slice(-100000);
            this.paneOutputs.set(paneId, updated);
            this.notify();
          }
          break;
        }

        case 'workspace:changed': {
          const { activeWorkspaceId } = msg.payload || {};
          if (activeWorkspaceId) {
            this.activeWorkspaceId = activeWorkspaceId;
            this.notify();
          }
          break;
        }

        case 'task:updated': {
          const { tasks } = msg.payload || {};
          if (tasks) {
            this.tasks = tasks;
            this.notify();
          }
          break;
        }

        case 'swarm:updated': {
          const { runs, agents } = msg.payload || {};
          if (runs) this.swarmRuns = runs;
          if (agents) this.swarmAgents = agents;
          this.notify();
          break;
        }

        case 'diff:data': {
          const { diff } = msg.payload || {};
          this.gitDiff = diff || '';
          this.notify();
          break;
        }
      }
    } catch (e) {
      console.warn('[SocketService] Parse error:', e);
    }
  }
}

export const socketService = new SocketService();
