import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { LayoutNode, PaneConfig } from '../types';
import { AnsiRenderer } from './AnsiRenderer';
import { socketService } from '../services/socketService';

interface TiledWorkspaceViewProps {
  layout: LayoutNode;
  panes: PaneConfig[];
  onSelectPane: (paneId: string) => void;
}

export const TiledWorkspaceView: React.FC<TiledWorkspaceViewProps> = ({
  layout,
  panes,
  onSelectPane,
}) => {
  const paneMap = new Map(panes.map((p) => [p.id, p]));

  const renderNode = (node: LayoutNode, key: string = 'root'): React.ReactNode => {
    if (node.type === 'leaf') {
      const pane = paneMap.get(node.paneId);
      const output = socketService.getPaneOutput(node.paneId);
      const previewLines = output.split('\n').slice(-12).join('\n');

      return (
        <TouchableOpacity
          key={key}
          style={styles.leafContainer}
          activeOpacity={0.85}
          onPress={() => onSelectPane(node.paneId)}
        >
          {/* Pane Header */}
          <View style={styles.leafHeader}>
            <View style={styles.titleRow}>
              <View style={styles.statusDot} />
              <Text style={styles.leafTitle} numberOfLines={1}>
                {pane?.title || pane?.label || pane?.type || 'Terminal'}
              </Text>
            </View>
            <View style={styles.tapToFocusBadge}>
              <Text style={styles.tapToFocusText}>Tap to type</Text>
            </View>
          </View>

          {/* Terminal Output Preview */}
          <View style={styles.previewBox}>
            {previewLines ? (
              <AnsiRenderer rawText={previewLines} fontSize={9} />
            ) : (
              <Text style={styles.emptyPreview}>Terminal ready. Tap to open...</Text>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    const isHorizontal = node.direction === 'horizontal';
    const firstFlex = Math.max(0.2, Math.min(0.8, node.ratio || 0.5));
    const secondFlex = 1 - firstFlex;

    return (
      <View
        key={key}
        style={[
          styles.splitContainer,
          isHorizontal ? styles.splitHorizontal : styles.splitVertical,
        ]}
      >
        <View style={{ flex: firstFlex }}>{renderNode(node.children[0], `${key}-0`)}</View>
        <View style={isHorizontal ? styles.dividerH : styles.dividerV} />
        <View style={{ flex: secondFlex }}>{renderNode(node.children[1], `${key}-1`)}</View>
      </View>
    );
  };

  return <View style={styles.container}>{renderNode(layout)}</View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050c16',
    padding: 6,
  },
  splitContainer: {
    flex: 1,
  },
  splitHorizontal: {
    flexDirection: 'row',
  },
  splitVertical: {
    flexDirection: 'column',
  },
  dividerH: {
    width: 4,
    backgroundColor: '#0c1a29',
  },
  dividerV: {
    height: 4,
    backgroundColor: '#0c1a29',
  },
  leafContainer: {
    flex: 1,
    backgroundColor: '#081422',
    borderWidth: 1,
    borderColor: '#18334e',
    borderRadius: 8,
    margin: 3,
    overflow: 'hidden',
  },
  leafHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0c1f33',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#173654',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00e5c8',
  },
  leafTitle: {
    color: '#cbe0f0',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  tapToFocusBadge: {
    backgroundColor: 'rgba(0, 229, 200, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tapToFocusText: {
    color: '#00e5c8',
    fontSize: 9,
    fontWeight: '600',
  },
  previewBox: {
    flex: 1,
    padding: 6,
    overflow: 'hidden',
  },
  emptyPreview: {
    color: '#526b82',
    fontSize: 10,
    fontStyle: 'italic',
  },
});
