import { useCallback, useRef, useState, type DragEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LayoutNode, PaneConfig } from '../types';
import type { RunTaskRequest } from './TaskBoard';
import { HomeScreen } from './HomeScreen';
import { TerminalPane } from './TerminalPane';
import { CodeViewer } from './CodeViewer';
import { MediaViewer } from './MediaViewer';
import { TaskBoard } from './TaskBoard';
import { DiffViewer } from './DiffViewer';
import { SwarmPanel } from './SwarmPanel';
import { PaneToolbar } from './PaneToolbar';
import { usePaneStatus } from '../hooks/usePtyStatus';
import './PaneContainer.css';

function getPaneLabel(pane: PaneConfig): string {
  if (pane.label) return pane.label;
  const filename = pane.workingDirectory?.replace(/\\/g, '/').split('/').pop();
  switch (pane.type) {
    case 'terminal': return 'Terminal';
    case 'code_viewer': return filename ?? 'Code';
    case 'media_viewer': return filename ?? 'Media';
    case 'task_board': return 'Tasks';
    case 'diff_viewer': return 'Diff';
    case 'swarm_panel': return 'Swarm';
    default: return 'Pane';
  }
}

interface PaneContainerProps {
  layout: LayoutNode;
  panes: PaneConfig[];
  focusedPaneId: string | null;
  onFocusPane: (paneId: string) => void;
  onResize: (path: number[], delta: number) => void;
  onSplitH: (paneId: string) => void;
  onSplitV: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  broadcastWrite?: (data: Uint8Array) => void;
  onPaneConfigChange?: (paneId: string, changes: Partial<PaneConfig>) => void;
  onMovePane?: (fromId: string, toId: string) => void;
  onRunTask?: (req: RunTaskRequest) => void;
  onDetachPane?: (paneId: string) => void;
  onOpenPalette?: () => void;
  themeId?: string;
}

export function PaneContainer({
  layout,
  panes,
  focusedPaneId,
  onFocusPane,
  onResize,
  onSplitH,
  onSplitV,
  onClosePane,
  broadcastWrite,
  onPaneConfigChange,
  onMovePane,
  onRunTask,
  onDetachPane,
  onOpenPalette,
  themeId,
}: PaneContainerProps) {
  return (
    <div className="pane-container">
      <LayoutRenderer
        node={layout}
        panes={panes}
        path={[]}
        focusedPaneId={focusedPaneId}
        onFocusPane={onFocusPane}
        onResize={onResize}
        onSplitH={onSplitH}
        onSplitV={onSplitV}
        onClosePane={onClosePane}
        onDetachPane={onDetachPane}
        broadcastWrite={broadcastWrite}
        onPaneConfigChange={onPaneConfigChange}
        onMovePane={onMovePane}
        onRunTask={onRunTask}
        onOpenPalette={onOpenPalette}
        themeId={themeId}
      />
    </div>
  );
}

interface LayoutRendererProps {
  node: LayoutNode;
  panes: PaneConfig[];
  path: number[];
  focusedPaneId: string | null;
  onFocusPane: (paneId: string) => void;
  onResize: (path: number[], delta: number) => void;
  onSplitH: (paneId: string) => void;
  onSplitV: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  broadcastWrite?: (data: Uint8Array) => void;
  onPaneConfigChange?: (paneId: string, changes: Partial<PaneConfig>) => void;
  onMovePane?: (fromId: string, toId: string) => void;
  onRunTask?: (req: RunTaskRequest) => void;
  onDetachPane?: (paneId: string) => void;
  onOpenPalette?: () => void;
  themeId?: string;
}

function LayoutRenderer({
  node,
  panes,
  path,
  focusedPaneId,
  onFocusPane,
  onResize,
  onSplitH,
  onSplitV,
  onClosePane,
  onDetachPane,
  broadcastWrite,
  onPaneConfigChange,
  onMovePane,
  onRunTask,
  onOpenPalette,
  themeId,
}: LayoutRendererProps) {
  if (node.type === 'leaf') {
    return (
      <LeafPane
        paneId={node.paneId}
        panes={panes}
        isFocused={node.paneId === focusedPaneId}
        onFocusPane={onFocusPane}
        onSplitH={onSplitH}
        onSplitV={onSplitV}
        onClosePane={onClosePane}
        onDetachPane={onDetachPane}
        broadcastWrite={broadcastWrite}
        onPaneConfigChange={onPaneConfigChange}
        onMovePane={onMovePane}
        onRunTask={onRunTask}
        onOpenPalette={onOpenPalette}
        themeId={themeId}
      />
    );
  }

  // Split node
  const isHorizontal = node.direction === 'horizontal';
  const firstFlex = node.ratio;
  const secondFlex = 1 - node.ratio;

  return (
    <div
      className="pane-split"
      style={{ flexDirection: isHorizontal ? 'row' : 'column' }}
    >
      <div style={{ flex: firstFlex, display: 'flex', overflow: 'hidden' }}>
        <LayoutRenderer
          node={node.children[0]}
          panes={panes}
          path={[...path, 0]}
          focusedPaneId={focusedPaneId}
          onFocusPane={onFocusPane}
          onResize={onResize}
          onSplitH={onSplitH}
          onSplitV={onSplitV}
          onClosePane={onClosePane}
          onDetachPane={onDetachPane}
          broadcastWrite={broadcastWrite}
          onPaneConfigChange={onPaneConfigChange}
          onMovePane={onMovePane}
          onRunTask={onRunTask}
          onOpenPalette={onOpenPalette}
          themeId={themeId}
        />
      </div>
      <ResizeHandle
        direction={isHorizontal ? 'horizontal' : 'vertical'}
        onResizeDelta={(delta) => {
          onResize(path, delta);
        }}
      />
      <div style={{ flex: secondFlex, display: 'flex', overflow: 'hidden' }}>
        <LayoutRenderer
          node={node.children[1]}
          panes={panes}
          path={[...path, 1]}
          focusedPaneId={focusedPaneId}
          onFocusPane={onFocusPane}
          onResize={onResize}
          onSplitH={onSplitH}
          onSplitV={onSplitV}
          onClosePane={onClosePane}
          onDetachPane={onDetachPane}
          broadcastWrite={broadcastWrite}
          onPaneConfigChange={onPaneConfigChange}
          onMovePane={onMovePane}
          onRunTask={onRunTask}
          onOpenPalette={onOpenPalette}
          themeId={themeId}
        />
      </div>
    </div>
  );
}

interface LeafPaneProps {
  paneId: string;
  panes: PaneConfig[];
  isFocused: boolean;
  onFocusPane: (paneId: string) => void;
  onSplitH: (paneId: string) => void;
  onSplitV: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onDetachPane?: (paneId: string) => void;
  broadcastWrite?: (data: Uint8Array) => void;
  onPaneConfigChange?: (paneId: string, changes: Partial<PaneConfig>) => void;
  onMovePane?: (fromId: string, toId: string) => void;
  onRunTask?: (req: RunTaskRequest) => void;
  onOpenPalette?: () => void;
  themeId?: string;
}

function LeafPane({
  paneId,
  panes,
  isFocused,
  onFocusPane,
  onSplitH,
  onSplitV,
  onClosePane,
  onDetachPane,
  broadcastWrite,
  onPaneConfigChange,
  onMovePane,
  onRunTask,
  onOpenPalette,
  themeId,
}: LeafPaneProps) {
  const pane = panes.find((p) => p.id === paneId);
  const { restartPane } = usePaneStatus(paneId, {
    cwd: pane?.workingDirectory,
    env: pane?.envVars,
    startupCommand: pane?.startupCommand,
  });

  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData('text/plain', paneId);
      e.dataTransfer.effectAllowed = 'move';
      setIsDragging(true);
    },
    [paneId],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const sourceId = e.dataTransfer.getData('text/plain');
      if (sourceId && sourceId !== paneId && onMovePane) {
        onMovePane(sourceId, paneId);
      }
    },
    [paneId, onMovePane],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setIsDragOver(false);
  }, []);

  // Memoize callbacks passed to sub-components to prevent re-renders
  const handleFocusPane = useCallback(() => onFocusPane(paneId), [onFocusPane, paneId]);
  const handleSplitH = useCallback(() => onSplitH(paneId), [onSplitH, paneId]);
  const handleSplitV = useCallback(() => onSplitV(paneId), [onSplitV, paneId]);
  const handleClosePane = useCallback(() => onClosePane(paneId), [onClosePane, paneId]);
  const handleDetachPane = useCallback(() => onDetachPane?.(paneId), [onDetachPane, paneId]);
  
  const handleActiveFileChange = useCallback(
    (path: string) => {
      if (onPaneConfigChange) {
        onPaneConfigChange(paneId, { workingDirectory: path });
      }
    },
    [onPaneConfigChange, paneId]
  );
  
  const handleAutoLaunchChange = useCallback(
    (v: boolean) => {
      if (onPaneConfigChange) {
        onPaneConfigChange(paneId, { autoLaunch: v });
      }
    },
    [onPaneConfigChange, paneId]
  );
  
  const handleStartupCommandChange = useCallback(
    (v: string | null) => {
      if (onPaneConfigChange) {
        onPaneConfigChange(paneId, { startupCommand: v });
      }
    },
    [onPaneConfigChange, paneId]
  );

  const handleRunCommand = useCallback(
    (command: string) => {
      const encoder = new TextEncoder();
      invoke('pty_write', {
        paneId,
        data: Array.from(encoder.encode(`${command}\n`)),
      }).catch(() => {});
    },
    [paneId]
  );

  const leafClasses = [
    'pane-leaf',
    isFocused ? 'pane-leaf--focused' : '',
    isDragOver ? 'pane-leaf--drag-over' : '',
    isDragging ? 'pane-leaf--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={leafClasses}
      data-pane-id={paneId}
      style={{ flex: 1 }}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
    >
      {pane && pane.type !== 'home' && (
        <div className="pane-title-bar">
          <span className="pane-title-bar__label">{getPaneLabel(pane)}</span>
          <button
            className="pane-title-bar__close"
            onClick={handleClosePane}
            title="Close pane"
          >
            ×
          </button>
        </div>
      )}
      {pane?.type === 'home' && (
        <HomeScreen
          paneId={paneId}
          workspaceId={pane.workspaceId}
          onFocus={handleFocusPane}
          onOpenPalette={onOpenPalette}
        />
      )}
      {pane?.type === 'terminal' && (
        <TerminalPane
          paneId={paneId}
          cwd={pane.workingDirectory}
          env={pane.envVars}
          startupCommand={pane.startupCommand}
          autoLaunch={pane.autoLaunch}
          onFocus={handleFocusPane}
          broadcastWrite={broadcastWrite}
          themeId={themeId}
          onSplitH={handleSplitH}
          onSplitV={handleSplitV}
          onClosePane={handleClosePane}
          onRestart={restartPane}
        />
      )}
      {pane?.type === 'code_viewer' && pane.workingDirectory && (
        <CodeViewer
          paneId={paneId}
          filePath={pane.workingDirectory}
          onFocus={handleFocusPane}
          onActiveFileChange={onPaneConfigChange ? handleActiveFileChange : undefined}
        />
      )}
      {pane?.type === 'task_board' && pane.workingDirectory && (
        <TaskBoard
          projectPath={pane.workingDirectory}
          workspaceId={pane.workspaceId}
          onFocus={handleFocusPane}
          onRunTask={onRunTask}
        />
      )}
      {pane?.type === 'media_viewer' && pane.workingDirectory && (
        <MediaViewer
          filePath={pane.workingDirectory}
          onFocus={() => onFocusPane(paneId)}
        />
      )}
      {pane?.type === 'diff_viewer' && pane.workingDirectory && (
        <DiffViewer
          projectPath={pane.workingDirectory}
          onFocus={() => onFocusPane(paneId)}
        />
      )}
      {pane?.type === 'swarm_panel' && pane.workingDirectory && (
        <SwarmPanel
          projectPath={pane.workingDirectory}
          workspaceId={pane.workspaceId}
          sourcePaneId={paneId}
          onFocus={handleFocusPane}
        />
      )}
      {!pane && (
        <div className="pane-placeholder">
          Pane {paneId.slice(0, 8)}
        </div>
      )}
      {pane?.type !== 'home' && <PaneToolbar
        onSplitH={handleSplitH}
        onSplitV={handleSplitV}
        onClose={handleClosePane}
        onDetach={onDetachPane ? handleDetachPane : undefined}
        autoLaunch={pane?.type === 'terminal' ? pane.autoLaunch : undefined}
        startupCommand={pane?.type === 'terminal' ? pane.startupCommand : undefined}
        onAutoLaunchChange={onPaneConfigChange && pane?.type === 'terminal' ? handleAutoLaunchChange : undefined}
        onStartupCommandChange={onPaneConfigChange && pane?.type === 'terminal' ? handleStartupCommandChange : undefined}
        onRunCommand={pane?.type === 'terminal' ? handleRunCommand : undefined}
      />}
    </div>
  );
}

/* Draggable resize handle */
interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResizeDelta: (delta: number) => void;
}

function ResizeHandle({ direction, onResizeDelta }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const startPos = useRef(0);
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;

      // Use the parent split container's size for accurate ratio calculation
      const parent = handleRef.current?.parentElement;
      const containerSize = parent
        ? direction === 'horizontal'
          ? parent.getBoundingClientRect().width
          : parent.getBoundingClientRect().height
        : direction === 'horizontal'
          ? window.innerWidth
          : window.innerHeight;

      const handleMouseMove = (ev: MouseEvent) => {
        const current = direction === 'horizontal' ? ev.clientX : ev.clientY;
        const diff = current - startPos.current;
        const delta = diff / containerSize;
        if (Math.abs(delta) > 0.001) {
          onResizeDelta(delta);
          startPos.current = current;
        }
      };

      const handleMouseUp = () => {
        setDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [direction, onResizeDelta],
  );

  return (
    <div
      ref={handleRef}
      className={`resize-handle resize-handle--${direction} ${dragging ? 'resize-handle--active' : ''}`}
      onMouseDown={handleMouseDown}
    />
  );
}
