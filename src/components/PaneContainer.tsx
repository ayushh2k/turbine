import { useCallback, useRef, useState, type DragEvent } from 'react';
import type { LayoutNode, PaneConfig } from '../types';
import { TerminalPane } from './TerminalPane';
import { CodeViewer } from './CodeViewer';
import { MediaViewer } from './MediaViewer';
import { PaneToolbar } from './PaneToolbar';
import { usePaneStatus } from '../hooks/usePtyStatus';
import './PaneContainer.css';

interface PaneContainerProps {
  layout: LayoutNode;
  panes: PaneConfig[];
  focusedPaneId: string | null;
  onFocusPane: (paneId: string) => void;
  onResize: (paneId: string, delta: number) => void;
  onSplitH: (paneId: string) => void;
  onSplitV: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  broadcastWrite?: (data: Uint8Array) => void;
  onPaneConfigChange?: (paneId: string, changes: Partial<PaneConfig>) => void;
  onMovePane?: (fromId: string, toId: string) => void;
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
  themeId,
}: PaneContainerProps) {
  return (
    <div className="pane-container">
      <LayoutRenderer
        node={layout}
        panes={panes}
        focusedPaneId={focusedPaneId}
        onFocusPane={onFocusPane}
        onResize={onResize}
        onSplitH={onSplitH}
        onSplitV={onSplitV}
        onClosePane={onClosePane}
        broadcastWrite={broadcastWrite}
        onPaneConfigChange={onPaneConfigChange}
        onMovePane={onMovePane}
        themeId={themeId}
      />
    </div>
  );
}

interface LayoutRendererProps {
  node: LayoutNode;
  panes: PaneConfig[];
  focusedPaneId: string | null;
  onFocusPane: (paneId: string) => void;
  onResize: (paneId: string, delta: number) => void;
  onSplitH: (paneId: string) => void;
  onSplitV: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  broadcastWrite?: (data: Uint8Array) => void;
  onPaneConfigChange?: (paneId: string, changes: Partial<PaneConfig>) => void;
  onMovePane?: (fromId: string, toId: string) => void;
  themeId?: string;
}

function LayoutRenderer({
  node,
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
        broadcastWrite={broadcastWrite}
        onPaneConfigChange={onPaneConfigChange}
        onMovePane={onMovePane}
        themeId={themeId}
      />
    );
  }

  // Split node
  const isHorizontal = node.direction === 'horizontal';
  const firstFlex = node.ratio;
  const secondFlex = 1 - node.ratio;

  // Find a paneId in the first child for resize targeting
  const firstLeafId = findFirstLeaf(node.children[0]);

  return (
    <div
      className="pane-split"
      style={{ flexDirection: isHorizontal ? 'row' : 'column' }}
    >
      <div style={{ flex: firstFlex, display: 'flex', overflow: 'hidden' }}>
        <LayoutRenderer
          node={node.children[0]}
          panes={panes}
          focusedPaneId={focusedPaneId}
          onFocusPane={onFocusPane}
          onResize={onResize}
          onSplitH={onSplitH}
          onSplitV={onSplitV}
          onClosePane={onClosePane}
          broadcastWrite={broadcastWrite}
          onPaneConfigChange={onPaneConfigChange}
          onMovePane={onMovePane}
          themeId={themeId}
        />
      </div>
      <ResizeHandle
        direction={isHorizontal ? 'horizontal' : 'vertical'}
        onResizeDelta={(delta) => {
          if (firstLeafId) onResize(firstLeafId, delta);
        }}
      />
      <div style={{ flex: secondFlex, display: 'flex', overflow: 'hidden' }}>
        <LayoutRenderer
          node={node.children[1]}
          panes={panes}
          focusedPaneId={focusedPaneId}
          onFocusPane={onFocusPane}
          onResize={onResize}
          onSplitH={onSplitH}
          onSplitV={onSplitV}
          onClosePane={onClosePane}
          broadcastWrite={broadcastWrite}
          onPaneConfigChange={onPaneConfigChange}
          onMovePane={onMovePane}
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
  broadcastWrite?: (data: Uint8Array) => void;
  onPaneConfigChange?: (paneId: string, changes: Partial<PaneConfig>) => void;
  onMovePane?: (fromId: string, toId: string) => void;
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
  broadcastWrite,
  onPaneConfigChange,
  onMovePane,
  themeId,
}: LeafPaneProps) {
  const pane = panes.find((p) => p.id === paneId);
  const { status, exitCode, restartPane } = usePaneStatus(paneId, {
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
      style={{ flex: 1 }}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
    >
      {pane?.type === 'terminal' && (
        <TerminalPane
          paneId={paneId}
          cwd={pane.workingDirectory}
          env={pane.envVars}
          onFocus={() => onFocusPane(paneId)}
          broadcastWrite={broadcastWrite}
          themeId={themeId}
          onSplitH={() => onSplitH(paneId)}
          onSplitV={() => onSplitV(paneId)}
          onClosePane={() => onClosePane(paneId)}
        />
      )}
      {pane?.type === 'code_viewer' && pane.workingDirectory && (
        <CodeViewer
          paneId={paneId}
          filePath={pane.workingDirectory}
          onFocus={() => onFocusPane(paneId)}
          onActiveFileChange={
            onPaneConfigChange
              ? (path) => onPaneConfigChange(paneId, { workingDirectory: path })
              : undefined
          }
        />
      )}
      {pane?.type === 'media_viewer' && pane.workingDirectory && (
        <MediaViewer
          filePath={pane.workingDirectory}
          onFocus={() => onFocusPane(paneId)}
        />
      )}
      {pane && pane.type !== 'terminal' && pane.type !== 'code_viewer' && pane.type !== 'media_viewer' && (
        <div className="pane-placeholder">
          {pane.type} — {paneId.slice(0, 8)}
        </div>
      )}
      {!pane && (
        <div className="pane-placeholder">
          Pane {paneId.slice(0, 8)}
        </div>
      )}
      <PaneToolbar
        onSplitH={() => onSplitH(paneId)}
        onSplitV={() => onSplitV(paneId)}
        onClose={() => onClosePane(paneId)}
        autoLaunch={pane?.type === 'terminal' ? pane.autoLaunch : undefined}
        startupCommand={pane?.type === 'terminal' ? pane.startupCommand : undefined}
        onAutoLaunchChange={
          onPaneConfigChange && pane?.type === 'terminal'
            ? (v) => onPaneConfigChange(paneId, { autoLaunch: v })
            : undefined
        }
        onStartupCommandChange={
          onPaneConfigChange && pane?.type === 'terminal'
            ? (v) => onPaneConfigChange(paneId, { startupCommand: v })
            : undefined
        }
        processStatus={pane?.type === 'terminal' ? status : null}
        exitCode={exitCode}
        onRestart={pane?.type === 'terminal' ? restartPane : undefined}
      />
    </div>
  );
}

function findFirstLeaf(node: LayoutNode): string | null {
  if (node.type === 'leaf') return node.paneId;
  return findFirstLeaf(node.children[0]);
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
      setDragging(true);
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;

      const handleMouseMove = (ev: MouseEvent) => {
        const current = direction === 'horizontal' ? ev.clientX : ev.clientY;
        const diff = current - startPos.current;
        // Normalize delta to a ratio-like value (pixels / viewport dimension)
        const containerSize =
          direction === 'horizontal' ? window.innerWidth : window.innerHeight;
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
