export type RelayConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RelaySessionInfo {
  sessionId: string;
  pairingCode: string;
  token: string;
  relayUrl: string;
  region?: string;
  expiresAt: number;
}

export interface RelayPeerInfo {
  role: 'mobile' | 'desktop';
  deviceName?: string;
  timestamp: number;
}
