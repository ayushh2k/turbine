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
import type { Task } from '../types';
import * as Haptics from 'expo-haptics';

const COLUMNS = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

export const TasksScreen: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(socketService.tasks);
  const [selectedColumn, setSelectedColumn] = useState<string>('todo');
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    const unsub = socketService.subscribe(() => {
      setTasks(socketService.tasks);
    });
    return unsub;
  }, []);

  const handleCreateTask = () => {
    if (!newTitle.trim()) return;
    socketService.createTask(newTitle.trim());
    setNewTitle('');
    setNewModalVisible(false);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  };

  const handleMoveStatus = (id: string, newStatus: string) => {
    socketService.updateTaskStatus(id, newStatus);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const handleRunAgent = (task: Task) => {
    socketService.triggerSwarm(`Task: ${task.title}\n${task.description || ''}`);
    handleMoveStatus(task.id, 'in_progress');
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  };

  const filteredTasks = tasks.filter((t) => t.status === selectedColumn);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Kanban Task Board</Text>
          <Text style={styles.subtitle}>{tasks.length} total tasks</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setNewModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Add Task</Text>
        </TouchableOpacity>
      </View>

      {/* Column Switcher Tabs */}
      <View style={styles.colTabs}>
        {COLUMNS.map((col) => {
          const count = tasks.filter((t) => t.status === col.id).length;
          const isActive = selectedColumn === col.id;

          return (
            <TouchableOpacity
              key={col.id}
              style={[styles.colTab, isActive && styles.colTabActive]}
              onPress={() => setSelectedColumn(col.id)}
            >
              <Text style={[styles.colTabText, isActive && styles.colTabTextActive]}>
                {col.label}
              </Text>
              <View style={[styles.badge, isActive && styles.badgeActive]}>
                <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Task List */}
      <ScrollView style={styles.taskList} contentContainerStyle={styles.taskListContent}>
        {filteredTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No tasks in this column</Text>
            <Text style={styles.emptySub}>Add a task or move tasks here to track work.</Text>
          </View>
        ) : (
          filteredTasks.map((task) => (
            <View key={task.id} style={styles.taskCard}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              {task.description && (
                <Text style={styles.taskDesc} numberOfLines={2}>
                  {task.description}
                </Text>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.runAgentBtn}
                  onPress={() => handleRunAgent(task)}
                >
                  <Text style={styles.runAgentText}>⚡ Run with Agent</Text>
                </TouchableOpacity>

                <View style={styles.moveRow}>
                  {selectedColumn !== 'todo' && (
                    <TouchableOpacity
                      style={styles.moveBtn}
                      onPress={() => handleMoveStatus(task.id, 'todo')}
                    >
                      <Text style={styles.moveText}>← To Do</Text>
                    </TouchableOpacity>
                  )}
                  {selectedColumn !== 'in_progress' && (
                    <TouchableOpacity
                      style={styles.moveBtn}
                      onPress={() => handleMoveStatus(task.id, 'in_progress')}
                    >
                      <Text style={styles.moveText}>In Prog</Text>
                    </TouchableOpacity>
                  )}
                  {selectedColumn !== 'done' && (
                    <TouchableOpacity
                      style={styles.moveBtn}
                      onPress={() => handleMoveStatus(task.id, 'done')}
                    >
                      <Text style={styles.moveText}>Done ✓</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Task Modal */}
      <Modal visible={newModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create New Task</Text>
            <TextInput
              style={styles.modalInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Task title (e.g. Implement refresh token API)..."
              placeholderTextColor="#5a7690"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setNewModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={handleCreateTask}>
                <Text style={styles.createText}>Create</Text>
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
  addBtn: {
    backgroundColor: '#00e5c8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: {
    color: '#04121d',
    fontSize: 12,
    fontWeight: '700',
  },
  colTabs: {
    flexDirection: 'row',
    backgroundColor: '#081422',
    borderBottomWidth: 1,
    borderBottomColor: '#16314c',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  colTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 6,
  },
  colTabActive: {
    backgroundColor: '#0e243a',
  },
  colTabText: {
    color: '#8ba4ba',
    fontSize: 11,
    fontWeight: '500',
  },
  colTabTextActive: {
    color: '#d6e8f7',
    fontWeight: '700',
  },
  badge: {
    backgroundColor: '#162f4a',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  badgeActive: {
    backgroundColor: 'rgba(0, 229, 200, 0.2)',
  },
  badgeText: {
    color: '#7c97ad',
    fontSize: 9,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: '#00e5c8',
  },
  taskList: {
    flex: 1,
  },
  taskListContent: {
    padding: 12,
    gap: 10,
  },
  taskCard: {
    backgroundColor: '#081626',
    borderWidth: 1,
    borderColor: '#183654',
    borderRadius: 8,
    padding: 14,
  },
  taskTitle: {
    color: '#d6e6f5',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  taskDesc: {
    color: '#7f9cb8',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#122c45',
    paddingTop: 8,
    marginTop: 4,
  },
  runAgentBtn: {
    backgroundColor: 'rgba(0, 229, 200, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 200, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  runAgentText: {
    color: '#00e5c8',
    fontSize: 11,
    fontWeight: '600',
  },
  moveRow: {
    flexDirection: 'row',
    gap: 4,
  },
  moveBtn: {
    backgroundColor: '#0c2238',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
  },
  moveText: {
    color: '#8ba6be',
    fontSize: 10,
    fontWeight: '500',
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
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySub: {
    color: '#718c9e',
    fontSize: 12,
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
  createBtn: {
    backgroundColor: '#00e5c8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  createText: {
    color: '#04131e',
    fontWeight: '700',
    fontSize: 13,
  },
});
