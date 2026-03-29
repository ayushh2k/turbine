import { useState, useRef, useCallback } from 'react';
import { useWorkspaceStore } from '../state/workspaceStore';
import './TabBar.css';

interface TabBarProps {
  onContextMenu?: (e: React.MouseEvent, workspaceId: string) => void;
}

export function TabBar({ onContextMenu }: TabBarProps) {
  const {
    workspaces,
    activeWorkspaceId,
    broadcastMode,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
    reorderWorkspaces,
    renameWorkspace,
  } = useWorkspaceStore();

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

  return (
    <div className="tab-bar" role="tablist" aria-label="Workspaces">
      <div className="tab-bar__tabs">
        {sorted.map((ws, index) => {
          const isActive = ws.id === activeWorkspaceId;
          const isDragging = dragIndex === index;
          const isDragOver = dragOverIndex === index;

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
                <span
                  className="tab-bar__tab-name"
                  onDoubleClick={() => handleDoubleClick(ws)}
                >
                  {ws.name}
                </span>
              )}
              {ws.broadcastMode && (
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

      <div className="tab-bar__actions">
        {broadcastMode && (
          <span className="tab-bar__broadcast-indicator" title="Broadcast mode">
            ⚡ BROADCAST
          </span>
        )}
        <button
          className="tab-bar__new-btn"
          title="New workspace"
          aria-label="Create new workspace"
          onClick={() => createWorkspace()}
        >
          +
        </button>
      </div>
    </div>
  );
}
