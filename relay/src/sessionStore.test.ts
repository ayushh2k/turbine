import { describe, it, expect, vi } from 'vitest';
import { SessionStore } from './sessionStore.js';
import type { WebSocket } from 'ws';

function createMockSocket(): WebSocket {
  return {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
  } as unknown as WebSocket;
}

describe('SessionStore', () => {
  it('registers a new session and generates a pairing code', () => {
    const store = new SessionStore();
    const res = store.registerSession('sess_123', 'tok_abc', 'MacBook Pro');

    expect(res.sessionId).toBe('sess_123');
    expect(res.pairingCode).toMatch(/^TRB-[2-9A-HJ-NP-Z]{3}$/);
    expect(res.token).toBe('tok_abc');

    const session = store.getSession('sess_123');
    expect(session).toBeDefined();
    expect(session?.pairingCode).toBe(res.pairingCode);

    // Can also find by pairing code
    const byCode = store.getSession(res.pairingCode);
    expect(byCode?.id).toBe('sess_123');
  });

  it('attaches desktop and mobile sockets and routes messages', () => {
    const store = new SessionStore();
    const session = store.registerSession('sess_456', 'tok_secret');

    const desktopSocket = createMockSocket();
    const mobileSocket = createMockSocket();

    // Attach desktop
    const desktopAttached = store.attachDesktop('sess_456', 'tok_secret', desktopSocket, 'Desktop 1');
    expect(desktopAttached).toBe(true);

    // Attach mobile using pairing code
    const mobileAttached = store.attachMobile(session.pairingCode, 'tok_secret', mobileSocket, 'iPhone 16');
    expect(mobileAttached).toBe(true);

    // Desktop should have received notification of mobile joining
    expect(desktopSocket.send).toHaveBeenCalled();
    const joinMsg = JSON.parse((desktopSocket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(joinMsg.type).toBe('relay:peer_joined');
    expect(joinMsg.payload.role).toBe('mobile');

    // Test routing from desktop to mobile
    store.routeMessage(desktopSocket, JSON.stringify({ type: 'terminal:output', payload: { data: 'hello\n' } }));
    expect(mobileSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'terminal:output', payload: { data: 'hello\n' } })
    );

    // Test routing from mobile to desktop
    store.routeMessage(mobileSocket, JSON.stringify({ type: 'terminal:input', payload: { data: 'ls\n' } }));
    expect(desktopSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'terminal:input', payload: { data: 'ls\n' } })
    );

    // Test disconnect
    store.handleDisconnect(mobileSocket);
    const leaveCalls = (desktopSocket.send as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = JSON.parse(leaveCalls[leaveCalls.length - 1][0]);
    expect(lastCall.type).toBe('relay:peer_left');
  });

  it('rejects attachment with invalid token', () => {
    const store = new SessionStore();
    store.registerSession('sess_789', 'real_token');

    const mockSocket = createMockSocket();
    const attached = store.attachDesktop('sess_789', 'wrong_token', mockSocket);
    expect(attached).toBe(false);

    const mobileAttached = store.attachMobile('sess_789', 'wrong_token', mockSocket);
    expect(mobileAttached).toBe(false);
  });
});
