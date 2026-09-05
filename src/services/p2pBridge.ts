import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../state/workspaceStore';
import { useTaskStore } from '../state/taskStore';
import { useSwarmStore } from '../state/swarmStore';
import type { RelayConnectionStatus, RelaySessionInfo, RelayPeerInfo } from '../types/relay';

type StatusListener = (status: RelayConnectionStatus) => void;
type PeerListener = (peers: RelayPeerInfo[]) => void;
type SessionListener = (session: RelaySessionInfo | null) => void;

const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export class P2PBridge {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private status: RelayConnectionStatus = 'disconnected';
  private session: RelaySessionInfo | null = null;
  private peers: RelayPeerInfo[] = [];
  private signalingUrl: string = 'https://signaling-taupe.vercel.app';
  private activePaneId: string | null = null;
  private pollTimer: number | null = null;
  private pingTimer: number | null = null;
  private latencyMs: number | null = null;
  private terminalBuffers = new Map<string, string>();
  private terminalDimensions = new Map<string, { cols: number; rows: number }>();

  private statusListeners = new Set<StatusListener>();
  private peerListeners = new Set<PeerListener>();
  private sessionListeners = new Set<SessionListener>();

  constructor() {
    const saved = localStorage.getItem('turbine_signaling_url');
    if (saved) {
      this.signalingUrl = saved;
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

  public getSignalingUrl(): string {
    return this.signalingUrl;
  }

  public setSignalingUrl(url: string) {
    this.signalingUrl = url.trim().replace(/\/+$/, '');
    localStorage.setItem('turbine_signaling_url', this.signalingUrl);
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
   * Initialize WebRTC PeerConnection, create DataChannel & Offer, and register with Vercel signaling.
   */
  public async connect(customSignalingUrl?: string): Promise<RelaySessionInfo> {
    if (customSignalingUrl) {
      this.setSignalingUrl(customSignalingUrl);
    }
    this.disconnect();
    this.setStatus('connecting');

    try {
      const pc = new RTCPeerConnection({ iceServers: DEFAULT_STUN_SERVERS });
      this.pc = pc;

      // Create P2P DataChannel
      const dc = pc.createDataChannel('turbine-p2p', { ordered: true });
      this.dc = dc;
      this.setupDataChannel(dc);

      // Collect local ICE candidates
      const localCandidates: RTCIceCandidateInit[] = [];
      const icePromise = new Promise<void>((resolve) => {
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            localCandidates.push(event.candidate.toJSON());
          } else {
            // ICE gathering complete
            resolve();
          }
        };
      });

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait up to 1 second for ICE gathering or proceed
      await Promise.race([icePromise, new Promise((r) => setTimeout(r, 1200))]);

      // Post offer to Vercel serverless signaling endpoint
      const resp = await fetch(`${this.signalingUrl}/api/pair/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer: pc.localDescription,
          candidates: localCandidates,
        }),
      });

      if (!resp.ok) {
        throw new Error(`Signaling error: ${resp.statusText}`);
      }

      const result = await resp.json();
      const sessionInfo: RelaySessionInfo = {
        sessionId: result.code,
        pairingCode: result.code,
        token: result.token,
        relayUrl: this.signalingUrl,
        region: 'P2P (WebRTC)',
        expiresAt: result.expiresAt,
      };

      this.setSession(sessionInfo);

      // Start polling Vercel signaling for mobile answer
      this.startPollingAnswer(sessionInfo.pairingCode);

      return sessionInfo;
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  private setupDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => {
      this.stopPollingAnswer();
      this.setStatus('connected');
      this.setPeers([{ role: 'mobile', deviceName: 'Direct Phone (P2P)', timestamp: Date.now() }]);
      this.syncFullState();

      // Start direct P2P ping/pong latency measurement
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        this.send('ping', { clientTime: Date.now() });
      }, 4000);
      this.send('ping', { clientTime: Date.now() });
    };

    dc.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    dc.onclose = () => {
      this.setStatus('disconnected');
      this.setPeers([]);
      this.latencyMs = null;
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
    };

    dc.onerror = () => {
      this.setStatus('error');
    };
  }

  private startPollingAnswer(code: string) {
    this.stopPollingAnswer();

    const checkAnswer = async () => {
      if (!this.pc || this.status === 'connected') return;

      try {
        const resp = await fetch(`${this.signalingUrl}/api/pair/${code}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.answer && this.pc && !this.pc.currentRemoteDescription) {
            await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));

            if (Array.isArray(data.answerCandidates)) {
              for (const cand of data.answerCandidates) {
                try {
                  await this.pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch {}
              }
            }
          }
        }
      } catch {}
    };

    this.pollTimer = window.setInterval(checkAnswer, 1500);
    checkAnswer();
  }

  private stopPollingAnswer() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public disconnect() {
    this.stopPollingAnswer();
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.setStatus('disconnected');
    this.setPeers([]);
    this.latencyMs = null;
  }

  public send(type: string, payload: unknown) {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
    }
  }

  public setTerminalDimensions(paneId: string, cols: number, rows: number) {
    this.terminalDimensions.set(paneId, { cols, rows });
    this.send('terminal:resize', { paneId, cols, rows });
  }

  public getTerminalDimensions(paneId: string): { cols: number; rows: number } | undefined {
    return this.terminalDimensions.get(paneId);
  }

  public getReplayBuffer(paneId: string): string {
    return this.terminalBuffers.get(paneId) || '';
  }

  public sendTerminalOutput(paneId: string, data: string) {
    const cur = this.terminalBuffers.get(paneId) || '';
    const updated = (cur + data).slice(-256 * 1024);
    this.terminalBuffers.set(paneId, updated);

    if (this.peers.length === 0) return;
    this.send('terminal:output', { paneId, data });
  }

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

    for (const [pId, dims] of this.terminalDimensions.entries()) {
      const buf = this.terminalBuffers.get(pId) || '';
      this.send('terminal:sync', {
        paneId: pId,
        cols: dims.cols,
        rows: dims.rows,
        buffer: buf,
      });
    }
  }

  private async handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case 'terminal:request_sync': {
          const { paneId } = msg.payload || {};
          const targetPane = paneId || this.activePaneId;
          if (targetPane) {
            const dims = this.terminalDimensions.get(targetPane) || { cols: 80, rows: 24 };
            const buf = this.terminalBuffers.get(targetPane) || '';
            this.send('terminal:sync', {
              paneId: targetPane,
              cols: dims.cols,
              rows: dims.rows,
              buffer: buf,
            });
          }
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
            this.terminalDimensions.set(targetPane, { cols, rows });
            await invoke('pty_resize', { paneId: targetPane, cols, rows });
          }
          break;
        }

        case 'terminal:switch_pane': {
          const { paneId } = msg.payload || {};
          if (paneId) {
            this.activePaneId = paneId;
            const dims = this.terminalDimensions.get(paneId) || { cols: 80, rows: 24 };
            const buf = this.terminalBuffers.get(paneId) || '';
            this.send('terminal:sync', {
              paneId,
              cols: dims.cols,
              rows: dims.rows,
              buffer: buf,
            });
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

        case 'pong': {
          const { clientTime } = msg.payload || {};
          if (clientTime) {
            this.latencyMs = Math.max(1, Date.now() - clientTime);
            this.statusListeners.forEach((fn) => fn(this.status));
          }
          break;
        }

        case 'ping': {
          this.send('pong', { clientTime: msg.payload?.clientTime });
          break;
        }
      }
    } catch (e) {
      console.error('[P2PBridge] Failed to handle message:', e);
    }
  }
}

export const p2pBridge = new P2PBridge();
