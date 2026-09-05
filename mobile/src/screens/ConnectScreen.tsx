import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { socketService } from '../services/socketService';
import * as Haptics from 'expo-haptics';

interface ConnectScreenProps {
  onConnected: () => void;
}

export const ConnectScreen: React.FC<ConnectScreenProps> = ({ onConnected }) => {
  const [pairingCode, setPairingCode] = useState('');
  const [signalingUrl, setSignalingUrl] = useState('https://signaling-taupe.vercel.app');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!pairingCode.trim()) {
      setError('Please enter the 6-character pairing code shown on your desktop screen.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await socketService.connectP2P({
        signalingUrl: signalingUrl.trim(),
        pairingCode: pairingCode.trim().toUpperCase(),
      });

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      onConnected();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'P2P Connection failed');
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Brand Header */}
      <View style={styles.brandHeader}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoIcon}>⚡</Text>
        </View>
        <Text style={styles.title}>Turbine Companion</Text>
        <Text style={styles.subtitle}>100% Peer-to-Peer Mobile Mission Control</Text>
      </View>

      {/* Pairing Card */}
      <View style={styles.card}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🔒 Direct P2P (DTLS Encrypted)</Text>
          </View>
        </View>

        <Text style={styles.cardTitle}>Direct WebRTC Pairing</Text>
        <Text style={styles.cardSub}>
          Connects directly device-to-device with your Mac. No terminal data, code, or keystrokes ever touch a server.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>6-Character Pairing Code:</Text>
          <TextInput
            style={styles.codeInput}
            value={pairingCode}
            onChangeText={(text) => setPairingCode(text.toUpperCase())}
            placeholder="TRB-..."
            placeholderTextColor="#4a657e"
            autoCapitalize="characters"
            maxLength={7}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Signaling Server URL (Vercel Serverless):</Text>
          <TextInput
            style={styles.urlInput}
            value={signalingUrl}
            onChangeText={setSignalingUrl}
            placeholder="https://signaling-taupe.vercel.app"
            placeholderTextColor="#4a657e"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#050c16" />
          ) : (
            <Text style={styles.buttonText}>Establish Direct P2P Pipe</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How it works:</Text>
        <Text style={styles.infoStep}>1. In Turbine Desktop, click 📱 Mobile Companion.</Text>
        <Text style={styles.infoStep}>2. Click Start Pairing to generate your 6-character code.</Text>
        <Text style={styles.infoStep}>3. Enter the code above $\rightarrow$ enjoy direct P2P control!</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050c16',
  },
  content: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 229, 200, 0.1)',
    borderWidth: 1.5,
    borderColor: '#00e5c8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoIcon: {
    fontSize: 28,
  },
  title: {
    color: '#00e5c8',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#8ba5bd',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#091728',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#173757',
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  badge: {
    backgroundColor: 'rgba(0, 229, 200, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 200, 0.3)',
  },
  badgeText: {
    color: '#00e5c8',
    fontSize: 12,
    fontWeight: '600',
  },
  cardTitle: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardSub: {
    color: '#8ba5bd',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#8ba5bd',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  codeInput: {
    backgroundColor: '#050c16',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#00e5c8',
    color: '#00e5c8',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 4,
    paddingVertical: 12,
  },
  urlInput: {
    backgroundColor: '#050c16',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#173757',
    color: '#f0f6fc',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBox: {
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#ff4444',
    padding: 10,
    borderRadius: 6,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff8888',
    fontSize: 13,
  },
  button: {
    backgroundColor: '#00e5c8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#050c16',
    fontSize: 15,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: '#071220',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#10263e',
  },
  infoTitle: {
    color: '#8ba5bd',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoStep: {
    color: '#5c768d',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
});
