import { useCallback, useMemo } from 'react';
import { useWorkspaceStore } from '../../state/workspaceStore';
import './BroadcastOverlay.css';

interface BroadcastOverlayProps {
  focusedPaneId: string | null;
}

export function BroadcastOverlay({ focusedPaneId }: BroadcastOverlayProps) {
  const broadcastTargets = useWorkspaceStore((s) => s.broadcastTargets);
  const setBroadcastTargets = useWorkspaceStore((s) => s.setBroadcastTargets);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const terminalPanes = useMemo(() => {
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!ws) return [];
    return ws.panes.filter((p) => p.type === 'terminal');
  }, [workspaces, activeWorkspaceId]);

  const handleToggle = useCallback(
    (paneId: string) => {
      const next = new Set(broadcastTargets);
      if (next.has(paneId)) {
        next.delete(paneId);
      } else {
        next.add(paneId);
      }
      setBroadcastTargets(next);
    },
    [broadcastTargets, setBroadcastTargets],
  );

  const handleSelectAll = useCallback(() => {
    const all = new Set(
      terminalPanes
        .filter((p) => p.id !== focusedPaneId)
        .map((p) => p.id),
    );
    setBroadcastTargets(all);
  }, [terminalPanes, focusedPaneId, setBroadcastTargets]);

  const handleDeselectAll = useCallback(() => {
    setBroadcastTargets(new Set());
  }, [setBroadcastTargets]);

  const getPaneLabel = (pane: { id: string; title?: string | null; label?: string | null }) => {
    if (pane.title) return pane.title;
    if (pane.label) return pane.label;
    return `Terminal ${pane.id.slice(0, 6)}`;
  };

  if (terminalPanes.length === 0) return null;

  return (
    <div className="broadcast-overlay" role="region" aria-label="Broadcast targets">
      <div className="broadcast-overlay__header">
        <span className="broadcast-overlay__indicator" aria-hidden="true" />
        <span className="broadcast-overlay__title">Broadcast Targets</span>
      </div>
      <div className="broadcast-overlay__list">
        {terminalPanes.map((pane) => {
          const isFocused = pane.id === focusedPaneId;
          const isChecked = isFocused || broadcastTargets.has(pane.id);
          return (
            <label
              key={pane.id}
              className={`broadcast-overlay__item ${isFocused ? 'broadcast-overlay__item--focused' : ''}`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isFocused}
                onChange={() => handleToggle(pane.id)}
                className="broadcast-overlay__checkbox"
              />
              <span className="broadcast-overlay__label">
                {getPaneLabel(pane)}
                {isFocused && <span className="broadcast-overlay__badge">focused</span>}
              </span>
            </label>
          );
        })}
      </div>
      <div className="broadcast-overlay__actions">
        <button
          type="button"
          className="broadcast-overlay__btn"
          onClick={handleSelectAll}
        >
          Select All
        </button>
        <button
          type="button"
          className="broadcast-overlay__btn"
          onClick={handleDeselectAll}
        >
          Deselect All
        </button>
      </div>
    </div>
  );
}
