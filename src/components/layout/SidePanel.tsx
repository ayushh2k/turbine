import { useState, useRef, useCallback } from 'react';
import { FileBrowser } from '../viewers/FileBrowser';
import { TaskBoard, type RunTaskRequest } from '../viewers/TaskBoard';
import { SwarmPanel } from '../swarm/SwarmPanel';
import type { FileTreeEntry } from '../../types';
import type { SidePanelId } from './ActivityBar';
import './SidePanel.css';

const MIN_WIDTH = 160;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 240;

interface SidePanelProps {
  activePanel: SidePanelId | null;
  workspaceId: string | null;
  focusedPaneId: string | null;
  rootPath: string | null;
  entries: FileTreeEntry[];
  activeFilePath?: string | null;
  onOpenFile: (path: string) => void;
  onRefresh?: () => void;
  onRunTask?: (req: RunTaskRequest) => void;
}

export function SidePanel({
  activePanel,
  workspaceId,
  focusedPaneId,
  rootPath,
  entries,
  activeFilePath,
  onOpenFile,
  onRefresh,
  onRunTask,
}: SidePanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    startX.current = e.clientX;
    startWidth.current = width;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX.current;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setWidth(next);
    };

    const handleMouseUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  const isOpen = activePanel !== null;

  return (
    <div
      className={[
        'side-panel',
        isOpen ? 'side-panel--open' : '',
        dragging ? 'side-panel--dragging' : '',
      ].filter(Boolean).join(' ')}
      style={isOpen ? { width } : undefined}
    >
      <div className="side-panel__content">
        {activePanel === 'files' && (
          <FileBrowser
            rootPath={rootPath}
            entries={entries}
            activeFilePath={activeFilePath}
            onOpenFile={onOpenFile}
            onRefresh={onRefresh}
          />
        )}
        {activePanel === 'tasks' && rootPath && (
          <TaskBoard projectPath={rootPath} workspaceId={workspaceId ?? ''} onRunTask={onRunTask} />
        )}
        {activePanel === 'tasks' && !rootPath && (
          <div className="side-panel__placeholder">Open a folder to see tasks.</div>
        )}
        {activePanel === 'swarm' && rootPath && (
          <SwarmPanel projectPath={rootPath} workspaceId={workspaceId ?? ''} sourcePaneId={focusedPaneId} />
        )}
        {activePanel === 'swarm' && !rootPath && (
          <div className="side-panel__placeholder">Open a folder to see swarm runs.</div>
        )}
      </div>
      {isOpen && (
        <div
          className={['side-panel__resize-handle', dragging ? 'side-panel__resize-handle--active' : ''].filter(Boolean).join(' ')}
          onMouseDown={handleMouseDown}
        />
      )}
    </div>
  );
}
