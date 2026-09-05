import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export interface WebRTCBridgeRef {
  connect: (signalingUrl: string, pairingCode: string) => void;
  send: (message: string) => void;
  disconnect: () => void;
}

interface WebRTCBridgeViewProps {
  onStatusChange: (status: 'disconnected' | 'connecting' | 'connected', latency?: number) => void;
  onMessage: (message: string) => void;
  onError: (error: string) => void;
}

// Global ref accessible by services
let globalBridgeRef: WebRTCBridgeRef | null = null;

export function getWebRTCBridge(): WebRTCBridgeRef | null {
  return globalBridgeRef;
}

const WEBRTC_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Turbine WebRTC Native Engine</title>
</head>
<body>
<script>
  let pc = null;
  let dc = null;
  let pingInterval = null;
  let lastPingTime = null;

  function postToApp(type, payload = {}) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
    }
  }

  window.connectP2P = async function(signalingUrl, pairingCode) {
    try {
      window.disconnectP2P();
      postToApp('status', { status: 'connecting' });

      const cleanUrl = signalingUrl.replace(/\\/+$/, '');
      const code = pairingCode.toUpperCase().trim();

      // 1. Fetch Desktop's WebRTC Offer
      const resp = await fetch(cleanUrl + '/api/pair/' + code);
      if (!resp.ok) {
        throw new Error('Pairing code not found or expired on signaling server');
      }

      const data = await resp.json();
      if (!data.offer) {
        throw new Error('No SDP offer found for pairing code: ' + code);
      }

      // 2. Initialize RTCPeerConnection with STUN servers
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      const localCandidates = [];
      const iceDonePromise = new Promise((resolve) => {
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            localCandidates.push(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
          } else {
            resolve();
          }
        };
        // 2-second timeout for gathering
        setTimeout(resolve, 2000);
      });

      // 3. Listen for DataChannel created by Desktop
      pc.ondatachannel = (event) => {
        dc = event.channel;

        dc.onopen = () => {
          postToApp('status', { status: 'connected' });

          // Start sub-second ping latency measurement
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (dc && dc.readyState === 'open') {
              lastPingTime = Date.now();
              dc.send(JSON.stringify({ type: 'ping', timestamp: lastPingTime }));
            }
          }, 3000);
        };

        dc.onclose = () => {
          if (pingInterval) clearInterval(pingInterval);
          postToApp('status', { status: 'disconnected' });
        };

        dc.onerror = (err) => {
          postToApp('error', { message: err.message || 'WebRTC DataChannel error' });
        };

        dc.onmessage = (msgEvent) => {
          try {
            const parsed = JSON.parse(msgEvent.data);
            if (parsed.type === 'pong' && lastPingTime) {
              const latency = Math.max(1, Date.now() - lastPingTime);
              postToApp('latency', { latency });
              return;
            }
          } catch {}
          postToApp('message', { data: msgEvent.data });
        };
      };

      // 4. Set remote offer & generate answer
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Wait for candidates
      await iceDonePromise;

      // 5. Submit answer to Vercel Serverless Signaling
      const answerResp = await fetch(cleanUrl + '/api/pair/' + code, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: pc.localDescription,
          candidates: localCandidates
        })
      });

      if (!answerResp.ok) {
        throw new Error('Failed to submit WebRTC answer to signaling service');
      }
    } catch (e) {
      postToApp('error', { message: e.message || String(e) });
      postToApp('status', { status: 'disconnected' });
    }
  };

  window.sendDataChannel = function(rawString) {
    if (dc && dc.readyState === 'open') {
      dc.send(rawString);
    }
  };

  window.disconnectP2P = function() {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (dc) {
      try { dc.close(); } catch {}
      dc = null;
    }
    if (pc) {
      try { pc.close(); } catch {}
      pc = null;
    }
    postToApp('status', { status: 'disconnected' });
  };

  postToApp('ready', {});
</script>
</body>
</html>
`;

export const WebRTCBridgeView: React.FC<WebRTCBridgeViewProps> = ({
  onStatusChange,
  onMessage,
  onError,
}) => {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    globalBridgeRef = {
      connect: (signalingUrl: string, pairingCode: string) => {
        const js = `window.connectP2P(${JSON.stringify(signalingUrl)}, ${JSON.stringify(pairingCode)}); true;`;
        webViewRef.current?.injectJavaScript(js);
      },
      send: (message: string) => {
        const js = `window.sendDataChannel(${JSON.stringify(message)}); true;`;
        webViewRef.current?.injectJavaScript(js);
      },
      disconnect: () => {
        const js = `window.disconnectP2P(); true;`;
        webViewRef.current?.injectJavaScript(js);
      },
    };

    return () => {
      globalBridgeRef = null;
    };
  }, []);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'status') {
        onStatusChange(data.status);
      } else if (data.type === 'latency') {
        onStatusChange('connected', data.latency);
      } else if (data.type === 'message') {
        onMessage(data.data);
      } else if (data.type === 'error') {
        onError(data.message);
      }
    } catch (err) {
      console.error('[WebRTCBridgeView] Message parse error:', err);
    }
  };

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: WEBRTC_HTML }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        style={styles.hiddenWebView}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenContainer: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
    left: -9999,
  },
  hiddenWebView: {
    width: 1,
    height: 1,
  },
});
