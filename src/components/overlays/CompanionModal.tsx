import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { p2pBridge } from '../../services/p2pBridge';
import type { RelayConnectionStatus, RelaySessionInfo, RelayPeerInfo } from '../../types/relay';
import './CompanionModal.css';

interface CompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CompanionModal({ isOpen, onClose }: CompanionModalProps) {
  const [p2pStatus, setP2pStatus] = useState<RelayConnectionStatus>(p2pBridge.getStatus());
  const [p2pSession, setP2pSession] = useState<RelaySessionInfo | null>(p2pBridge.getSession());
  const [p2pPeers, setP2pPeers] = useState<RelayPeerInfo[]>(p2pBridge.getPeers());
  const [signalingUrl, setSignalingUrl] = useState(p2pBridge.getSignalingUrl());

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubP2pStatus = p2pBridge.onStatusChange(setP2pStatus);
    const unsubP2pSession = p2pBridge.onSessionChange(setP2pSession);
    const unsubP2pPeers = p2pBridge.onPeersChange(setP2pPeers);

    return () => {
      unsubP2pStatus();
      unsubP2pSession();
      unsubP2pPeers();
    };
  }, []);

  // Generate QR code on session change
  useEffect(() => {
    if (!p2pSession) {
      setQrDataUrl(null);
      return;
    }

    const payload = JSON.stringify({
      type: 'turbine-p2p',
      signalingUrl: p2pSession.relayUrl,
      pairingCode: p2pSession.pairingCode,
      token: p2pSession.token,
    });

    QRCode.toDataURL(payload, {
      width: 200,
      margin: 1,
      color: {
        dark: '#00e5c8',
        light: '#071320',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR generation failed:', err));
  }, [p2pSession]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setErrorMsg(null);
    try {
      await p2pBridge.connect(signalingUrl);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    p2pBridge.disconnect();
    setP2pSession(null);
    setQrDataUrl(null);
  };

  const handleCopyCode = () => {
    if (p2pSession?.pairingCode) {
      navigator.clipboard.writeText(p2pSession.pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="companion-modal-backdrop" onClick={onClose}>
      <div className="companion-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="companion-modal-header">
          <div className="companion-modal-title">
            <span className="companion-icon">📱</span>
            <div>
              <h2>Mobile Companion</h2>
              <span className="companion-badge">100% Pure WebRTC DataChannel (E2EE)</span>
            </div>
          </div>
          <button className="companion-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="companion-modal-subtitle">
          Direct peer-to-peer pairing with your phone. No terminal output, code, or keystrokes ever touch a server.
        </p>

        {/* Signaling Configuration */}
        <div className="companion-config-card">
          <label className="companion-label">Signaling Service (Vercel Serverless):</label>
          <div className="companion-input-group">
            <input
              type="text"
              className="companion-input-field"
              value={signalingUrl}
              onChange={(e) => setSignalingUrl(e.target.value)}
              placeholder="https://signaling-taupe.vercel.app"
              disabled={p2pStatus === 'connected' || isConnecting}
            />
            {p2pSession ? (
              <button className="companion-btn-stop" onClick={handleDisconnect}>
                Stop
              </button>
            ) : (
              <button
                className="companion-btn-start"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? 'Starting...' : 'Start Pairing'}
              </button>
            )}
          </div>
          <p className="companion-hint">
            🔒 Ephemeral zero-cost pairing. Only facilitates the 2-second SDP handshake.
          </p>
        </div>

        {errorMsg && <div className="companion-error-banner">{errorMsg}</div>}

        {p2pSession && (
          <div className="companion-pairing-section">
            <div className="companion-qr-container">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Pairing QR Code" className="companion-qr-image" />
              ) : (
                <div className="companion-qr-skeleton">Generating QR...</div>
              )}
              <span className="companion-qr-hint">Scan with Turbine Companion app</span>
            </div>

            <div className="companion-code-container">
              <span className="companion-code-label">6-Character Pairing Code</span>
              <div className="companion-code-box" onClick={handleCopyCode} title="Click to copy code">
                <span className="companion-code-text">{p2pSession.pairingCode}</span>
                <span className="companion-copy-badge">{copied ? '✓ Copied' : 'Copy'}</span>
              </div>
              <p className="companion-code-sub">
                Enter this code in the Turbine app on your phone to establish the direct P2P connection!
              </p>
            </div>
          </div>
        )}

        {/* Status / Peer Footer */}
        <div className="companion-footer">
          <div className="companion-status-row">
            <span
              className={`companion-status-dot ${
                p2pStatus === 'connected'
                  ? 'dot-connected'
                  : p2pSession
                  ? 'dot-waiting'
                  : isConnecting
                  ? 'dot-connecting'
                  : 'dot-disconnected'
              }`}
            />
            <span className="companion-status-text">
              {p2pStatus === 'connected'
                ? '🟢 P2P Direct (DTLS E2EE) • ⚡ <5ms'
                : p2pSession
                ? '🟡 Waiting for Phone Connection...'
                : isConnecting
                ? '🔄 Registering SDP Offer...'
                : '⚪ Offline — Click Start Pairing to begin'}
            </span>
          </div>

          {p2pPeers.length > 0 && (
            <div className="companion-peers-list">
              <span className="companion-peers-header">Connected Devices ({p2pPeers.length}):</span>
              {p2pPeers.map((peer, idx) => (
                <div key={idx} className="companion-peer-tag">
                  📱 {peer.deviceName || 'Mobile Phone'} ({new Date(peer.timestamp).toLocaleTimeString()})
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
