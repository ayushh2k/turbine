import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { socketService } from './src/services/socketService';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { AppNavigator } from './src/navigation/AppNavigator';
import { WebRTCBridgeView } from './src/services/WebRTCBridgeView';

export default function App() {
  const [isConnected, setIsConnected] = useState(
    socketService.getStatus() === 'connected'
  );

  useEffect(() => {
    const unsub = socketService.subscribe(() => {
      setIsConnected(socketService.getStatus() === 'connected');
    });
    return unsub;
  }, []);

  const handleDisconnect = () => {
    socketService.disconnect();
    setIsConnected(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <WebRTCBridgeView
        onStatusChange={(status, latency) => socketService.setStatus(status, latency)}
        onMessage={(msg) => socketService.handleMessage(msg)}
        onError={(err) => socketService.setErrorMessage(err)}
      />
      {isConnected ? (
        <AppNavigator onDisconnect={handleDisconnect} />
      ) : (
        <ConnectScreen onConnected={() => setIsConnected(true)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050c16',
  },
});
