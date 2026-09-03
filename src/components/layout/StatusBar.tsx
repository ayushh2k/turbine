import { useMemo } from 'react';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { useSettingsStore } from '../../state/settingsStore';
import { usePtyStatusStore } from '../../hooks/usePtyStatus';
import { getAllThemes } from '../../themes/themeEngine';
import './StatusBar.css';

interface StatusBarProps {
  focusedPaneId: string | null;
  broadcastMode: boolean;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  onOpenCompanion?: () => void;
}

export function StatusBar({
  focusedPaneId,
  broadcastMode,
  onOpenPalette,
  onOpenShortcuts,
  onOpenCompanion,
}: StatusBarProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const themeId = useSettingsStore((s) => s.settings.theme);
  const statuses = usePtyStatusStore((s) => s.statuses);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const focusedPane = activeWorkspace?.panes.find((p) => p.id === focusedPaneId);

  const themeName = useMemo(
    () => getAllThemes().find((t) => t.id === themeId)?.name ?? themeId,
    [themeId],
  );

  const runningCount = useMemo(() => {
    let n = 0;
    statuses.forEach((entry) => {
      if (entry.status === 'running') n += 1;
    });
    return n;
  }, [statuses]);

  const paneCount = activeWorkspace?.panes.length ?? 0;

  if (!activeWorkspace) {
    return (
      <footer className="status-bar status-bar--empty">
        <div className="status-bar__group">
          <button
            type="button"
            className="status-bar__item status-bar__item--button"
            onClick={onOpenPalette}
            title="Open Command Palette (Ctrl+K)"
          >
            <span className="status-bar__kbd">⌘K</span>
            <span>Command palette</span>
          </button>
        </div>
        <div className="status-bar__spacer" />
        <div className="status-bar__group">
          <span className="status-bar__item status-bar__item--muted">{themeName}</span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="status-bar">
      <div className="status-bar__group">
        <span
          className="status-bar__workspace-dot"
          style={{ background: activeWorkspace.tabColor ?? 'var(--color-accent)' }}
          aria-hidden="true"
        />
        <span className="status-bar__item status-bar__item--strong">
          {activeWorkspace.name}
        </span>
        <span className="status-bar__separator">·</span>
        <span className="status-bar__item status-bar__item--muted">
          {paneCount} {paneCount === 1 ? 'pane' : 'panes'}
        </span>
        {focusedPane && (
          <>
            <span className="status-bar__separator">·</span>
            <span className="status-bar__item status-bar__item--muted">
              {focusedPane.title || focusedPane.label || focusedPane.type}
            </span>
          </>
        )}
      </div>

      <div className="status-bar__spacer" />

      <div className="status-bar__group">
        {broadcastMode && (
          <span className="status-bar__item status-bar__item--broadcast">
            <span className="status-bar__broadcast-dot" />
            BROADCAST
          </span>
        )}
        {runningCount > 0 && (
          <span className="status-bar__item status-bar__item--muted" title="Running processes">
            <span className="status-bar__running-dot" />
            {runningCount} running
          </span>
        )}
        {onOpenCompanion && (
          <button
            type="button"
            className="status-bar__item status-bar__item--button"
            onClick={onOpenCompanion}
            title="Mobile Companion (Connect phone)"
          >
            <span>📱 Companion</span>
          </button>
        )}
        <button
          type="button"
          className="status-bar__item status-bar__item--button"
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts (Ctrl+/)"
        >
          <span className="status-bar__kbd">?</span>
        </button>
        <button
          type="button"
          className="status-bar__item status-bar__item--button"
          onClick={onOpenPalette}
          title="Command Palette (Ctrl+K)"
        >
          <span className="status-bar__kbd">⌘K</span>
        </button>
        <span className="status-bar__item status-bar__item--muted" title="Active theme">
          {themeName}
        </span>
      </div>
    </footer>
  );
}
