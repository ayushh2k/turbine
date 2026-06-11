import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LogSourceConfig, LogSourceType, SourceStatus } from '../../../types';
import { useLogDashboardStore } from '../../../state/logDashboardStore';
import { toRustLogSource } from '../../../utils/logStreamManager';

const SOURCE_TYPES: { value: LogSourceType; label: string }[] = [
  { value: 'local_file', label: 'Local File' },
  { value: 'docker_container', label: 'Docker Container' },
  { value: 'ssh_remote', label: 'SSH Remote' },
  { value: 'kubernetes_pod', label: 'Kubernetes Pod' },
  { value: 'systemd_journal', label: 'Systemd Journal' },
  { value: 'custom_command', label: 'Custom Command' },
];

const DEFAULT_COLORS = [
  '#00e5c8', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff6f91', '#845ec2', '#ff9671', '#00c9a7', '#c34a36',
];

const MAX_SOURCES = 20;

interface LogSourcePanelProps {
  paneId: string;
  onClose: () => void;
  sourceStatuses?: Map<string, SourceStatus>;
  onReconnect?: (sourceId: string) => void;
}

export function LogSourcePanel({
  paneId,
  onClose,
  sourceStatuses,
  onReconnect,
}: LogSourcePanelProps) {
  const dashboard = useLogDashboardStore((s) => s.dashboards.get(paneId));
  const addSource = useLogDashboardStore((s) => s.addSource);
  const removeSource = useLogDashboardStore((s) => s.removeSource);

  const sources = dashboard?.sources ?? [];

  // Form state
  const [sourceType, setSourceType] = useState<LogSourceType>('local_file');
  const [displayName, setDisplayName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLORS[0]);

  // Type-specific params
  const [filePath, setFilePath] = useState('');
  const [containerName, setContainerName] = useState('');
  const [sshHost, setSshHost] = useState('');
  const [sshRemotePath, setSshRemotePath] = useState('');
  const [sshUser, setSshUser] = useState('');
  const [sshPort, setSshPort] = useState('');
  const [podName, setPodName] = useState('');
  const [podNamespace, setPodNamespace] = useState('');
  const [podContainer, setPodContainer] = useState('');
  const [unitName, setUnitName] = useState('');
  const [customCommand, setCustomCommand] = useState('');

  const isAtLimit = sources.length >= MAX_SOURCES;

  const resetForm = useCallback(() => {
    setDisplayName('');
    setFilePath('');
    setContainerName('');
    setSshHost('');
    setSshRemotePath('');
    setSshUser('');
    setSshPort('');
    setPodName('');
    setPodNamespace('');
    setPodContainer('');
    setUnitName('');
    setCustomCommand('');
    setColor(DEFAULT_COLORS[(sources.length + 1) % DEFAULT_COLORS.length]);
  }, [sources.length]);

  const buildParams = useCallback(() => {
    switch (sourceType) {
      case 'local_file':
        return { filePath };
      case 'docker_container':
        return { containerNameOrId: containerName };
      case 'ssh_remote':
        return {
          host: sshHost,
          remoteFilePath: sshRemotePath,
          ...(sshUser ? { user: sshUser } : {}),
          ...(sshPort ? { port: parseInt(sshPort, 10) } : {}),
        };
      case 'kubernetes_pod':
        return {
          podName,
          ...(podNamespace ? { namespace: podNamespace } : {}),
          ...(podContainer ? { containerName: podContainer } : {}),
        };
      case 'systemd_journal':
        return { unitName };
      case 'custom_command':
        return { command: customCommand };
    }
  }, [
    sourceType, filePath, containerName, sshHost, sshRemotePath,
    sshUser, sshPort, podName, podNamespace, podContainer, unitName, customCommand,
  ]);

  const isFormValid = useCallback(() => {
    if (!displayName.trim()) return false;
    switch (sourceType) {
      case 'local_file': return filePath.trim().length > 0;
      case 'docker_container': return containerName.trim().length > 0;
      case 'ssh_remote': return sshHost.trim().length > 0 && sshRemotePath.trim().length > 0;
      case 'kubernetes_pod': return podName.trim().length > 0;
      case 'systemd_journal': return unitName.trim().length > 0;
      case 'custom_command': return customCommand.trim().length > 0;
    }
  }, [sourceType, displayName, filePath, containerName, sshHost, sshRemotePath, podName, unitName, customCommand]);

  const handleAddSource = useCallback(async () => {
    if (!isFormValid() || isAtLimit) return;

    const newSource: LogSourceConfig = {
      id: crypto.randomUUID(),
      paneId,
      sourceType,
      displayName: displayName.trim(),
      color,
      params: buildParams(),
      sortOrder: sources.length,
    };

    const added = addSource(paneId, newSource);
    if (added) {
      // Persist sources
      const updatedSources = [...sources, newSource];
      invoke('save_log_sources', { paneId, sources: updatedSources.map(toRustLogSource) }).catch(() => {});
      resetForm();
    }
  }, [paneId, sourceType, displayName, color, buildParams, sources, addSource, isFormValid, isAtLimit, resetForm]);

  const handleRemoveSource = useCallback(
    async (sourceId: string) => {
      removeSource(paneId, sourceId);
      const updatedSources = sources.filter((s) => s.id !== sourceId);
      invoke('save_log_sources', { paneId, sources: updatedSources.map(toRustLogSource) }).catch(() => {});
    },
    [paneId, sources, removeSource],
  );

  const getSourceStatus = (sourceId: string): SourceStatus => {
    return sourceStatuses?.get(sourceId) ?? 'stopped';
  };

  return (
    <div className="log-source-panel-overlay">
      <div className="log-source-panel-backdrop" onClick={onClose} />
      <div className="log-source-panel" role="dialog" aria-label="Log source management">
        <div className="log-source-panel__header">
          <span className="log-source-panel__title">Log Sources</span>
          <button
            className="log-source-panel__close-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close source panel"
          >
            ×
          </button>
        </div>

        <div className="log-source-panel__body">
          {/* Existing sources */}
          {sources.map((source) => {
            const status = getSourceStatus(source.id);
            return (
              <div key={source.id} className="log-source-panel__source-item">
                <div className="log-source-panel__source-header">
                  <span className={`log-source-panel__source-status log-source-panel__source-status--${status}`} />
                  <span className="log-source-panel__source-name">{source.displayName}</span>
                  <span className="log-source-panel__source-type">{source.sourceType.replace('_', ' ')}</span>
                </div>
                <div className="log-source-panel__source-actions">
                  {status === 'error' && onReconnect && (
                    <button
                      className="log-source-panel__source-action-btn log-source-panel__source-action-btn--reconnect"
                      onClick={() => onReconnect(source.id)}
                    >
                      Reconnect
                    </button>
                  )}
                  <button
                    className="log-source-panel__source-action-btn log-source-panel__source-action-btn--danger"
                    onClick={() => handleRemoveSource(source.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add source form */}
          <div className="log-source-panel__add-form">
            <div className="log-source-panel__form-row">
              <label className="log-source-panel__form-label">Source Type</label>
              <select
                className="log-source-panel__form-select"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as LogSourceType)}
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="log-source-panel__form-row">
              <label className="log-source-panel__form-label">Display Name</label>
              <input
                className="log-source-panel__form-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="My Log Source"
              />
            </div>

            <div className="log-source-panel__form-row">
              <label className="log-source-panel__form-label">Color</label>
              <input
                className="log-source-panel__form-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>

            {/* Type-specific fields */}
            {sourceType === 'local_file' && (
              <div className="log-source-panel__form-row">
                <label className="log-source-panel__form-label">File Path</label>
                <input
                  className="log-source-panel__form-input"
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="/var/log/app.log"
                />
              </div>
            )}

            {sourceType === 'docker_container' && (
              <div className="log-source-panel__form-row">
                <label className="log-source-panel__form-label">Container Name / ID</label>
                <input
                  className="log-source-panel__form-input"
                  type="text"
                  value={containerName}
                  onChange={(e) => setContainerName(e.target.value)}
                  placeholder="my-container"
                />
              </div>
            )}

            {sourceType === 'ssh_remote' && (
              <>
                <div className="log-source-panel__form-row">
                  <label className="log-source-panel__form-label">Host</label>
                  <input
                    className="log-source-panel__form-input"
                    type="text"
                    value={sshHost}
                    onChange={(e) => setSshHost(e.target.value)}
                    placeholder="server.example.com"
                  />
                </div>
                <div className="log-source-panel__form-row">
                  <label className="log-source-panel__form-label">Remote File Path</label>
                  <input
                    className="log-source-panel__form-input"
                    type="text"
                    value={sshRemotePath}
                    onChange={(e) => setSshRemotePath(e.target.value)}
                    placeholder="/var/log/remote.log"
                  />
                </div>
                <div className="log-source-panel__form-row">
                  <label className="log-source-panel__form-label">User (optional)</label>
                  <input
                    className="log-source-panel__form-input"
                    type="text"
                    value={sshUser}
                    onChange={(e) => setSshUser(e.target.value)}
                    placeholder="root"
                  />
                </div>
                <div className="log-source-panel__form-row">
                  <label className="log-source-panel__form-label">Port (optional)</label>
                  <input
                    className="log-source-panel__form-input"
                    type="text"
                    value={sshPort}
                    onChange={(e) => setSshPort(e.target.value)}
                    placeholder="22"
                  />
                </div>
              </>
            )}

            {sourceType === 'kubernetes_pod' && (
              <>
                <div className="log-source-panel__form-row">
                  <label className="log-source-panel__form-label">Pod Name</label>
                  <input
                    className="log-source-panel__form-input"
                    type="text"
                    value={podName}
                    onChange={(e) => setPodName(e.target.value)}
                    placeholder="my-pod-abc123"
                  />
                </div>
                <div className="log-source-panel__form-row">
                  <label className="log-source-panel__form-label">Namespace (optional)</label>
                  <input
                    className="log-source-panel__form-input"
                    type="text"
                    value={podNamespace}
                    onChange={(e) => setPodNamespace(e.target.value)}
                    placeholder="default"
                  />
                </div>
                <div className="log-source-panel__form-row">
                  <label className="log-source-panel__form-label">Container (optional)</label>
                  <input
                    className="log-source-panel__form-input"
                    type="text"
                    value={podContainer}
                    onChange={(e) => setPodContainer(e.target.value)}
                    placeholder="app"
                  />
                </div>
              </>
            )}

            {sourceType === 'systemd_journal' && (
              <div className="log-source-panel__form-row">
                <label className="log-source-panel__form-label">Unit Name</label>
                <input
                  className="log-source-panel__form-input"
                  type="text"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="nginx.service"
                />
              </div>
            )}

            {sourceType === 'custom_command' && (
              <div className="log-source-panel__form-row">
                <label className="log-source-panel__form-label">Command</label>
                <textarea
                  className="log-source-panel__form-textarea"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  placeholder="tail -f /var/log/syslog | grep error"
                />
              </div>
            )}

            <button
              className="log-source-panel__add-btn"
              onClick={handleAddSource}
              disabled={!isFormValid() || isAtLimit}
              title={isAtLimit ? 'Maximum 20 sources per dashboard' : 'Add source'}
            >
              {isAtLimit ? 'Max Sources Reached (20)' : 'Add Source'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
