import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import { socketService } from '../services/socketService';
import type { SwarmRun, SwarmAgent } from '../types';
import * as Haptics from 'expo-haptics';

export const SwarmScreen: React.FC = () => {
  const [runs, setRuns] = useState<SwarmRun[]>(socketService.swarmRuns);
  const [agents, setAgents] = useState<SwarmAgent[]>(socketService.swarmAgents);
  const [modalVisible, setModalVisible] = useState(false);
  const [promptText, setPromptText] = useState('');

  useEffect(() => {
    const unsub = socketService.subscribe(() => {
      setRuns(socketService.swarmRuns);
      setAgents(socketService.swarmAgents);
    });
    return unsub;
  }, []);

  const handleStartSwarm = () => {
    if (!promptText.trim()) return;
    socketService.triggerSwarm(promptText.trim());
    setPromptText('');
    setModalVisible(false);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>AI Swarm Orchestration</Text>
          <Text style={styles.subtitle}>Autonomous multi-agent pipelines</Text>
        </View>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.newBtnText}>+ New Run</Text>
        </TouchableOpacity>
      </View>

      {/* Swarm Runs List */}
      <ScrollView style={styles.runList} contentContainerStyle={styles.runListContent}>
        {runs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Swarm Runs Yet</Text>
            <Text style={styles.emptySub}>
              Start a multi-agent run to coordinate Builder, Reviewer, and Support agents.
            </Text>
            <TouchableOpacity
              style={styles.startFirstBtn}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.startFirstText}>Launch First Swarm</Text>
            </TouchableOpacity>
          </View>
        ) : (
          runs.map((run) => {
            const runAgents = agents.filter((a) => a.swarm_run_id === run.id);
            const isRunning = run.status === 'Running' || run.status === 'Initializing';

            return (
              <View key={run.id} style={styles.runCard}>
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.statusPill,
                      isRunning ? styles.statusRunning : styles.statusCompleted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        isRunning ? styles.statusRunningText : styles.statusCompletedText,
                      ]}
                    >
                      {run.status}
                    </Text>
                  </View>
                  <Text style={styles.dateText}>
                    {run.started_at ? new Date(run.started_at).toLocaleTimeString() : ''}
                  </Text>
                </View>

                <Text style={styles.promptText}>{run.prompt || 'Ad-hoc agent execution'}</Text>

                {/* Agents in this run */}
                <View style={styles.agentSection}>
                  <Text style={styles.agentSectionTitle}>Agents ({runAgents.length}):</Text>
                  {runAgents.map((agent) => (
                    <View key={agent.id} style={styles.agentRow}>
                      <View style={styles.agentInfo}>
                        <View
                          style={[
                            styles.agentDot,
                            agent.status === 'running' && styles.agentRunningDot,
                            agent.status === 'completed' && styles.agentCompletedDot,
                          ]}
                        />
                        <Text style={styles.agentRole}>{agent.role}</Text>
                      </View>
                      <Text style={styles.agentStatus}>{agent.status}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* New Swarm Run Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Launch AI Swarm Run</Text>
            <Text style={styles.modalSub}>
              Enter instructions for the AI agents to coordinate and build:
            </Text>

            <TextInput
              style={styles.modalInput}
              value={promptText}
              onChangeText={setPromptText}
              placeholder="e.g. Add user authentication with JWT, verify with unit tests, and document in README..."
              placeholderTextColor="#5a7690"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.launchBtn} onPress={handleStartSwarm}>
                <Text style={styles.launchText}>Launch Swarm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050c16',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#091829',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#173654',
  },
  title: {
    color: '#00e5c8',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#7b96ad',
    fontSize: 11,
    marginTop: 2,
  },
  newBtn: {
    backgroundColor: '#00e5c8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  newBtnText: {
    color: '#04121d',
    fontSize: 12,
    fontWeight: '700',
  },
  runList: {
    flex: 1,
  },
  runListContent: {
    padding: 12,
    gap: 12,
  },
  runCard: {
    backgroundColor: '#081626',
    borderWidth: 1,
    borderColor: '#183654',
    borderRadius: 8,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusRunning: {
    backgroundColor: 'rgba(0, 229, 200, 0.15)',
    borderColor: '#00e5c8',
    borderWidth: 1,
  },
  statusCompleted: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderColor: '#81c784',
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusRunningText: {
    color: '#00e5c8',
  },
  statusCompletedText: {
    color: '#81c784',
  },
  dateText: {
    color: '#658199',
    fontSize: 11,
  },
  promptText: {
    color: '#e2edf7',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  agentSection: {
    borderTopWidth: 1,
    borderTopColor: '#122c45',
    paddingTop: 8,
    marginTop: 4,
  },
  agentSectionTitle: {
    color: '#7f9db8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  agentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#738ea6',
  },
  agentRunningDot: {
    backgroundColor: '#00e5c8',
  },
  agentCompletedDot: {
    backgroundColor: '#81c784',
  },
  agentRole: {
    color: '#c5d8e8',
    fontSize: 12,
    fontWeight: '500',
  },
  agentStatus: {
    color: '#738ea6',
    fontSize: 11,
  },
  emptyCard: {
    backgroundColor: '#081626',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#183654',
    padding: 24,
    alignItems: 'center',
    marginTop: 30,
  },
  emptyTitle: {
    color: '#d2e4f2',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptySub: {
    color: '#718c9e',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
  },
  startFirstBtn: {
    backgroundColor: '#00e5c8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  startFirstText: {
    color: '#03141f',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 8, 15, 0.8)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0b1c2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1d4266',
    padding: 18,
  },
  modalTitle: {
    color: '#00e5c8',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSub: {
    color: '#82a0b8',
    fontSize: 12,
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#06111d',
    borderWidth: 1,
    borderColor: '#1d4063',
    borderRadius: 6,
    color: '#e2edf7',
    padding: 12,
    fontSize: 13,
    minHeight: 100,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelText: {
    color: '#8ba6be',
    fontSize: 13,
  },
  launchBtn: {
    backgroundColor: '#00e5c8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  launchText: {
    color: '#04131e',
    fontWeight: '700',
    fontSize: 13,
  },
});
