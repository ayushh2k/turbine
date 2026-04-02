import { useState, useRef, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useWorkspaceStore } from '../state/workspaceStore';
import { usePtyStatusStore } from '../hooks/usePtyStatus';
import { openWorkspaceFolder } from '../utils/openWorkspaceFolder';
import { TemplatePicker } from './TemplatePicker';
import type { PaneTemplate } from '../types';
import './TabBar.css';

interface TabBarProps {
  onContextMenu?: (e: React.MouseEvent, workspaceId: string) => void;
  onApplyTemplate?: (template: PaneTemplate) => void;
}

export function TabBar({ onContextMenu, onApplyTemplate }: TabBarProps) {
  const {
    workspaces,
    activeWorkspaceId,
    broadcastMode,
    switchWorkspace,
    deleteWorkspace,
    reorderWorkspaces,
    renameWorkspace,
  } = useWorkspaceStore();

  const statuses = usePtyStatusStore((s) => s.statuses);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const sorted = [...workspaces].sort((a, b) => a.tabOrder - b.tabOrder);

  const handleDoubleClick = useCallback((ws: { id: string; name: string }) => {
    setEditingId(ws.id);
    setEditValue(ws.name);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim()) {
      renameWorkspace(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  }, [editingId, editValue, renameWorkspace]);

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverIndex(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = Number(e.dataTransfer.getData('text/plain'));
      if (!isNaN(fromIndex) && fromIndex !== toIndex) {
        reorderWorkspaces(fromIndex, toIndex);
      }
      setDragIndex(null);
      setDragOverIndex(null);
      dragCounter.current = 0;
    },
    [reorderWorkspaces],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragCounter.current = 0;
  }, []);

  const handleTitleBarDoubleClick = useCallback((e: React.MouseEvent) => {
    // Only trigger on the drag region (not on tabs/buttons which are no-drag)
    const target = e.target as HTMLElement;
    if (target.closest('.tab-bar__tab, .tab-bar__actions, button')) return;
    getCurrentWindow().toggleMaximize();
  }, []);

  return (
    <div className="tab-bar" role="tablist" aria-label="Workspaces" onDoubleClick={handleTitleBarDoubleClick}>
      <div className="tab-bar__tabs">
        {sorted.map((ws, index) => {
          const isActive = ws.id === activeWorkspaceId;
          const isDragging = dragIndex === index;
          const isDragOver = dragOverIndex === index;
          const runningCount = ws.panes.filter(
            (p) => statuses.get(p.id)?.status === 'running'
          ).length;

          return (
            <div
              key={ws.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              className={[
                'tab-bar__tab',
                isActive && 'tab-bar__tab--active',
                isDragging && 'tab-bar__tab--dragging',
                isDragOver && 'tab-bar__tab--drag-over',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable
              onClick={() => switchWorkspace(ws.id)}
              onContextMenu={(e) => onContextMenu?.(e, ws.id)}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              {/* Color indicator */}
              <span
                className="tab-bar__color-dot"
                style={{
                  backgroundColor: ws.tabColor ?? 'var(--color-accent)',
                }}
              />
              {editingId === ws.id ? (
                <input
                  className="tab-bar__tab-rename-input"
                  value={editValue}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') { setEditingId(null); setEditValue(''); }
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <span className="tab-bar__tab-content">
                  <span
                    className="tab-bar__tab-name"
                    onDoubleClick={() => handleDoubleClick(ws)}
                  >
                    {ws.name}
                  </span>
                  {isActive && (
                    <span
                      className="tab-bar__tab-state"
                      aria-label="Current workspace"
                    >
                      Current
                    </span>
                  )}
                  {!isActive && runningCount > 0 && (
                    <span 
                      className="tab-bar__tab-badge" 
                      title={`${runningCount} running process${runningCount > 1 ? 'es' : ''}`}
                    >
                      {runningCount}
                    </span>
                  )}
                </span>
              )}
              {broadcastMode && isActive && (
                <span
                  className="tab-bar__broadcast-badge"
                  title="Broadcast mode active"
                >
                  ⚡
                </span>
              )}
              <button
                className="tab-bar__close-btn"
                title="Close workspace"
                aria-label={`Close ${ws.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteWorkspace(ws.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Draggable spacer — this is the macOS titlebar drag region */}
      <div className="tab-bar__spacer" />

      <div className="tab-bar__actions">
        {broadcastMode && (
          <span className="tab-bar__broadcast-indicator" title="Broadcast mode">
            BROADCAST
          </span>
        )}
        {onApplyTemplate && <TemplatePicker onSelect={onApplyTemplate} />}
        <button
          className="tab-bar__new-btn"
          title="Open folder as workspace"
          aria-label="Open folder as workspace"
          onClick={() => void openWorkspaceFolder()}
        >
          +
        </button>
      </div>
    </div>
  );
}
