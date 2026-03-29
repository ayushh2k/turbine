import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../state/settingsStore';
import type { UpdateInfo } from '../types';
import './UpdateNotification.css';

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

export function UpdateNotification() {
  const autoUpdateEnabled = useSettingsStore((s) => s.settings.autoUpdateEnabled);
  const [state, setState] = useState<UpdateState>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Check for updates on mount
  useEffect(() => {
    if (!autoUpdateEnabled) return;

    invoke<UpdateInfo | null>('check_for_updates')
      .then((info) => {
        if (info) {
          setUpdateInfo(info);
          setState('available');
        }
      })
      .catch(() => {
        // Silently fail — user can manually check later
      });
  }, [autoUpdateEnabled]);

  const handleInstall = useCallback(async () => {
    setState('downloading');
    setErrorMsg(null);
    try {
      await invoke('install_update');
      setState('ready');
    } catch (err) {
      setState('error');
      setErrorMsg(String(err));
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleRetry = useCallback(() => {
    handleInstall();
  }, [handleInstall]);

  if (dismissed || state === 'idle' || !updateInfo) {
    return null;
  }

  return (
    <div className="update-notification">
      {state === 'available' && (
        <>
          <div className="update-notification__text">
            <strong>v{updateInfo.version}</strong> available
            {updateInfo.summary && ` — ${updateInfo.summary}`}
          </div>
          <div className="update-notification__actions">
            <button className="update-notification__btn update-notification__btn--primary" onClick={handleInstall}>
              Update
            </button>
            <button className="update-notification__btn" onClick={handleDismiss}>
              Later
            </button>
          </div>
        </>
      )}
      {state === 'downloading' && (
        <div className="update-notification__text">Downloading update...</div>
      )}
      {state === 'ready' && (
        <>
          <div className="update-notification__text">Update installed. Restart to apply.</div>
          <div className="update-notification__actions">
            <button className="update-notification__btn update-notification__btn--primary" onClick={handleDismiss}>
              OK
            </button>
          </div>
        </>
      )}
      {state === 'error' && (
        <>
          <div className="update-notification__text update-notification__text--error">
            Update failed{errorMsg ? `: ${errorMsg}` : ''}
          </div>
          <div className="update-notification__actions">
            <button className="update-notification__btn" onClick={handleRetry}>
              Retry
            </button>
            <button className="update-notification__btn" onClick={handleDismiss}>
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}
