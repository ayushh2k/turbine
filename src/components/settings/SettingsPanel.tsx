import { useState, useEffect, useCallback, useRef } from 'react';
import { useSettingsStore } from '../../state/settingsStore';
import { keybindingManager, DEFAULT_BINDINGS } from '../../state/keybindingManager';
import {
  getAllThemes,
  applyTheme,
  loadCustomThemeJson,
  persistCustomTheme,
} from '../../themes/themeEngine';
import type { Action } from '../../state/keybindingManager';
import './SettingsPanel.css';

type Section = 'general' | 'terminal' | 'keybindings';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'keybindings', label: 'Keybindings' },
];

const ACTION_LABELS: Record<Action, string> = {
  newWorkspace: 'New Workspace',
  closePane: 'Close Pane',
  commandPalette: 'Command Palette',
  nextWorkspace: 'Next Workspace',
  prevWorkspace: 'Previous Workspace',
  splitHorizontal: 'Split Horizontal',
  splitVertical: 'Split Vertical',
  navUp: 'Navigate Up',
  navDown: 'Navigate Down',
  navLeft: 'Navigate Left',
  navRight: 'Navigate Right',
  search: 'Search',
  searchPanes: 'Search All Panes',
  toggleBroadcast: 'Toggle Broadcast',
  workspace1: 'Workspace 1',
  workspace2: 'Workspace 2',
  workspace3: 'Workspace 3',
  workspace4: 'Workspace 4',
  workspace5: 'Workspace 5',
  workspace6: 'Workspace 6',
  workspace7: 'Workspace 7',
  workspace8: 'Workspace 8',
  workspace9: 'Workspace 9',
  openSettings: 'Open Settings',
  showShortcuts: 'Keyboard Shortcuts',
};

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<Section>('general');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let nextIndex: number | null = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        nextIndex = (index + 1) % SECTIONS.length;
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        nextIndex = (index - 1 + SECTIONS.length) % SECTIONS.length;
      }
      if (nextIndex !== null) {
        setActiveSection(SECTIONS[nextIndex].id);
        // Focus the newly active tab button
        const sidebar = e.currentTarget.parentElement;
        if (sidebar) {
          const buttons = sidebar.querySelectorAll<HTMLButtonElement>('[role="tab"]');
          buttons[nextIndex]?.focus();
        }
      }
    },
    [],
  );

  return (
    <div className="settings-panel__backdrop" onClick={onClose}>
      <div className="settings-panel" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel__sidebar" role="tablist" aria-label="Settings sections">
          {SECTIONS.map((section, index) => (
            <button
              key={section.id}
              role="tab"
              aria-selected={activeSection === section.id}
              tabIndex={activeSection === section.id ? 0 : -1}
              className={`settings-panel__tab ${activeSection === section.id ? 'settings-panel__tab--active' : ''}`}
              onClick={() => setActiveSection(section.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
            >
              {section.label}
            </button>
          ))}
        </div>
        <div className="settings-panel__content" role="tabpanel" aria-label={`${activeSection} settings`}>
          {activeSection === 'general' && <GeneralSection />}
          {activeSection === 'terminal' && <TerminalSection />}
          {activeSection === 'keybindings' && <KeybindingsSection />}
        </div>
      </div>
    </div>
  );
}

/* ---------- General Section ---------- */

function GeneralSection() {
  const { settings, saveSettings } = useSettingsStore();
  const themes = getAllThemes();

  const [defaultShell, setDefaultShell] = useState(settings.defaultShell ?? '');
  const [agentLaunchDelay, setAgentLaunchDelay] = useState(
    String(settings.agentLaunchDelay),
  );
  const [themeImportError, setThemeImportError] = useState<string | null>(null);

  const handleShellBlur = useCallback(() => {
    const value = defaultShell.trim() || null;
    if (value !== settings.defaultShell) {
      saveSettings({ defaultShell: value });
    }
  }, [defaultShell, settings.defaultShell, saveSettings]);

  const handleDelayBlur = useCallback(() => {
    const parsed = parseInt(agentLaunchDelay, 10);
    const value = Number.isNaN(parsed) || parsed < 0 ? settings.agentLaunchDelay : parsed;
    setAgentLaunchDelay(String(value));
    if (value !== settings.agentLaunchDelay) {
      saveSettings({ agentLaunchDelay: value });
    }
  }, [agentLaunchDelay, settings.agentLaunchDelay, saveSettings]);

  const handleThemeImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) {
        return;
      }

      try {
        const json = await file.text();
        const theme = loadCustomThemeJson(json);
        await persistCustomTheme(theme, json);
        await saveSettings({ theme: theme.id });
        applyTheme(theme.id);
        setThemeImportError(null);
      } catch (error) {
        setThemeImportError(error instanceof Error ? error.message : String(error));
      }
    },
    [saveSettings],
  );

  return (
    <>
      <h3 className="settings-panel__section-title">General</h3>

      <div className="settings-panel__field">
        <label className="settings-panel__label">Theme</label>
        <div className="settings-panel__theme-grid">
          {themes.map((t) => {
            const isActive = settings.theme === t.id;
            const tc = t.colors.terminal;
            return (
              <button
                key={t.id}
                type="button"
                className={`settings-panel__theme-card ${isActive ? 'settings-panel__theme-card--active' : ''}`}
                onClick={() => {
                  saveSettings({ theme: t.id });
                  applyTheme(t.id);
                }}
              >
                <div className="settings-panel__theme-swatches">
                  <span className="settings-panel__swatch" style={{ background: t.colors.background }} title="Background" />
                  <span className="settings-panel__swatch" style={{ background: t.colors.foreground }} title="Foreground" />
                  <span className="settings-panel__swatch" style={{ background: t.colors.accent }} title="Accent" />
                  <span className="settings-panel__swatch" style={{ background: tc.red }} title="Red" />
                  <span className="settings-panel__swatch" style={{ background: tc.green }} title="Green" />
                  <span className="settings-panel__swatch" style={{ background: tc.blue }} title="Blue" />
                  <span className="settings-panel__swatch" style={{ background: tc.yellow }} title="Yellow" />
                  <span className="settings-panel__swatch" style={{ background: tc.cyan }} title="Cyan" />
                </div>
                <span className="settings-panel__theme-name">{t.name}</span>
                {isActive && <span className="settings-panel__theme-check" aria-label="Active">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="settings-panel__field">
        <label className="settings-panel__label">Import Theme JSON</label>
        <input
          className="settings-panel__input"
          type="file"
          accept=".json,application/json"
          onChange={handleThemeImport}
        />
        {themeImportError && (
          <div className="settings-panel__helper settings-panel__helper--error">
            {themeImportError}
          </div>
        )}
      </div>

      <div className="settings-panel__field">
        <label className="settings-panel__label">Default Shell</label>
        <input
          className="settings-panel__input"
          type="text"
          placeholder="System default"
          value={defaultShell}
          onChange={(e) => setDefaultShell(e.target.value)}
          onBlur={handleShellBlur}
        />
      </div>

      <div className="settings-panel__field">
        <label className="settings-panel__label">Agent Launch Delay (ms)</label>
        <input
          className="settings-panel__input settings-panel__input--number"
          type="number"
          min={0}
          value={agentLaunchDelay}
          onChange={(e) => setAgentLaunchDelay(e.target.value)}
          onBlur={handleDelayBlur}
        />
      </div>

      <div className="settings-panel__field">
        <label className="settings-panel__label">
          <input
            type="checkbox"
            checked={settings.autoUpdateEnabled}
            onChange={(e) => saveSettings({ autoUpdateEnabled: e.target.checked })}
            style={{ marginRight: 8 }}
          />
          Check for updates automatically
        </label>
      </div>
    </>
  );
}

/* ---------- Terminal Section ---------- */

function TerminalSection() {
  const { settings, saveSettings } = useSettingsStore();
  const [scrollback, setScrollback] = useState(
    String(settings.terminalScrollbackLines),
  );

  const handleBlur = useCallback(() => {
    const parsed = parseInt(scrollback, 10);
    const value =
      Number.isNaN(parsed) || parsed < 1
        ? settings.terminalScrollbackLines
        : parsed;
    setScrollback(String(value));
    if (value !== settings.terminalScrollbackLines) {
      saveSettings({ terminalScrollbackLines: value });
    }
  }, [scrollback, settings.terminalScrollbackLines, saveSettings]);

  return (
    <>
      <h3 className="settings-panel__section-title">Terminal</h3>

      <div className="settings-panel__field">
        <label className="settings-panel__label">Scrollback Lines</label>
        <input
          className="settings-panel__input settings-panel__input--number"
          type="number"
          min={1}
          value={scrollback}
          onChange={(e) => setScrollback(e.target.value)}
          onBlur={handleBlur}
        />
      </div>
    </>
  );
}

/* ---------- Keybindings Section ---------- */

function KeybindingsSection() {
  const { saveSettings } = useSettingsStore();
  const [bindings, setBindings] = useState(() => keybindingManager.getBindings());
  const [recordingAction, setRecordingAction] = useState<Action | null>(null);
  const recordingRef = useRef<Action | null>(null);

  // Keep ref in sync for the keydown handler closure
  recordingRef.current = recordingAction;

  useEffect(() => {
    if (!recordingAction) return;

    const handler = (e: KeyboardEvent) => {
      // Ignore bare modifier presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      let key = e.key;
      if (key === ' ') key = 'Space';
      if (key.length === 1) key = key.toUpperCase();

      parts.push(key);
      const combo = parts.join('+');

      const action = recordingRef.current;
      if (action) {
        keybindingManager.rebind(action, combo).then(() => {
          setBindings(keybindingManager.getBindings());
        });
      }
      setRecordingAction(null);
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [recordingAction]);

  const handleReset = useCallback(() => {
    saveSettings({ customKeybindings: {} }).then(() => {
      setBindings(keybindingManager.getBindings());
    });
  }, [saveSettings]);

  const actions = Object.keys(DEFAULT_BINDINGS) as Action[];

  return (
    <>
      <h3 className="settings-panel__section-title">Keybindings</h3>

      <table className="settings-panel__keybinding-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Shortcut</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action}>
              <td>{ACTION_LABELS[action]}</td>
              <td>
                {recordingAction === action ? (
                  <span className="settings-panel__keybinding-recording">
                    Press keys...
                  </span>
                ) : (
                  <span
                    className="settings-panel__keybinding-shortcut"
                    onClick={() => setRecordingAction(action)}
                  >
                    {bindings[action]}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button className="settings-panel__reset-btn" onClick={handleReset}>
        Reset to defaults
      </button>
    </>
  );
}
