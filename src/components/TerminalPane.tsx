import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { ImageAddon } from '@xterm/addon-image';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useSettingsStore } from '../state/settingsStore';
import { TerminalSearch } from './TerminalSearch';
import { MediaOverlay, detectMediaUrl, type MediaItem } from './MediaOverlay';
import '@xterm/xterm/css/xterm.css';
import './TerminalPane.css';

interface TerminalPaneProps {
  paneId: string;
  cwd?: string;
  env?: Record<string, string>;
  shell?: string | null;
  onFocus?: () => void;
  /** Optional broadcast write function — when provided, keystrokes route through this instead of direct pty_write */
  broadcastWrite?: (data: Uint8Array) => void;
}

export function TerminalPane({
  paneId,
  cwd = '.',
  env = {},
  shell = null,
  onFocus,
  broadcastWrite,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);

  const scrollbackLines = useSettingsStore((s) => s.settings.terminalScrollbackLines);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      scrollback: scrollbackLines,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: '#0b1929',
        foreground: '#c8dce8',
        cursor: '#00e5c8',
        selectionBackground: '#1a355080',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    terminal.open(containerRef.current);

    // Try WebGL addon, fall back silently
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available — canvas renderer is fine
    }

    // Image addon — Sixel + iTerm image protocol (IIP) support
    try {
      const imageAddon = new ImageAddon({
        enableSizeReports: true,
        pixelLimit: 2 ** 16, // 4096×4096
        storageLimit: 128,   // 128 MB FIFO cache
        showPlaceholder: true,
        sixelSupport: true,
        sixelScrolling: true,
        sixelPaletteLimit: 256,
        sixelSizeLimit: 25_000_000,
        iipSupport: true,
        iipSizeLimit: 20_000_000,
      });
      terminal.loadAddon(imageAddon);
    } catch {
      // Image addon not available
    }

    fitAddon.fit();

    // Spawn PTY
    const cols = terminal.cols;
    const rows = terminal.rows;

    invoke('pty_spawn', {
      paneId,
      cwd,
      env,
      shell,
      cols,
      rows,
    }).catch((err) => {
      terminal.writeln(`\r\n\x1b[31mFailed to spawn shell: ${err}\x1b[0m`);
    });

    // Listen for PTY output
    let lineBuffer = '';
    let unlisten: UnlistenFn | null = null;
    listen<{ pane_id: string; data: number[] }>('pty_output', (event) => {
      if (event.payload.pane_id === paneId) {
        const bytes = new Uint8Array(event.payload.data);
        terminal.write(bytes);

        // Scan output for media URLs (line-buffered)
        const text = new TextDecoder().decode(bytes);
        lineBuffer += text;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const media = detectMediaUrl(line);
          if (media) {
            setMediaItems((prev) => [...prev.slice(-4), media]); // keep last 5
          }
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });

    // Send keystrokes to PTY (or broadcast to multiple panes)
    const dataDisposable = terminal.onData((data) => {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(data);
      if (broadcastWrite) {
        broadcastWrite(encoded);
      } else {
        invoke('pty_write', {
          paneId,
          data: Array.from(encoded),
        }).catch(() => {
          // write failed — pane may be dead
        });
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        invoke('pty_resize', {
          paneId,
          cols: terminal.cols,
          rows: terminal.rows,
        }).catch(() => {});
      } catch {
        // fit may fail if terminal is not visible
      }
    });
    resizeObserver.observe(containerRef.current);

    // Copy/paste keybindings
    const keyDisposable = terminal.attachCustomKeyEventHandler((e) => {
      // Ctrl+Shift+C — copy
      if (e.ctrlKey && e.shiftKey && e.key === 'C' && e.type === 'keydown') {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {});
        }
        return false;
      }
      // Ctrl+Shift+V — paste
      if (e.ctrlKey && e.shiftKey && e.key === 'V' && e.type === 'keydown') {
        navigator.clipboard.readText().then((text) => {
          const encoder = new TextEncoder();
          invoke('pty_write', {
            paneId,
            data: Array.from(encoder.encode(text)),
          }).catch(() => {});
        }).catch(() => {});
        return false;
      }
      // Ctrl+F — toggle search
      if (e.ctrlKey && !e.shiftKey && e.key === 'f' && e.type === 'keydown') {
        setShowSearch((prev) => !prev);
        return false;
      }
      return true;
    });

    return () => {
      keyDisposable;
      dataDisposable.dispose();
      resizeObserver.disconnect();
      unlisten?.();
      invoke('pty_kill', { paneId }).catch(() => {});
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [paneId, cwd, env, shell, scrollbackLines, broadcastWrite]);

  const handleFocus = useCallback(() => {
    onFocus?.();
    terminalRef.current?.focus();
  }, [onFocus]);

  const dismissMedia = useCallback((id: string) => {
    setMediaItems((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <div className="terminal-pane" onClick={handleFocus}>
      <div className="terminal-pane__container" ref={containerRef} />
      {showSearch && searchAddonRef.current && (
        <TerminalSearch
          searchAddon={searchAddonRef.current}
          onClose={() => setShowSearch(false)}
        />
      )}
      <MediaOverlay items={mediaItems} onDismiss={dismissMedia} />
    </div>
  );
}
