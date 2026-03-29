import { useCallback, useRef, useState } from 'react';
import type { LayoutNode, PaneConfig } from '../types';
import { TerminalPane } from './TerminalPane';
import { CodeViewer } from './CodeViewer';
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
  themeId,
}: LeafPaneProps) {
  const pane = panes.find((p) => p.id === paneId);
  const { status, exitCode, restartPane } = usePaneStatus(paneId, {
    cwd: pane?.workingDirectory,
    env: pane?.envVars,
    shell: pane?.startupCommand,
  });

  return (
    <div
      className={`pane-leaf ${isFocused ? 'pane-leaf--focused' : ''}`}
      style={{ flex: 1 }}
    >
      {pane?.type === 'terminal' && (
        <TerminalPane
          paneId={paneId}
          cwd={pane.workingDirectory}
          env={pane.envVars}
          shell={pane.startupCommand}
          onFocus={() => onFocusPane(paneId)}
          broadcastWrite={broadcastWrite}
          themeId={themeId}
        />
      )}
      {pane?.type === 'code_viewer' && pane.workingDirectory && (
        <CodeViewer
          paneId={paneId}
          filePath={pane.workingDirectory}
          onFocus={() => onFocusPane(paneId)}
        />
      )}
      {pane && pane.type !== 'terminal' && pane.type !== 'code_viewer' && (
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
        autoLaunch={pane?.autoLaunch}
        startupCommand={pane?.startupCommand}
        onAutoLaunchChange={
          onPaneConfigChange
            ? (v) => onPaneConfigChange(paneId, { autoLaunch: v })
            : undefined
        }
        onStartupCommandChange={
          onPaneConfigChange
            ? (v) => onPaneConfigChange(paneId, { startupCommand: v })
            : undefined
        }
        processStatus={pane?.type === 'terminal' ? status : undefined}
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
