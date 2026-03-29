import { useState, useCallback } from 'react';
import './PaneToolbar.css';

interface PaneToolbarProps {
  onSplitH: () => void;
  onSplitV: () => void;
  onClose: () => void;
  autoLaunch?: boolean;
  startupCommand?: string | null;
  onAutoLaunchChange?: (autoLaunch: boolean) => void;
  onStartupCommandChange?: (command: string | null) => void;
}

export function PaneToolbar({
  onSplitH,
  onSplitV,
  onClose,
  autoLaunch,
  startupCommand,
  onAutoLaunchChange,
  onStartupCommandChange,
}: PaneToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const handleCommandChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.trim();
      onStartupCommandChange?.(value || null);
    },
    [onStartupCommandChange],
  );

  return (
    <div
      className="pane-toolbar-trigger"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => {
        setVisible(false);
        setShowConfig(false);
      }}
    >
      {visible && (
        <div className="pane-toolbar" role="toolbar" aria-label="Pane controls">
          <button
            className="pane-toolbar__btn"
            title="Split horizontal"
            aria-label="Split horizontal"
            onClick={onSplitH}
          >
            ⬌
          </button>
          <button
            className="pane-toolbar__btn"
            title="Split vertical"
            aria-label="Split vertical"
            onClick={onSplitV}
          >
            ⬍
          </button>
          {onAutoLaunchChange && (
            <button
              className={`pane-toolbar__btn ${showConfig ? 'pane-toolbar__btn--active' : ''}`}
              title="Auto-launch settings"
              aria-label="Auto-launch settings"
              onClick={() => setShowConfig((v) => !v)}
            >
              &#9881;
            </button>
          )}
          <button
            className="pane-toolbar__btn pane-toolbar__btn--close"
            title="Close pane"
            aria-label="Close pane"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      )}
      {showConfig && visible && (
        <div className="pane-toolbar__config">
          <label className="pane-toolbar__config-row">
            <input
              type="checkbox"
              checked={autoLaunch ?? false}
              onChange={(e) => onAutoLaunchChange?.(e.target.checked)}
            />
            <span>Auto-launch on open</span>
          </label>
          <input
            className="pane-toolbar__config-input"
            type="text"
            placeholder="Startup command..."
            value={startupCommand ?? ''}
            onChange={handleCommandChange}
          />
        </div>
      )}
    </div>
  );
}
