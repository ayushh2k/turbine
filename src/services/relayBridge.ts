import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../state/workspaceStore';
import { useTaskStore } from '../state/taskStore';
import { useSwarmStore } from '../state/swarmStore';
import type { RelayConnectionStatus, RelaySessionInfo, RelayPeerInfo } from '../types/relay';

type StatusListener = (status: RelayConnectionStatus) => void;
type PeerListener = (peers: RelayPeerInfo[]) => void;
type SessionListener = (session: RelaySessionInfo | null) => void;

class RelayBridge {
  private socket: WebSocket | null = null;
  private status: RelayConnectionStatus = 'disconnected';
  private session: RelaySessionInfo | null = null;
  private peers: RelayPeerInfo[] = [];
  private statusListeners = new Set<StatusListener>();
  private peerListeners = new Set<PeerListener>();
  private sessionListeners = new Set<SessionListener>();
  private activePaneId: string | null = null;
  private defaultRelayUrl: string = 'http://localhost:4448';
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private shouldReconnect: boolean = false;
  private latencyMs: number | null = null;

  constructor() {
    // Load persisted relay URL if available
    const saved = localStorage.getItem('turbine_relay_url');
    if (saved) {
      this.defaultRelayUrl = saved;
    }
  }

  public getStatus(): RelayConnectionStatus {
    return this.status;
  }

  public getSession(): RelaySessionInfo | null {
    return this.session;
  }

  public getLatency(): number | null {
    return this.latencyMs;
  }

  public getPeers(): RelayPeerInfo[] {
    return this.peers;
  }

  public getRelayUrl(): string {
    return this.defaultRelayUrl;
  }

  public setRelayUrl(url: string) {
    this.defaultRelayUrl = url.trim().replace(/\/+$/, '');
    localStorage.setItem('turbine_relay_url', this.defaultRelayUrl);
  }

  public setActivePaneId(paneId: string | null) {
    this.activePaneId = paneId;
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public onPeersChange(listener: PeerListener): () => void {
    this.peerListeners.add(listener);
    listener(this.peers);
    return () => this.peerListeners.delete(listener);
  }

  public onSessionChange(listener: SessionListener): () => void {
    this.sessionListeners.add(listener);
    listener(this.session);
    return () => this.sessionListeners.delete(listener);
  }

  private setStatus(status: RelayConnectionStatus) {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  private setSession(session: RelaySessionInfo | null) {
    this.session = session;
    this.sessionListeners.forEach((fn) => fn(session));
  }

  private setPeers(peers: RelayPeerInfo[]) {
    this.peers = peers;
    this.peerListeners.forEach((fn) => fn(peers));
  }

  /**
   * Connect to the relay server and register a session.
   */
  public async connect(customUrl?: string): Promise<RelaySessionInfo> {
    if (customUrl) {
      this.setRelayUrl(customUrl);
    }
    this.disconnect();
    this.shouldReconnect = true;
    this.setStatus('connecting');

    const baseUrl = this.defaultRelayUrl;
    // Generate or reuse session ID and token
    const sessionId = 'sess_' + Math.random().toString(36).substring(2, 11);
    const token = 'tok_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    try {
      const httpUrl = baseUrl.replace(/^ws/, 'http');
      const resp = await fetch(`${httpUrl}/api/sessions/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          token,
          machineName: 'Turbine Desktop',
        }),
      });

      if (!resp.ok) {
        throw new Error(`Failed to register session: ${resp.statusText}`);
      }

      const registered = await resp.json();
      const sessionInfo: RelaySessionInfo = {
        sessionId: registered.sessionId,
        pairingCode: registered.pairingCode,
        token: registered.token,
        relayUrl: baseUrl,
        expiresAt: registered.expiresAt,
      };

      this.setSession(sessionInfo);
      this.connectWebSocket(sessionInfo);
      return sessionInfo;
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  private connectWebSocket(session: RelaySessionInfo) {
    const wsBaseUrl = session.relayUrl.replace(/^http/, 'ws');
    const wsUrl = `${wsBaseUrl}/ws?role=desktop&session=${session.sessionId}&token=${session.token}&name=Desktop`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.setStatus('connected');
        this.syncFullState();
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => {
          this.send('ping', { clientTime: Date.now() });
        }, 5000);
        this.send('ping', { clientTime: Date.now() });
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.socket.onclose = () => {
        this.setStatus('disconnected');
        this.setPeers([]);
        this.latencyMs = null;
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = () => {
        this.setStatus('error');
      };
    } catch {
      this.setStatus('error');
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      if (this.session && this.shouldReconnect) {
        this.connectWebSocket(this.session);
      }
    }, 5000);
  }

  public disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('disconnected');
    this.setPeers([]);
    this.latencyMs = null;
  }

  /**
   * Send arbitrary message over relay WebSocket.
   */
  public send(type: string, payload: unknown) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
    }
  }

  /**
   * Broadcast terminal output chunk to connected mobile companion(s).
   */
  public sendTerminalOutput(paneId: string, data: string) {
    if (this.peers.length === 0) return;
    this.send('terminal:output', { paneId, data });
  }

  /**
   * Broadcast full desktop state snapshot to mobile clients.
   */
  public syncFullState() {
    const wsState = useWorkspaceStore.getState();
    const taskState = useTaskStore.getState();
    const swarmState = useSwarmStore.getState();

    this.send('state:sync', {
      workspaces: wsState.workspaces,
      activeWorkspaceId: wsState.activeWorkspaceId,
      tasks: taskState.tasks,
      swarmRuns: swarmState.runs,
      swarmAgents: swarmState.agents,
      activePaneId: this.activePaneId,
    });
  }

  /**
   * Handle incoming message from mobile client.
   */
  private async handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case 'relay:peer_joined': {
          const peer = msg.payload as RelayPeerInfo;
          if (peer.role === 'mobile') {
            this.setPeers([...this.peers, peer]);
            // Instantly sync state with new peer
            this.syncFullState();
          }
          break;
        }

        case 'relay:peer_left': {
          this.setPeers(this.peers.filter((p) => p.role !== 'mobile'));
          break;
        }

        case 'terminal:input': {
          const { paneId, data } = msg.payload || {};
          const targetPane = paneId || this.activePaneId;
          if (targetPane && typeof data === 'string') {
            const encoder = new TextEncoder();
            await invoke('pty_write', {
              paneId: targetPane,
              data: Array.from(encoder.encode(data)),
            });
          }
          break;
        }

        case 'terminal:resize': {
          const { paneId, cols, rows } = msg.payload || {};
          const targetPane = paneId || this.activePaneId;
          if (targetPane && cols && rows) {
            await invoke('pty_resize', { paneId: targetPane, cols, rows });
          }
          break;
        }

        case 'terminal:switch_pane': {
          const { paneId } = msg.payload || {};
          if (paneId) {
            this.activePaneId = paneId;
          }
          break;
        }

        case 'workspace:switch': {
          const { workspaceId } = msg.payload || {};
          if (workspaceId) {
            useWorkspaceStore.getState().switchWorkspace(workspaceId);
            this.send('workspace:changed', { activeWorkspaceId: workspaceId });
          }
          break;
        }

        case 'task:update_status': {
          const { id, status } = msg.payload || {};
          if (id && status) {
            const taskStore = useTaskStore.getState();
            const existing = taskStore.tasks.find((t) => t.id === id);
            if (existing) {
              await taskStore.updateTask({ ...existing, status });
              this.send('task:updated', { tasks: useTaskStore.getState().tasks });
            }
          }
          break;
        }

        case 'task:create': {
          const { title, projectPath } = msg.payload || {};
          if (title) {
            await useTaskStore.getState().createTask(projectPath || '.', title);
            this.send('task:updated', { tasks: useTaskStore.getState().tasks });
          }
          break;
        }

        case 'diff:request': {
          const { projectPath } = msg.payload || {};
          try {
            const diff = await invoke<string>('get_git_diff', { projectPath: projectPath || '.' });
            this.send('diff:data', { projectPath: projectPath || '.', diff });
          } catch {
            this.send('diff:data', { projectPath: projectPath || '.', diff: 'Unable to load git diff' });
          }
          break;
        }

        case 'swarm:start': {
          const { prompt } = msg.payload || {};
          if (prompt) {
            const swarm = useSwarmStore.getState();
            await swarm.startAdHocRun('.', prompt);
            this.send('swarm:updated', {
              runs: useSwarmStore.getState().runs,
              agents: useSwarmStore.getState().agents,
            });
          }
          break;
        }

        case 'relay:connected': {
          const { region } = msg.payload || {};
          if (region && this.session) {
            this.session.region = region;
            this.setSession({ ...this.session });
          }
          break;
        }

        case 'pong': {
          const { clientTime, region } = msg.payload || {};
          if (clientTime) {
            this.latencyMs = Math.max(1, Date.now() - clientTime);
          }
          if (region && this.session && this.session.region !== region) {
            this.session.region = region;
            this.setSession({ ...this.session });
          }
          this.statusListeners.forEach((fn) => fn(this.status));
          break;
        }

        case 'ping': {
          this.send('pong', { timestamp: Date.now() });
          break;
        }
      }
    } catch (e) {
      console.error('[RelayBridge] Failed to handle message:', e);
    }
  }
}

export const relayBridge = new RelayBridge();
