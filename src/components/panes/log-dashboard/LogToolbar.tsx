import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LogLevel, FilterPreset } from '../../../types';
import { useLogDashboardStore } from '../../../state/logDashboardStore';
import { validateRegex } from '../../../utils/filterEngine';

const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];

/** Wire shape of a filter preset as the Rust backend stores it. */
interface RustFilterPreset {
  id: string;
  workspace_id: string;
  name: string;
  regex_pattern: string | null;
  levels_json: string;
  sources_json: string;
}

function parseJsonArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fromRustPreset(row: RustFilterPreset): FilterPreset {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    regexPattern: row.regex_pattern,
    levels: parseJsonArray(row.levels_json) as LogLevel[],
    sources: parseJsonArray(row.sources_json),
  };
}

function toRustPreset(preset: FilterPreset): RustFilterPreset {
  return {
    id: preset.id,
    workspace_id: preset.workspaceId,
    name: preset.name,
    regex_pattern: preset.regexPattern,
    levels_json: JSON.stringify(preset.levels),
    sources_json: JSON.stringify(preset.sources),
  };
}

interface LogToolbarProps {
  paneId: string;
  workspaceId: string;
  onOpenSourcePanel: () => void;
}

export function LogToolbar({ paneId, workspaceId, onOpenSourcePanel }: LogToolbarProps) {
  const dashboard = useLogDashboardStore((s) => s.dashboards.get(paneId));
  const setFilter = useLogDashboardStore((s) => s.setFilter);
  const setPaused = useLogDashboardStore((s) => s.setPaused);

  const [filterText, setFilterText] = useState('');
  const [filterError, setFilterError] = useState<string | null>(null);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const presetRef = useRef<HTMLDivElement>(null);

  const isPaused = dashboard?.isPaused ?? false;
  const pausedCount = dashboard?.pausedEntryCount ?? 0;
  const activeLevels = dashboard?.filter.levels ?? new Set<LogLevel>();

  // Load presets on mount
  useEffect(() => {
    invoke<RustFilterPreset[]>('load_filter_presets', { workspaceId })
      .then((rows) => setPresets(rows.map(fromRustPreset)))
      .catch(() => {});
  }, [workspaceId]);

  // Close preset dropdown on outside click
  useEffect(() => {
    if (!showPresets) return;
    const handleClick = (e: MouseEvent) => {
      if (presetRef.current && !presetRef.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPresets]);

  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFilterText(value);

      if (value === '') {
        setFilterError(null);
        setFilter(paneId, { regex: null });
        return;
      }

      const result = validateRegex(value);
      if (result.valid) {
        setFilterError(null);
        setFilter(paneId, { regex: value });
      } else {
        setFilterError(result.error ?? 'Invalid regex');
      }
    },
    [paneId, setFilter],
  );

  const handleLevelToggle = useCallback(
    (level: LogLevel) => {
      const newLevels = new Set(activeLevels);
      if (newLevels.has(level)) {
        newLevels.delete(level);
      } else {
        newLevels.add(level);
      }
      setFilter(paneId, { levels: newLevels });
    },
    [paneId, activeLevels, setFilter],
  );

  const handlePauseToggle = useCallback(() => {
    setPaused(paneId, !isPaused);
  }, [paneId, isPaused, setPaused]);

  const handleLoadPreset = useCallback(
    (preset: FilterPreset) => {
      setFilter(paneId, {
        regex: preset.regexPattern,
        levels: new Set(preset.levels),
        sources: new Set(preset.sources),
      });
      setFilterText(preset.regexPattern ?? '');
      setFilterError(null);
      setShowPresets(false);
    },
    [paneId, setFilter],
  );

  const handleSavePreset = useCallback(async () => {
    const name = prompt('Preset name:');
    if (!name) return;

    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      workspaceId,
      name,
      regexPattern: dashboard?.filter.regex ?? null,
      levels: Array.from(dashboard?.filter.levels ?? []),
      sources: Array.from(dashboard?.filter.sources ?? []),
    };

    try {
      await invoke('save_filter_preset', { preset: toRustPreset(preset) });
      setPresets((prev) => [...prev, preset]);
    } catch {
      // Failed to save — silently ignore
    }
    setShowPresets(false);
  }, [workspaceId, dashboard?.filter]);

  const handleDeletePreset = useCallback(
    async (e: React.MouseEvent, presetId: string) => {
      e.stopPropagation();
      try {
        await invoke('delete_filter_preset', { presetId });
        setPresets((prev) => prev.filter((p) => p.id !== presetId));
      } catch {
        // Failed to delete — silently ignore
      }
    },
    [],
  );

  return (
    <div className="log-toolbar" role="toolbar" aria-label="Log dashboard controls">
      <div className="log-toolbar__filter-wrap">
        <input
          className={`log-toolbar__filter-input ${filterError ? 'log-toolbar__filter-input--invalid' : ''}`}
          type="text"
          placeholder="Filter (regex)…"
          value={filterText}
          onChange={handleFilterChange}
          aria-label="Filter log entries by regex"
          title={filterError ?? 'Filter log entries by regex pattern'}
        />
        {filterError && (
          <div className="log-toolbar__filter-error" role="tooltip">
            {filterError}
          </div>
        )}
      </div>

      <div className="log-toolbar__level-toggles">
        {LOG_LEVELS.map((level) => (
          <button
            key={level}
            className={`log-toolbar__level-btn log-toolbar__level-btn--${level} ${
              activeLevels.has(level) ? 'log-toolbar__level-btn--active' : ''
            }`}
            onClick={() => handleLevelToggle(level)}
            title={`Toggle ${level} visibility`}
            aria-label={`Toggle ${level} level`}
            aria-pressed={activeLevels.has(level)}
          >
            {level}
          </button>
        ))}
      </div>

      <button
        className={`log-toolbar__btn ${isPaused ? 'log-toolbar__btn--active' : ''}`}
        onClick={handlePauseToggle}
        title={isPaused ? 'Resume log stream' : 'Pause log stream'}
        aria-label={isPaused ? 'Resume' : 'Pause'}
      >
        {isPaused ? '▶' : '⏸'}
        {isPaused && pausedCount > 0 && (
          <span className="log-toolbar__badge">{pausedCount > 999 ? '999+' : pausedCount}</span>
        )}
      </button>

      <button
        className="log-toolbar__btn"
        onClick={onOpenSourcePanel}
        title="Manage log sources"
        aria-label="Manage log sources"
      >
        Sources
      </button>

      <div className="log-toolbar__preset-wrap" ref={presetRef}>
        <button
          className={`log-toolbar__btn ${showPresets ? 'log-toolbar__btn--active' : ''}`}
          onClick={() => setShowPresets((v) => !v)}
          title="Filter presets"
          aria-label="Filter presets"
        >
          Presets
        </button>
        {showPresets && (
          <div className="log-toolbar__preset-dropdown">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="log-toolbar__preset-item"
                onClick={() => handleLoadPreset(preset)}
              >
                <span>{preset.name}</span>
                <button
                  className="log-toolbar__preset-delete"
                  onClick={(e) => handleDeletePreset(e, preset.id)}
                  title="Delete preset"
                  aria-label={`Delete preset ${preset.name}`}
                >
                  ×
                </button>
              </div>
            ))}
            <button className="log-toolbar__preset-save" onClick={handleSavePreset}>
              + Save current filter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
