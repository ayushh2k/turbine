import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

interface VirtualKeyboardProps {
  onKey: (data: string) => void;
  onClear?: () => void;
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ onKey, onClear }) => {
  const triggerKey = (data: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onKey(data);
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.keyBtn} onPress={() => triggerKey('\x1b')}>
          <Text style={styles.keyText}>Esc</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.keyBtn} onPress={() => triggerKey('\t')}>
          <Text style={styles.keyText}>Tab</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.keyBtn, styles.dangerKey]} onPress={() => triggerKey('\x03')}>
          <Text style={[styles.keyText, styles.dangerText]}>Ctrl+C</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.keyBtn} onPress={() => triggerKey('\x04')}>
          <Text style={styles.keyText}>Ctrl+D</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.keyBtn} onPress={() => triggerKey('\x1a')}>
          <Text style={styles.keyText}>Ctrl+Z</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.keyBtn} onPress={() => triggerKey('\x1b[A')}>
          <Text style={styles.keyText}>▲</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.keyBtn} onPress={() => triggerKey('\x1b[B')}>
          <Text style={styles.keyText}>▼</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.keyBtn} onPress={() => triggerKey('\x1b[D')}>
          <Text style={styles.keyText}>◀</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.keyBtn} onPress={() => triggerKey('\x1b[C')}>
          <Text style={styles.keyText}>▶</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.keyBtn, styles.agentKey]} onPress={() => triggerKey('y\n')}>
          <Text style={[styles.keyText, styles.agentText]}>y (Approve)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.keyBtn, styles.agentKey]} onPress={() => triggerKey('n\n')}>
          <Text style={[styles.keyText, styles.agentText]}>n (Reject)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.keyBtn} onPress={() => triggerKey('\r')}>
          <Text style={styles.keyText}>↵ Enter</Text>
        </TouchableOpacity>

        {onClear && (
          <TouchableOpacity style={styles.keyBtn} onPress={onClear}>
            <Text style={styles.keyText}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#091522',
    borderTopWidth: 1,
    borderTopColor: '#172f48',
    paddingVertical: 6,
  },
  scroll: {
    paddingHorizontal: 8,
    gap: 6,
  },
  keyBtn: {
    backgroundColor: '#0f243a',
    borderWidth: 1,
    borderColor: '#1d3e5f',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    color: '#d0e2f2',
    fontSize: 12,
    fontWeight: '600',
  },
  dangerKey: {
    borderColor: '#ff5252',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
  },
  dangerText: {
    color: '#ff6b6b',
  },
  agentKey: {
    borderColor: '#00e5c8',
    backgroundColor: 'rgba(0, 229, 200, 0.1)',
  },
  agentText: {
    color: '#00e5c8',
  },
});
