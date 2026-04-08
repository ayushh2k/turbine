import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../state/settingsStore';
import type { UpdateInfo } from '../types';
import './UpdateNotification.css';

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const autoUpdateEnabled = useSettingsStore((s) => s.settings.autoUpdateEnabled);

  const checkForUpdates = useCallback(async () => {
    try {
      const result = await invoke<UpdateInfo | null>('check_for_updates');
      if (result) {
        setInfo(result);
        setState('available');
      }
    } catch {
      // Silently ignore update check failures (offline, no server, etc.)
    }
  }, []);

  useEffect(() => {
    if (!autoUpdateEnabled) return;

    let cancelled = false;

    invoke<UpdateInfo | null>('check_for_updates')
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setInfo(result);
          setState('available');
        }
      })
      .catch(() => {
        // Silently ignore update check failures (offline, no server, etc.)
      });

    return () => {
      cancelled = true;
    };
  }, [autoUpdateEnabled]);

  const handleUpdate = useCallback(() => {
    setState('downloading');
    invoke('install_update')
      .then(() => setState('ready'))
      .catch((err) => {
        setErrorMsg(String(err));
        setState('error');
      });
  }, []);

  const handleDismiss = useCallback(() => {
    setState('idle');
  }, []);

  const handleRetry = useCallback(() => {
    setErrorMsg(null);
    checkForUpdates();
  }, [checkForUpdates]);

  if (state === 'idle') return null;

  return (
    <div className="update-notification" role="alert" aria-live="polite">
      {state === 'available' && info && (
        <>
          <span className="update-notification__text">
            Update Available: <strong>v{info.version}</strong>
          </span>
          <button
            className="update-notification__btn update-notification__btn--primary"
            onClick={handleUpdate}
          >
            Update
          </button>
          <button className="update-notification__btn" onClick={handleDismiss}>
            Later
          </button>
        </>
      )}

      {state === 'downloading' && (
        <span className="update-notification__text">
          Downloading update...
        </span>
      )}

      {state === 'ready' && (
        <>
          <span className="update-notification__text">
            Restart to Update
          </span>
          <button className="update-notification__btn" onClick={handleDismiss}>
            OK
          </button>
        </>
      )}

      {state === 'error' && (
        <>
          <span className="update-notification__text update-notification__text--error">
            Update failed: {errorMsg}
          </span>
          <button className="update-notification__btn" onClick={handleRetry}>
            Retry
          </button>
          <button className="update-notification__btn" onClick={handleDismiss}>
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
