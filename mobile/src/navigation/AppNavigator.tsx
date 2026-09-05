import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import type { ActiveTab } from '../types';
import { TerminalWorkspaceScreen } from '../screens/TerminalWorkspaceScreen';
import { SwarmScreen } from '../screens/SwarmScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { DiffsScreen } from '../screens/DiffsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import * as Haptics from 'expo-haptics';

interface AppNavigatorProps {
  onDisconnect: () => void;
}

const TABS: { id: ActiveTab; label: string; icon: string }[] = [
  { id: 'workspace', label: 'Workspace', icon: '📟' },
  { id: 'swarm', label: 'Swarm', icon: '🤖' },
  { id: 'tasks', label: 'Tasks', icon: '📋' },
  { id: 'diffs', label: 'Diffs', icon: '📁' },
  { id: 'settings', label: 'Control', icon: '⚙️' },
];

export const AppNavigator: React.FC<AppNavigatorProps> = ({ onDisconnect }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');

  const handleTabPress = (tab: ActiveTab) => {
    setActiveTab(tab);
    try {
      Haptics.selectionAsync();
    } catch {}
  };

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'workspace':
        return <TerminalWorkspaceScreen />;
      case 'swarm':
        return <SwarmScreen />;
      case 'tasks':
        return <TasksScreen />;
      case 'diffs':
        return <DiffsScreen />;
      case 'settings':
        return <SettingsScreen onDisconnect={onDisconnect} />;
      default:
        return <TerminalWorkspaceScreen />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Screen Body */}
      <View style={styles.body}>{renderActiveScreen()}</View>

      {/* Bottom Navigation Bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabButton}
              onPress={() => handleTabPress(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                {tab.icon}
              </Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050c16',
  },
  body: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#071524',
    borderTopWidth: 1,
    borderTopColor: '#142d45',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
    opacity: 0.6,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 10,
    color: '#6e8ba3',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#00e5c8',
    fontWeight: '700',
  },
});
