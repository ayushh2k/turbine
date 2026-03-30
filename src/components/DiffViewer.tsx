import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './DiffViewer.css';

interface DiffViewerProps {
  projectPath: string;
  onFocus?: () => void;
}

export function DiffViewer({ projectPath, onFocus }: DiffViewerProps) {
  const [diffText, setDiffText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<string>('get_git_diff', { path: projectPath });
      setDiffText(result);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    void loadDiff();
  }, [loadDiff]);

  const renderLine = (line: string, index: number) => {
    let className = 'diff-line';
    if (line.startsWith('+') && !line.startsWith('+++')) {
      className += ' diff-line--add';
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      className += ' diff-line--remove';
    } else if (line.startsWith('@@')) {
      className += ' diff-line--hunk';
    } else if (line.startsWith('diff') || line.startsWith('index')) {
      className += ' diff-line--meta';
    }

    return (
      <div key={index} className={className}>
        <span className="diff-line-content">{line}</span>
      </div>
    );
  };

  return (
    <div className="diff-viewer" onClick={onFocus}>
      <div className="diff-viewer__header">
        <span className="diff-viewer__title">Agent Changes (git diff)</span>
        <button className="diff-viewer__refresh-btn" onClick={loadDiff} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="diff-viewer__content">
        {error && <div className="diff-viewer__error">{error}</div>}
        
        {!error && !loading && diffText === '' && (
          <div className="diff-viewer__empty">No active changes found in workspace.</div>
        )}

        {!error && diffText && (
          <div className="diff-viewer__code">
            {diffText.split('\n').map(renderLine)}
          </div>
        )}
      </div>
    </div>
  );
}
