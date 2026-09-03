import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { PaneConfig } from '../types';
import { AnsiRenderer } from './AnsiRenderer';
import { VirtualKeyboard } from './VirtualKeyboard';
import { socketService } from '../services/socketService';
import * as Haptics from 'expo-haptics';

interface FocusedTerminalViewProps {
  pane: PaneConfig;
  allPanes: PaneConfig[];
  onUnfocus: () => void;
  onSwitchPane: (paneId: string) => void;
}

export const FocusedTerminalView: React.FC<FocusedTerminalViewProps> = ({
  pane,
  allPanes,
  onUnfocus,
  onSwitchPane,
}) => {
  const [inputText, setInputText] = useState('');
  const [output, setOutput] = useState(socketService.getPaneOutput(pane.id));
  const [showPanePicker, setShowPanePicker] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    setOutput(socketService.getPaneOutput(pane.id));
    const unsub = socketService.subscribe(() => {
      setOutput(socketService.getPaneOutput(pane.id));
    });
    return unsub;
  }, [pane.id]);

  useEffect(() => {
    // Scroll to bottom on new output
    scrollViewRef.current?.scrollToEnd({ animated: false });
  }, [output]);

  const handleSend = () => {
    if (!inputText) {
      socketService.sendTerminalInput(pane.id, '\n');
      return;
    }
    socketService.sendTerminalInput(pane.id, `${inputText}\n`);
    setInputText('');
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const handleVirtualKey = (key: string) => {
    socketService.sendTerminalInput(pane.id, key);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 0}
    >
      {/* Focused Header Bar with Unfocus Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.unfocusBtn} onPress={onUnfocus} activeOpacity={0.7}>
          <Text style={styles.unfocusArrow}>←</Text>
          <Text style={styles.unfocusText}>Tiled Layout</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.paneTitleSelector}
          onPress={() => setShowPanePicker(!showPanePicker)}
          activeOpacity={0.7}
        >
          <View style={styles.statusDot} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {pane.title || pane.label || pane.type}
          </Text>
          <Text style={styles.dropdownIcon}>▾</Text>
        </TouchableOpacity>
      </View>

      {/* Switcher Dropdown (if toggled) */}
      {showPanePicker && (
        <View style={styles.pickerDropdown}>
          <Text style={styles.pickerLabel}>Switch Active Terminal:</Text>
          {allPanes.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.pickerItem, p.id === pane.id && styles.pickerItemActive]}
              onPress={() => {
                onSwitchPane(p.id);
                setShowPanePicker(false);
              }}
            >
              <Text style={[styles.pickerItemText, p.id === pane.id && styles.pickerItemTextActive]}>
                {p.title || p.label || p.type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Terminal Viewport */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.terminalBody}
        contentContainerStyle={styles.terminalContent}
      >
        <AnsiRenderer rawText={output || 'Terminal connected. Ready for input.\n'} fontSize={12} />
      </ScrollView>

      {/* Mobile Virtual Keys Row */}
      <VirtualKeyboard
        onKey={handleVirtualKey}
        onClear={() => socketService.clearPaneOutput(pane.id)}
      />

      {/* Command Prompt Input Row */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type command or instruction for AI agent..."
          placeholderTextColor="#4a657f"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#173654',
  },
  unfocusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 229, 200, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 200, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  unfocusArrow: {
    color: '#00e5c8',
    fontSize: 14,
    fontWeight: '700',
  },
  unfocusText: {
    color: '#00e5c8',
    fontSize: 12,
    fontWeight: '600',
  },
  paneTitleSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0c2238',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    maxWidth: 200,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#00e5c8',
  },
  headerTitle: {
    color: '#d6e6f5',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  dropdownIcon: {
    color: '#7b98b3',
    fontSize: 10,
  },
  pickerDropdown: {
    backgroundColor: '#0c2238',
    borderBottomWidth: 1,
    borderBottomColor: '#1a4168',
    padding: 10,
  },
  pickerLabel: {
    color: '#7f9db8',
    fontSize: 11,
    marginBottom: 6,
    fontWeight: '500',
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 2,
  },
  pickerItemActive: {
    backgroundColor: 'rgba(0, 229, 200, 0.15)',
  },
  pickerItemText: {
    color: '#b0c7db',
    fontSize: 12,
  },
  pickerItemTextActive: {
    color: '#00e5c8',
    fontWeight: '600',
  },
  terminalBody: {
    flex: 1,
    backgroundColor: '#050c16',
    padding: 10,
  },
  terminalContent: {
    paddingBottom: 20,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#091828',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#15314f',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#050d18',
    borderWidth: 1,
    borderColor: '#1e4063',
    borderRadius: 6,
    color: '#e2edf7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: 'Courier',
  },
  sendBtn: {
    backgroundColor: '#00e5c8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    color: '#03141f',
    fontWeight: '700',
    fontSize: 13,
  },
});
