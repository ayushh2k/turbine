import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { socketService } from '../services/socketService';
import { TiledWorkspaceView } from '../components/TiledWorkspaceView';
import { FocusedTerminalView } from '../components/FocusedTerminalView';

export const TerminalWorkspaceScreen: React.FC = () => {
  const [workspaces, setWorkspaces] = useState(socketService.workspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(socketService.activeWorkspaceId);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = socketService.subscribe(() => {
      setWorkspaces(socketService.workspaces);
      setActiveWorkspaceId(socketService.activeWorkspaceId);
    });
    return unsub;
  }, []);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];

  const focusedPane = activeWorkspace?.panes.find((p) => p.id === focusedPaneId);

  if (!activeWorkspace) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Active Workspace</Text>
        <Text style={styles.emptySub}>
          Connect to Turbine Desktop or create a workspace on your computer.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Workspace Tabs Header */}
      {workspaces.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsContainer}
          contentContainerStyle={styles.tabsContent}
        >
          {workspaces.map((ws) => (
            <TouchableOpacity
              key={ws.id}
              style={[
                styles.tabItem,
                ws.id === activeWorkspace.id && styles.tabItemActive,
              ]}
              onPress={() => {
                socketService.switchWorkspace(ws.id);
                setFocusedPaneId(null);
              }}
            >
              <View
                style={[
                  styles.tabDot,
                  { backgroundColor: ws.tabColor || '#00e5c8' },
                ]}
              />
              <Text
                style={[
                  styles.tabText,
                  ws.id === activeWorkspace.id && styles.tabTextActive,
                ]}
              >
                {ws.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Main Content: Focused Terminal vs Tiled Desktop View */}
      {focusedPane ? (
        <FocusedTerminalView
          pane={focusedPane}
          allPanes={activeWorkspace.panes}
          onUnfocus={() => setFocusedPaneId(null)}
          onSwitchPane={(paneId) => setFocusedPaneId(paneId)}
        />
      ) : (
        <TiledWorkspaceView
          layout={activeWorkspace.layout}
          panes={activeWorkspace.panes}
          onSelectPane={(paneId) => setFocusedPaneId(paneId)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050c16',
  },
  tabsContainer: {
    backgroundColor: '#081422',
    borderBottomWidth: 1,
    borderBottomColor: '#142d45',
    maxHeight: 38,
  },
  tabsContent: {
    paddingHorizontal: 8,
    gap: 6,
    alignItems: 'center',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tabItemActive: {
    backgroundColor: '#0e243a',
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabText: {
    color: '#8ba4ba',
    fontSize: 12,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#d6e8f7',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#050c16',
  },
  emptyTitle: {
    color: '#00e5c8',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    color: '#7b95ab',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
