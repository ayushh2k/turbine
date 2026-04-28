import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ImageAddon } from '@xterm/addon-image';
import { invoke } from '@tauri-apps/api/core';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useSettingsStore } from '../../state/settingsStore';
import { getXtermTheme } from '../../themes/themeEngine';
import { useCommandBlocks } from '../../hooks/useCommandBlocks';
import { TerminalSearch } from './TerminalSearch';
import { CommandBlocksPanel } from './CommandBlocksPanel';
import { MediaOverlay, detectMediaUrl, type MediaItem } from '../viewers/MediaOverlay';
import { TerminalContextMenu } from './TerminalContextMenu';
import { usePtyStatusStore } from '../../hooks/usePtyStatus';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { useSearchStore } from '../../state/searchStore';
import { spawnPaneSession } from '../../state/terminalSession';
import '@xterm/xterm/css/xterm.css';
import './TerminalPane.css';

interface TerminalPaneProps {
  paneId: string;
  cwd?: string;
  env?: Record<string, string>;
  shell?: string | null;
  startupCommand?: string | null;
  autoLaunch?: boolean;
  isFocused?: boolean;
  onFocus?: () => void;
  broadcastWrite?: (data: Uint8Array) => void;
  themeId?: string;
  onSplitH?: () => void;
  onSplitV?: () => void;
  onClosePane?: () => void;
  onDetachPane?: () => void;
  onRestart?: () => void;
}

function TerminalPaneInner({
  paneId,
  cwd = '.',
  env = {},
  shell = null,
  startupCommand = null,
  autoLaunch = false,
  isFocused = false,
  onFocus,
  broadcastWrite,
  themeId,
  onSplitH,
  onSplitV,
  onClosePane,
  onDetachPane,
  onRestart,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showCommandBlocks, setShowCommandBlocks] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const showScrollDownRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const broadcastWriteRef = useRef<typeof broadcastWrite>(broadcastWrite);
  const {
    blocks: commandBlocks,
    appendOutput,
    toggleCollapse,
    clearBlocks,
  } = useCommandBlocks();

  const scrollbackLines = useSettingsStore((s) => s.settings.terminalScrollbackLines);
  const defaultShell = useSettingsStore((s) => s.settings.defaultShell);

  // Global search-across-panes state
  const globalSearchQuery = useSearchStore((s) => s.query);
  const globalSearchVisible = useSearchStore((s) => s.visible);
  const globalSearchScope = useSearchStore((s) => s.paneScope);
  const globalFindTick = useSearchStore((s) => s.findTick);
  const globalFindDirection = useSearchStore((s) => s.findDirection);
  const setStatus = usePtyStatusStore((s) => s.setStatus);
  const setPaneSize = usePtyStatusStore((s) => s.setPaneSize);
  const removePaneSize = usePtyStatusStore((s) => s.removePaneSize);
  const effectiveShell = shell ?? defaultShell;

  // PTY process status for session-ended overlay
  const ptyEntry = usePtyStatusStore((s) => s.statuses.get(paneId));
  const processExited = ptyEntry != null && ptyEntry.status !== 'running';
  const exitCode = ptyEntry?.exitCode;

  useEffect(() => {
    if (commandBlocks.length > 0) {
      setShowCommandBlocks(true);
    }
  }, [commandBlocks.length]);

  useEffect(() => {
    broadcastWriteRef.current = broadcastWrite;
  }, [broadcastWrite]);

  useEffect(() => {
    const handleSearch = (event: Event) => {
      const customEvent = event as CustomEvent<{ paneId?: string }>;
      if (customEvent.detail?.paneId !== paneId) {
        return;
      }

      setShowSearch(true);
      terminalRef.current?.focus();
    };

    window.addEventListener('turbine:search-focused-pane', handleSearch);
    return () => window.removeEventListener('turbine:search-focused-pane', handleSearch);
  }, [paneId]);

  // Global search-across-panes: highlight matches when query changes
  useEffect(() => {
    const addon = searchAddonRef.current;
    if (!addon) return;

    // Determine if this pane should participate in global search
    const shouldSearch = globalSearchVisible && globalSearchQuery &&
      (globalSearchScope === 'all' || (globalSearchScope === 'focused' && isFocused));

    if (shouldSearch) {
      addon.findNext(globalSearchQuery);
    } else {
      addon.clearDecorations();
    }
  }, [globalSearchQuery, globalSearchVisible, globalSearchScope, isFocused]);

  // Global search: respond to find-next / find-previous button clicks
  useEffect(() => {
    if (globalFindTick === 0) return; // skip initial render
    const addon = searchAddonRef.current;
    if (!addon || !globalSearchQuery || !globalSearchVisible) return;

    const shouldSearch = globalSearchScope === 'all' || (globalSearchScope === 'focused' && isFocused);
    if (!shouldSearch) return;

    if (globalFindDirection === 'next') {
      addon.findNext(globalSearchQuery);
    } else {
      addon.findPrevious(globalSearchQuery);
    }
  }, [globalFindTick, globalFindDirection, globalSearchQuery, globalSearchVisible, globalSearchScope, isFocused]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.theme = themeId
      ? getXtermTheme(themeId)
      : {
          background: '#0b1929',
          foreground: '#c8dce8',
          cursor: '#00e5c8',
          selectionBackground: '#1a355080',
        };
  }, [themeId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.scrollback = scrollbackLines;
  }, [scrollbackLines]);

  // Initialize terminal and spawn the PTY once per session-defining input.
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      scrollback: scrollbackLines,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: (themeId ? getXtermTheme(themeId) : undefined) ?? {
        background: '#0b1929',
        foreground: '#c8dce8',
        cursor: '#00e5c8',
        selectionBackground: '#1a355080',
      },
      allowProposedApi: true,
      macOptionIsMeta: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);

    // Web links addon — make URLs in terminal output clickable
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      // Open URL in default browser via Tauri
      window.open(uri, '_blank');
    });
    terminal.loadAddon(webLinksAddon);

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
    setPaneSize(paneId, terminal.cols, terminal.rows);
    setStatus(paneId, 'running', null);
    clearBlocks();
    setShowCommandBlocks(false);

    spawnPaneSession({
      paneId,
      cwd,
      env,
      shell: effectiveShell,
      startupCommand,
      runStartupCommand: autoLaunch,
      cols: terminal.cols,
      rows: terminal.rows,
    }).then(() => {
      // Clear startup command after it runs so it doesn't re-execute on remount
      // (layout tree changes from splits cause React to remount terminals)
      if (autoLaunch && startupCommand) {
        useWorkspaceStore.setState((s) => ({
          workspaces: s.workspaces.map((w) => ({
            ...w,
            panes: w.panes.map((p) =>
              p.id === paneId ? { ...p, autoLaunch: false, startupCommand: null } : p,
            ),
          })),
        }));
      }
    }).catch((err) => {
      setStatus(paneId, 'errored', null);
      terminal.writeln(`\r\n\x1b[31mFailed to spawn shell: ${err}\x1b[0m`);
    });

    // Listen for PTY output (scoped to this window to prevent duplicate delivery)
    let lineBuffer = '';
    let unlisten: UnlistenFn | null = null;
    let disposed = false;
    let lastSeq = 0;
    const appWindow = getCurrentWebviewWindow();
    appWindow.listen<{ pane_id: string; data: number[]; seq: number }>('pty_output', (event) => {
      if (event.payload.pane_id === paneId) {
        // Deduplicate: skip events already seen (seq is monotonically increasing per pane)
        if (event.payload.seq <= lastSeq) {
          return;
        }
        lastSeq = event.payload.seq;

        const bytes = new Uint8Array(event.payload.data);
        terminal.write(bytes);

        // Scan output for media URLs (line-buffered)
        const text = new TextDecoder().decode(bytes);
        appendOutput(text);
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
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    });

    // Send keystrokes to PTY (or broadcast to multiple panes)
    const dataDisposable = terminal.onData((data) => {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(data);
      if (broadcastWriteRef.current) {
        broadcastWriteRef.current(encoded);
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
        setPaneSize(paneId, terminal.cols, terminal.rows);
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
    terminal.attachCustomKeyEventHandler((e) => {
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

    // Scroll-to-bottom tracking: use rAF to batch updates and avoid re-render storms
    const updateScrollState = () => {
      const buffer = terminal.buffer.active;
      const isAtBottom = buffer.viewportY >= buffer.baseY;
      const shouldShow = !isAtBottom;
      if (showScrollDownRef.current !== shouldShow) {
        showScrollDownRef.current = shouldShow;
        setShowScrollDown(shouldShow);
      }
    };

    const scheduleScrollCheck = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        updateScrollState();
      });
    };

    const scrollDisposable = terminal.onScroll(scheduleScrollCheck);
    const writeDisposable = terminal.onWriteParsed(scheduleScrollCheck);

    return () => {
      disposed = true;
      dataDisposable.dispose();
      scrollDisposable.dispose();
      writeDisposable.dispose();
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      resizeObserver.disconnect();
      unlisten?.();
      removePaneSize(paneId);
      clearBlocks();

      // Only kill PTY if the pane was actually removed from the workspace.
      // During splits, the layout tree restructures causing React to unmount/remount
      // the old terminal — but the pane still exists, so we must keep the PTY alive.
      const ws = useWorkspaceStore.getState();
      const activeWs = ws.workspaces.find((w) => w.id === ws.activeWorkspaceId);
      const paneStillExists = activeWs?.panes.some((p) => p.id === paneId);
      if (!paneStillExists) {
        invoke('pty_kill', { paneId }).catch(() => {});
      }

      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [paneId, cwd, env, effectiveShell, startupCommand, autoLaunch, removePaneSize, setPaneSize, setStatus, appendOutput, clearBlocks]);

  const handleFocus = useCallback(() => {
    onFocus?.();
    terminalRef.current?.focus();
  }, [onFocus]);

  const dismissMedia = useCallback((id: string) => {
    setMediaItems((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleContextMenuEvent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleContextCopy = useCallback(() => {
    const selection = terminalRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).catch(() => {});
    }
  }, []);

  const handleContextPaste = useCallback(() => {
    navigator.clipboard.readText().then((text) => {
      const encoder = new TextEncoder();
      invoke('pty_write', {
        paneId,
        data: Array.from(encoder.encode(text)),
      }).catch(() => {});
    }).catch(() => {});
  }, [paneId]);

  const handleContextClear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const handleScrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom();
  }, []);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/turbine-filepath') || e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setFileDragOver(true);
    }
  }, []);

  const handleFileDragLeave = useCallback(() => {
    setFileDragOver(false);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFileDragOver(false);
    const filePath = e.dataTransfer.getData('application/turbine-filepath');
    if (filePath) {
      // Quote the path if it contains spaces
      const safePath = filePath.includes(' ') ? `"${filePath}"` : filePath;
      const encoder = new TextEncoder();
      invoke('pty_write', {
        paneId,
        data: Array.from(encoder.encode(safePath)),
      }).catch(() => {});
    }
  }, [paneId]);

  return (
    <div className={`terminal-pane${fileDragOver ? ' terminal-pane--file-drag-over' : ''}`} data-pane-id={paneId} onClick={handleFocus} onContextMenu={handleContextMenuEvent} onDragOver={handleFileDragOver} onDragLeave={handleFileDragLeave} onDrop={handleFileDrop}>
      <div className="terminal-pane__container" ref={containerRef} />
      {commandBlocks.length > 0 && !showCommandBlocks && (
        <button
          type="button"
          className="terminal-pane__blocks-toggle"
          onClick={() => setShowCommandBlocks(true)}
        >
          Blocks {commandBlocks.length}
        </button>
      )}
      {showCommandBlocks && commandBlocks.length > 0 && (
        <CommandBlocksPanel
          blocks={commandBlocks}
          onToggleCollapse={toggleCollapse}
          onClose={() => setShowCommandBlocks(false)}
        />
      )}
      {showSearch && searchAddonRef.current && (
        <TerminalSearch
          searchAddon={searchAddonRef.current}
          onClose={() => setShowSearch(false)}
        />
      )}
      <MediaOverlay items={mediaItems} onDismiss={dismissMedia} />
      {showScrollDown && (
        <button
          type="button"
          className="terminal-pane__scroll-down"
          onClick={handleScrollToBottom}
          title="Scroll to bottom"
        >
          ↓
        </button>
      )}
      {contextMenu && (
        <TerminalContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={handleContextCopy}
          onPaste={handleContextPaste}
          onClear={handleContextClear}
          onSearch={() => setShowSearch(true)}
          onSplitH={() => onSplitH?.()}
          onSplitV={() => onSplitV?.()}
          onClosePane={() => onClosePane?.()}
          onDetachPane={() => onDetachPane?.()}
          hasSelection={terminalRef.current?.hasSelection() ?? false}
        />
      )}
      {processExited && (
        <div className="terminal-pane__session-ended" aria-live="polite">
          <span>Process exited (code: {exitCode ?? 'unknown'})</span>
          {onRestart && (
            <button className="terminal-pane__restart-btn" onClick={onRestart}>
              Restart
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const TerminalPane = memo(TerminalPaneInner);
