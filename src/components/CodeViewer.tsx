import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { detectLanguage, getLanguageExtension } from '../utils/languageDetect';
import type { FileContent } from '../types';
import './CodeViewer.css';

interface CodeViewerProps {
  paneId: string;
  filePath: string;
  onFocus?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const CHUNK_SIZE = 512 * 1024; // 512 KB chunks for incremental loading

export function CodeViewer({
  paneId,
  filePath,
  onFocus,
  onDirtyChange,
}: CodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedContentRef = useRef('');

  // Track dirty state
  const markDirty = useCallback(
    (isDirty: boolean) => {
      setDirty(isDirty);
      onDirtyChange?.(isDirty);
    },
    [onDirtyChange],
  );

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const lang = detectLanguage(filePath);
    const langExtension = getLanguageExtension(lang);

    const extensions = [
      lineNumbers(),
      history(),
      oneDark,
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const currentContent = update.state.doc.toString();
          markDirty(currentContent !== savedContentRef.current);
        }
      }),
    ];

    if (langExtension) {
      extensions.push(langExtension);
    }

    const state = EditorState.create({
      doc: '',
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Load file content incrementally
    loadFile(filePath, view, savedContentRef, setLoading, setError);

    // Watch for external changes
    let unwatchUnlisten: UnlistenFn | null = null;

    invoke('watch_file', { path: filePath }).catch(() => {});

    listen<{ path: string }>('file_changed', (event) => {
      if (event.payload.path === filePath) {
        // Prompt-style: reload content
        loadFile(filePath, view, savedContentRef, setLoading, setError);
        markDirty(false);
      }
    }).then((fn) => {
      unwatchUnlisten = fn;
    });

    return () => {
      unwatchUnlisten?.();
      invoke('unwatch_file', { path: filePath }).catch(() => {});
      view.destroy();
      viewRef.current = null;
    };
  }, [paneId, filePath, markDirty]);

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
  }, []);

  const saveFile = useCallback(async () => {
    if (!viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    try {
      await invoke('write_file', { path: filePath, content });
      savedContentRef.current = content;
      markDirty(false);
    } catch (err) {
      setError(`Save failed: ${err}`);
    }
  }, [filePath, markDirty]);

  return (
    <div className="code-viewer" onClick={onFocus}>
      <div className="code-viewer__header">
        <span className="code-viewer__filename">
          {filePath.split('/').pop()}
          {dirty && <span className="code-viewer__dirty-dot" title="Unsaved changes" />}
        </span>
        <span className="code-viewer__lang">{detectLanguage(filePath)}</span>
      </div>
      {loading && (
        <div className="code-viewer__loading">Loading...</div>
      )}
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
  savedContentRef: React.RefObject<string>,
  setLoading: (v: boolean) => void,
  setError: (v: string | null) => void,
) {
  setLoading(true);
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

      // Update editor with content so far
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: fullContent,
        },
      });
    }

    savedContentRef.current = fullContent;
  } catch (err) {
    setError(`Failed to load file: ${err}`);
  } finally {
    setLoading(false);
  }
}
