import type { WebSocket } from 'ws';
import type { ClientRole, RegisterSessionResponse } from './types.js';

export interface ActiveClient {
  role: ClientRole;
  socket: WebSocket;
  deviceName?: string;
  connectedAt: number;
}

export interface Session {
  id: string;
  pairingCode: string;
  token: string;
  machineName?: string;
  createdAt: number;
  expiresAt: number;
  desktop?: ActiveClient;
  mobiles: Map<WebSocket, ActiveClient>;
}

export class SessionStore {
  private sessions = new Map<string, Session>();
  private codeToSessionId = new Map<string, string>();
  private socketToSession = new Map<WebSocket, { sessionId: string; role: ClientRole }>();

  /**
   * Generate a random 6-character alphanumeric pairing code (e.g. TRB-482).
   */
  private generatePairingCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude 0, O, 1, I to prevent human error
    let code = 'TRB-';
    for (let i = 0; i < 3; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Register or update a desktop session.
   */
  registerSession(
    sessionId: string,
    token: string,
    machineName?: string,
    ttlMs: number = 24 * 60 * 60 * 1000 // 24 hours
  ): RegisterSessionResponse {
    let session = this.sessions.get(sessionId);
    const now = Date.now();

    if (!session) {
      let pairingCode = this.generatePairingCode();
      while (this.codeToSessionId.has(pairingCode)) {
        pairingCode = this.generatePairingCode();
      }

      session = {
        id: sessionId,
        pairingCode,
        token,
        machineName,
        createdAt: now,
        expiresAt: now + ttlMs,
        mobiles: new Map(),
      };

      this.sessions.set(sessionId, session);
      this.codeToSessionId.set(pairingCode, sessionId);
    } else {
      session.token = token;
      session.machineName = machineName || session.machineName;
      session.expiresAt = now + ttlMs;
    }

    return {
      sessionId: session.id,
      pairingCode: session.pairingCode,
      token: session.token,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Resolve session by ID or pairing code.
   */
  getSession(identifier: string): Session | undefined {
    // Try by ID first
    let session = this.sessions.get(identifier);
    if (!session) {
      // Try by pairing code
      const id = this.codeToSessionId.get(identifier.toUpperCase());
      if (id) {
        session = this.sessions.get(id);
      }
    }
    return session;
  }

  /**
   * Attach desktop socket to session.
   */
  attachDesktop(sessionId: string, token: string, socket: WebSocket, machineName?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.token !== token) {
      return false;
    }

    // If an existing desktop is connected, close it gracefully
    if (session.desktop && session.desktop.socket !== socket) {
      try {
        session.desktop.socket.close(1000, 'Replaced by new desktop connection');
      } catch {}
    }

    session.desktop = {
      role: 'desktop',
      socket,
      deviceName: machineName || session.machineName,
      connectedAt: Date.now(),
    };

    this.socketToSession.set(socket, { sessionId, role: 'desktop' });

    // Notify any connected mobiles that desktop is online
    this.broadcastToMobiles(session, {
      type: 'relay:peer_joined',
      payload: { role: 'desktop', deviceName: session.desktop.deviceName, timestamp: Date.now() },
    });

    return true;
  }

  /**
   * Attach mobile socket to session.
   */
  attachMobile(
    identifier: string,
    token: string,
    socket: WebSocket,
    deviceName?: string
  ): boolean {
    const session = this.getSession(identifier);
    if (!session || session.token !== token) {
      return false;
    }

    const client: ActiveClient = {
      role: 'mobile',
      socket,
      deviceName,
      connectedAt: Date.now(),
    };

    session.mobiles.set(socket, client);
    this.socketToSession.set(socket, { sessionId: session.id, role: 'mobile' });

    // Notify desktop that a mobile joined
    if (session.desktop && session.desktop.socket.readyState === 1) {
      session.desktop.socket.send(
        JSON.stringify({
          type: 'relay:peer_joined',
          payload: { role: 'mobile', deviceName, timestamp: Date.now() },
        })
      );
    }

    return true;
  }

  /**
   * Handle socket disconnection.
   */
  handleDisconnect(socket: WebSocket): void {
    const meta = this.socketToSession.get(socket);
    if (!meta) return;

    const session = this.sessions.get(meta.sessionId);
    this.socketToSession.delete(socket);

    if (!session) return;

    if (meta.role === 'desktop') {
      if (session.desktop?.socket === socket) {
        session.desktop = undefined;
        this.broadcastToMobiles(session, {
          type: 'relay:peer_left',
          payload: { role: 'desktop', timestamp: Date.now() },
        });
      }
    } else {
      session.mobiles.delete(socket);
      if (session.desktop && session.desktop.socket.readyState === 1) {
        session.desktop.socket.send(
          JSON.stringify({
            type: 'relay:peer_left',
            payload: { role: 'mobile', timestamp: Date.now() },
          })
        );
      }
    }
  }

  /**
   * Route incoming message from one client to its counterpart(s).
   */
  routeMessage(socket: WebSocket, rawData: string): void {
    const meta = this.socketToSession.get(socket);
    if (!meta) return;

    const session = this.sessions.get(meta.sessionId);
    if (!session) return;

    if (meta.role === 'desktop') {
      // Forward desktop message to all connected mobiles
      for (const [mobileSocket] of session.mobiles) {
        if (mobileSocket.readyState === 1) {
          mobileSocket.send(rawData);
        }
      }
    } else {
      // Forward mobile message to desktop
      if (session.desktop && session.desktop.socket.readyState === 1) {
        session.desktop.socket.send(rawData);
      }
    }
  }

  private broadcastToMobiles(session: Session, message: unknown): void {
    const data = JSON.stringify(message);
    for (const [mobileSocket] of session.mobiles) {
      if (mobileSocket.readyState === 1) {
        mobileSocket.send(data);
      }
    }
  }

  /**
   * Get metadata for a session.
   */
  getSessionInfo(identifier: string) {
    const session = this.getSession(identifier);
    if (!session) return null;
    return {
      id: session.id,
      pairingCode: session.pairingCode,
      machineName: session.machineName,
      isDesktopConnected: !!session.desktop,
      connectedMobiles: session.mobiles.size,
    };
  }

  /**
   * Housekeeping: Remove expired sessions.
   */
  pruneExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now && !session.desktop && session.mobiles.size === 0) {
        this.codeToSessionId.delete(session.pairingCode);
        this.sessions.delete(id);
      }
    }
  }
}
