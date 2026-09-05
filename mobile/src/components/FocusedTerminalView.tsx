import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { PaneConfig } from '../types';
import { VirtualKeyboard } from './VirtualKeyboard';
import { socketService } from '../services/socketService';
import * as Haptics from 'expo-haptics';

interface FocusedTerminalViewProps {
  pane: PaneConfig;
  allPanes: PaneConfig[];
  onUnfocus: () => void;
  onSwitchPane: (paneId: string) => void;
}

type ScaleMode = 'fit-screen' | 'fit-width' | '100' | 'custom';

export const FocusedTerminalView: React.FC<FocusedTerminalViewProps> = ({
  pane,
  allPanes,
  onUnfocus,
  onSwitchPane,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [showPanePicker, setShowPanePicker] = useState(false);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('fit-width');
  const [scalePercent, setScalePercent] = useState<number>(100);
  const [dimensions, setDimensions] = useState(
    socketService.getPaneDimensions(pane.id) || { cols: 80, rows: 24 }
  );

  // Send terminal sync request when switching pane
  useEffect(() => {
    socketService.requestTerminalSync(pane.id);
    const existingDims = socketService.getPaneDimensions(pane.id);
    if (existingDims) {
      setDimensions(existingDims);
    }
  }, [pane.id]);

  // Subscribe to raw terminal stream events
  useEffect(() => {
    const unsubOutput = socketService.onTerminalOutput((paneId, data) => {
      if (paneId === pane.id) {
        const script = `window.writeOutput && window.writeOutput(${JSON.stringify(data)}); true;`;
        webViewRef.current?.injectJavaScript(script);
      }
    });

    const unsubResize = socketService.onTerminalResize((paneId, cols, rows) => {
      if (paneId === pane.id) {
        setDimensions({ cols, rows });
        const script = `window.resizeTerminal && window.resizeTerminal(${cols}, ${rows}); true;`;
        webViewRef.current?.injectJavaScript(script);
      }
    });

    const unsubSync = socketService.onTerminalSync((paneId, cols, rows, buffer) => {
      if (paneId === pane.id) {
        setDimensions({ cols, rows });
        const script = `window.syncTerminal && window.syncTerminal(${cols}, ${rows}, ${JSON.stringify(buffer)}); true;`;
        webViewRef.current?.injectJavaScript(script);
      }
    });

    return () => {
      unsubOutput();
      unsubResize();
      unsubSync();
    };
  }, [pane.id]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'input') {
        // Direct keystroke from terminal emulator -> send to desktop PTY
        socketService.sendTerminalInput(pane.id, msg.data);
      } else if (msg.type === 'scale_change') {
        setScalePercent(Math.round(msg.scale * 100));
        if (msg.cols && msg.rows) {
          setDimensions({ cols: msg.cols, rows: msg.rows });
        }
      } else if (msg.type === 'ready') {
        // WebView xterm is ready, populate with current replay buffer
        const dims = socketService.getPaneDimensions(pane.id) || { cols: 80, rows: 24 };
        const buffer = socketService.getPaneOutput(pane.id);
        const script = `window.syncTerminal && window.syncTerminal(${dims.cols}, ${dims.rows}, ${JSON.stringify(buffer)}); true;`;
        webViewRef.current?.injectJavaScript(script);
      }
    } catch {}
  }, [pane.id]);

  const handleVirtualKey = useCallback((key: string) => {
    socketService.sendTerminalInput(pane.id, key);
  }, [pane.id]);

  const changeScaleMode = (mode: ScaleMode) => {
    setScaleMode(mode);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    webViewRef.current?.injectJavaScript(`window.setScaleMode && window.setScaleMode('${mode}'); true;`);
  };

  const adjustZoom = (delta: number) => {
    setScaleMode('custom');
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    webViewRef.current?.injectJavaScript(`window.adjustZoom && window.adjustZoom(${delta}); true;`);
  };

  const focusTerminal = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    webViewRef.current?.injectJavaScript(`window.focusTerminal && window.focusTerminal(); true;`);
  };

  // Generate self-contained xterm.js live stream HTML with shellf-driving scaler
  const htmlContent = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
  <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background: #070d14;
      overflow: hidden;
      font-family: ui-monospace, Menlo, Monaco, "Courier New", monospace;
      -webkit-user-select: none;
      user-select: none;
    }
    #container {
      width: 100%;
      height: 100%;
      position: relative;
      background: #070d14;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
    }
    #scaler {
      transform-origin: top left;
      transition: transform 0.12s ease-out;
      display: inline-block;
    }
    .xterm {
      padding: 4px;
    }
    #container::-webkit-scrollbar {
      display: none;
    }
  </style>
</head>
<body>
  <div id="container">
    <div id="scaler">
      <div id="terminal"></div>
    </div>
  </div>

  <script>
    let term = null;
    let currentCols = ${dimensions.cols || 80};
    let currentRows = ${dimensions.rows || 24};
    let currentMode = '${scaleMode}';
    let currentScale = 1.0;

    function post(type, payload) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, payload || {})));
      }
    }

    function init() {
      term = new Terminal({
        cols: currentCols,
        rows: currentRows,
        fontSize: 13,
        lineHeight: 1.15,
        fontFamily: 'ui-monospace, Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#070d14',
          foreground: '#d6e6f5',
          cursor: '#00e5c8',
          cursorAccent: '#070d14',
          selectionBackground: 'rgba(0, 229, 200, 0.3)',
          black: '#0a1017',
          red: '#ff5c57',
          green: '#5af78e',
          yellow: '#f3f99d',
          blue: '#57c7ff',
          magenta: '#ff6ac1',
          cyan: '#9aedfe',
          white: '#f1f1f0',
          brightBlack: '#686868',
          brightRed: '#ff5c57',
          brightGreen: '#5af78e',
          brightYellow: '#f3f99d',
          brightBlue: '#57c7ff',
          brightMagenta: '#ff6ac1',
          brightCyan: '#9aedfe',
          brightWhite: '#eff0eb'
        },
        cursorBlink: true,
        convertEol: false,
        disableStdin: false,
        allowTransparency: true
      });

      term.open(document.getElementById('terminal'));

      // Raw keystroke stream from native mobile keyboard to desktop PTY
      term.onData(function(data) {
        post('input', { data: data });
      });

      // Configure helper textarea for seamless mobile terminal typing
      setTimeout(function() {
        const ta = document.querySelector('.xterm-helper-textarea');
        if (ta) {
          ta.setAttribute('autocapitalize', 'none');
          ta.setAttribute('autocorrect', 'off');
          ta.setAttribute('autocomplete', 'off');
          ta.setAttribute('spellcheck', 'false');
          ta.setAttribute('enterkeyhint', 'enter');
        }
        applyScale();
        post('ready');
      }, 60);

      // Tapping anywhere focuses terminal and opens native keyboard
      const container = document.getElementById('container');
      container.addEventListener('click', function() {
        if (term) term.focus();
      });
      container.addEventListener('touchend', function() {
        if (term) term.focus();
      });
    }

    // Dynamic shellf-driving scaler: matches exact PTY dimensions, scales visually
    function applyScale() {
      const scaler = document.getElementById('scaler');
      const container = document.getElementById('container');
      if (!term || !term.element || !scaler || !container) return;

      scaler.style.transform = 'scale(1)';
      const termW = term.element.offsetWidth || (currentCols * 7.8);
      const termH = term.element.offsetHeight || (currentRows * 15.2);
      const contW = container.clientWidth || window.innerWidth;
      const contH = container.clientHeight || window.innerHeight;

      if (!termW || !termH || !contW || !contH) return;

      let s = 1.0;
      if (currentMode === 'fit-screen') {
        // Letterbox both dimensions: full desktop grid visible on phone
        s = Math.max(0.15, Math.min(contW / termW, contH / termH, 3));
      } else if (currentMode === 'fit-width') {
        // Fit width: scales to phone width, allows vertical scrolling
        s = Math.max(0.15, Math.min(contW / termW, 3));
      } else if (currentMode === '100') {
        s = 1.0;
      } else if (currentMode === 'custom') {
        s = currentScale;
      }

      currentScale = s;
      scaler.style.transform = 'scale(' + s.toFixed(4) + ')';

      post('scale_change', {
        scale: s,
        mode: currentMode,
        cols: currentCols,
        rows: currentRows
      });
    }

    window.writeOutput = function(chunk) {
      if (term && chunk) {
        term.write(chunk);
      }
    };

    window.syncTerminal = function(cols, rows, buffer) {
      if (!term) return;
      if (cols && rows && (cols !== currentCols || rows !== currentRows)) {
        currentCols = cols;
        currentRows = rows;
        term.resize(cols, rows);
      }
      if (typeof buffer === 'string') {
        term.reset();
        if (buffer.length > 0) {
          term.write(buffer);
        }
      }
      applyScale();
    };

    window.resizeTerminal = function(cols, rows) {
      if (!term || !cols || !rows) return;
      currentCols = cols;
      currentRows = rows;
      term.resize(cols, rows);
      applyScale();
    };

    window.setScaleMode = function(mode) {
      currentMode = mode;
      applyScale();
    };

    window.adjustZoom = function(delta) {
      currentMode = 'custom';
      currentScale = Math.max(0.2, Math.min(3.0, currentScale + delta));
      applyScale();
    };

    window.focusTerminal = function() {
      if (term) {
        term.focus();
      }
    };

    window.addEventListener('resize', function() {
      applyScale();
    });

    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      init();
    }
  </script>
</body>
</html>`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 0}
    >
      {/* Header Bar */}
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
          <Text style={styles.dimsText}>
            ({dimensions.cols}×{dimensions.rows})
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

      {/* Stream Scaler & Zoom Toolbar (shellf-driving inspired) */}
      <View style={styles.scalerToolbar}>
        <View style={styles.modeButtons}>
          <TouchableOpacity
            style={[styles.modeBtn, scaleMode === 'fit-width' && styles.modeBtnActive]}
            onPress={() => changeScaleMode('fit-width')}
          >
            <Text style={[styles.modeBtnText, scaleMode === 'fit-width' && styles.modeBtnTextActive]}>
              Fit Width
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeBtn, scaleMode === 'fit-screen' && styles.modeBtnActive]}
            onPress={() => changeScaleMode('fit-screen')}
          >
            <Text style={[styles.modeBtnText, scaleMode === 'fit-screen' && styles.modeBtnTextActive]}>
              Fit Screen
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeBtn, scaleMode === '100' && styles.modeBtnActive]}
            onPress={() => changeScaleMode('100')}
          >
            <Text style={[styles.modeBtnText, scaleMode === '100' && styles.modeBtnTextActive]}>
              100%
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.zoomControls}>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => adjustZoom(-0.1)}>
            <Text style={styles.zoomBtnText}>−</Text>
          </TouchableOpacity>

          <View style={styles.percentBadge}>
            <Text style={styles.percentText}>{scalePercent}%</Text>
          </View>

          <TouchableOpacity style={styles.zoomBtn} onPress={() => adjustZoom(0.1)}>
            <Text style={styles.zoomBtnText}>+</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.keyboardFocusBtn} onPress={focusTerminal}>
            <Text style={styles.keyboardFocusText}>⌨ Type</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 1:1 Scaled Hardware-Accelerated Terminal Viewport */}
      <View style={styles.terminalContainer}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          style={styles.webView}
          onMessage={handleMessage}
          scrollEnabled={true}
          bounces={false}
          keyboardDisplayRequiresUserAction={false}
          automaticallyAdjustContentInsets={false}
          hideKeyboardAccessoryView={true}
        />
      </View>

      {/* Native Mobile Virtual Keyboard Toolbar (Pinned directly above iOS keyboard) */}
      <VirtualKeyboard
        onKey={handleVirtualKey}
        onClear={() => socketService.clearPaneOutput(pane.id)}
      />
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
    maxWidth: 220,
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
  dimsText: {
    color: '#7b98b3',
    fontSize: 10,
    fontWeight: '500',
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
  scalerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#081422',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#13283c',
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  modeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: '#0e2338',
    borderWidth: 1,
    borderColor: '#193959',
  },
  modeBtnActive: {
    backgroundColor: '#00e5c8',
    borderColor: '#00e5c8',
  },
  modeBtnText: {
    color: '#9cb5cc',
    fontSize: 11,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#05111c',
    fontWeight: '700',
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zoomBtn: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#0e2338',
    borderWidth: 1,
    borderColor: '#193959',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: {
    color: '#00e5c8',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  percentBadge: {
    minWidth: 42,
    alignItems: 'center',
  },
  percentText: {
    color: '#90acc4',
    fontSize: 11,
    fontWeight: '600',
  },
  keyboardFocusBtn: {
    backgroundColor: 'rgba(0, 229, 200, 0.15)',
    borderWidth: 1,
    borderColor: '#00e5c8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    marginLeft: 4,
  },
  keyboardFocusText: {
    color: '#00e5c8',
    fontSize: 11,
    fontWeight: '700',
  },
  terminalContainer: {
    flex: 1,
    backgroundColor: '#070d14',
  },
  webView: {
    flex: 1,
    backgroundColor: '#070d14',
  },
});
