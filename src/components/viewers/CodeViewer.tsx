import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { invoke } from '@tauri-apps/api/core';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { detectLanguage, getLanguageExtension } from '../../utils/languageDetect';
import type { FileContent } from '../../types';
import './CodeViewer.css';

interface CodeViewerProps {
  paneId: string;
  filePath: string;
  onFocus?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onActiveFileChange?: (filePath: string) => void;
}

const CHUNK_SIZE = 512 * 1024; // 512 KB chunks for incremental loading

export function CodeViewer({
  paneId,
  filePath,
  onFocus,
  onDirtyChange,
  onActiveFileChange,
}: CodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentsRef = useRef<Record<string, string>>({});
  const savedContentsRef = useRef<Record<string, string>>({});
  const activeFileRef = useRef(filePath);
  const lastRequestedFileRef = useRef(filePath);
  const [error, setError] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string[]>([filePath]);
  const [activeFilePath, setActiveFilePath] = useState(filePath);
  const [dirtyFiles, setDirtyFiles] = useState<Record<string, boolean>>({});

  const syncActiveFilePath = useCallback(
    (nextFilePath: string) => {
      if (activeFileRef.current === nextFilePath) {
        return;
      }
      activeFileRef.current = nextFilePath;
      setActiveFilePath(nextFilePath);
      onActiveFileChange?.(nextFilePath);
    },
    [onActiveFileChange],
  );

  // Track dirty state
  const markDirty = useCallback(
    (targetPath: string, isDirty: boolean) => {
      setDirtyFiles((prev) => {
        if (prev[targetPath] === isDirty) {
          return prev;
        }

        return {
          ...prev,
          [targetPath]: isDirty,
        };
      });

      if (targetPath === activeFileRef.current) {
        onDirtyChange?.(isDirty);
      }
    },
    [onDirtyChange],
  );

  useEffect(() => {
    setOpenFiles((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
    syncActiveFilePath(filePath);
  }, [filePath, syncActiveFilePath]);

  useEffect(() => {
    const handleSearch = (event: Event) => {
      const customEvent = event as CustomEvent<{ paneId?: string }>;
      if (customEvent.detail?.paneId !== paneId || !viewRef.current) {
        return;
      }

      viewRef.current.focus();
      openSearchPanel(viewRef.current);
    };

    window.addEventListener('turbine:search-focused-pane', handleSearch);
    return () => window.removeEventListener('turbine:search-focused-pane', handleSearch);
  }, [paneId]);

  const saveFile = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;

    const currentPath = activeFileRef.current;
    const content = view.state.doc.toString();
    try {
      await invoke('write_file', { path: currentPath, content });
      savedContentsRef.current[currentPath] = content;
      contentsRef.current[currentPath] = content;
      markDirty(currentPath, false);
    } catch (err) {
      setError(`Save failed: ${err}`);
    }
  }, [markDirty]);

  // Initialize editor for the active tab.
  useEffect(() => {
    if (!containerRef.current) return;

    const currentPath = activeFilePath;
    lastRequestedFileRef.current = currentPath;
    activeFileRef.current = currentPath;

    const lang = detectLanguage(currentPath);
    const langExtension = getLanguageExtension(lang);

    const extensions = [
      lineNumbers(),
      history(),
      oneDark,
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const currentContent = update.state.doc.toString();
          contentsRef.current[currentPath] = currentContent;
          markDirty(currentPath, currentContent !== (savedContentsRef.current[currentPath] ?? ''));
        }
      }),
    ];

    if (langExtension) {
      extensions.push(langExtension);
    }

    const state = EditorState.create({
      doc: contentsRef.current[currentPath] ?? '',
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    const cachedContent = contentsRef.current[currentPath];
    if (cachedContent === undefined) {
      loadFile(currentPath, view, setError)
        .then((content) => {
          if (lastRequestedFileRef.current !== currentPath) {
            return;
          }

          contentsRef.current[currentPath] = content;
          savedContentsRef.current[currentPath] = content;
          markDirty(currentPath, false);
        })
        .catch(() => {
          // handled in loadFile
        });
    } else {
      savedContentsRef.current[currentPath] ??= cachedContent;
      markDirty(currentPath, cachedContent !== (savedContentsRef.current[currentPath] ?? ''));
      setError(null);
    }

    // Watch for external changes
    let unwatchUnlisten: UnlistenFn | null = null;
    let disposed = false;

    invoke('watch_file', { path: currentPath }).catch(() => {});

    const appWindow = getCurrentWebviewWindow();
    appWindow.listen<string | { path: string }>('file_changed', (event) => {
      const changedPath =
        typeof event.payload === 'string' ? event.payload : event.payload.path;

      if (changedPath === currentPath) {
        // If the editor has unsaved changes, don't silently overwrite them.
        // Show a notification and let the user decide.
        const currentContent = view.state.doc.toString();
        const savedContent = savedContentsRef.current[currentPath] ?? '';
        const isDirty = currentContent !== savedContent;

        if (isDirty) {
          // File changed externally while editor has unsaved edits — notify user
          setError('File changed on disk. You have unsaved edits — save to keep your changes, or close and reopen to load the external version.');
          return;
        }

        loadFile(currentPath, view, setError)
          .then((content) => {
            if (lastRequestedFileRef.current !== currentPath) {
              return;
            }

            contentsRef.current[currentPath] = content;
            savedContentsRef.current[currentPath] = content;
            markDirty(currentPath, false);
          })
          .catch(() => {
            // handled in loadFile
          });
      }
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unwatchUnlisten = fn;
    });

    return () => {
      disposed = true;
      unwatchUnlisten?.();
      // Only cache content if it's non-empty — otherwise a StrictMode
      // double-mount saves the empty initial doc and the second mount
      // thinks the file was already loaded and skips the fetch.
      const currentContent = view.state.doc.toString();
      if (currentContent) {
        contentsRef.current[currentPath] = currentContent;
      }
      invoke('unwatch_file', { path: currentPath }).catch(() => {});
      view.destroy();
      viewRef.current = null;
    };
  }, [paneId, activeFilePath, markDirty]);

  // Save handler (Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        if (viewRef.current) {
          openSearchPanel(viewRef.current);
        }
      }
    };

    const container = containerRef.current;
    container?.addEventListener('keydown', handleKeyDown);
    return () => container?.removeEventListener('keydown', handleKeyDown);
  }, [saveFile]);

  const handleSelectTab = useCallback(
    (nextFilePath: string) => {
      if (nextFilePath === activeFileRef.current) {
        return;
      }

      if (viewRef.current) {
        contentsRef.current[activeFileRef.current] = viewRef.current.state.doc.toString();
      }

      syncActiveFilePath(nextFilePath);
    },
    [syncActiveFilePath],
  );

  const handleCloseTab = useCallback(
    (closingPath: string) => {
      setOpenFiles((prev) => {
        if (prev.length <= 1) {
          return prev;
        }

        const index = prev.indexOf(closingPath);
        if (index === -1) {
          return prev;
        }

        const next = prev.filter((path) => path !== closingPath);
        if (closingPath === activeFileRef.current) {
          const fallbackPath = next[Math.max(0, index - 1)] ?? next[0];
          if (fallbackPath) {
            syncActiveFilePath(fallbackPath);
          }
        }
        return next;
      });
    },
    [syncActiveFilePath],
  );

  const handleCloseTabMouseDown = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <div className="code-viewer" onClick={onFocus}>
      <div className="code-viewer__header">
        <div className="code-viewer__tabs" role="tablist" aria-label="Open files">
          {openFiles.map((path) => {
            const isActive = path === activeFilePath;
            const isDirty = dirtyFiles[path] ?? false;
            return (
              <button
                key={path}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={[
                  'code-viewer__tab',
                  isActive ? 'code-viewer__tab--active' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleSelectTab(path)}
              >
                <span className="code-viewer__tab-label">
                  {path.split('/').pop()}
                  {isDirty && <span className="code-viewer__dirty-dot" title="Unsaved changes" />}
                </span>
                {openFiles.length > 1 && (
                  <span
                    className="code-viewer__tab-close"
                    role="button"
                    tabIndex={0}
                    onMouseDown={handleCloseTabMouseDown}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCloseTab(path);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        handleCloseTab(path);
                      }
                    }}
                  >
                    ×
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="code-viewer__meta">
          <span className="code-viewer__filename" title={activeFilePath}>
            {activeFilePath}
          </span>
          <span className="code-viewer__lang">{detectLanguage(activeFilePath)}</span>
        </div>
      </div>
{error && (
        <div className="code-viewer__error">{error}</div>
      )}
      <div className="code-viewer__editor" ref={containerRef} />
    </div>
  );
}

async function loadFile(
  filePath: string,
  view: EditorView,
  setError: (v: string | null) => void,
): Promise<string> {
  setError(null);

  try {
    let fullContent = '';
    let offset = 0;
    let isComplete = false;

    while (!isComplete) {
      const result = await invoke<FileContent>('read_file', {
        path: filePath,
        offset,
        limit: CHUNK_SIZE,
      });

      fullContent += result.content;
      offset += result.content.length;
      isComplete = result.isComplete;

      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: fullContent,
        },
      });
    }

    return fullContent;
  } catch (err) {
    setError(`Failed to load file: ${err}`);
    throw err;
  }
}
