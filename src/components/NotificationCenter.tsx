import { useEffect, useRef, useCallback, useState } from 'react';
import { useNotificationStore, type AppNotification } from '../state/notificationStore';
import './NotificationCenter.css';

const AUTO_DISMISS_MS = 5000;
const FADE_OUT_MS = 200;

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startDismiss = useCallback(() => {
    setDismissing(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, FADE_OUT_MS);
  }, [notification.id, onDismiss]);

  useEffect(() => {
    timerRef.current = setTimeout(startDismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [startDismiss]);

  const handleMouseEnter = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    timerRef.current = setTimeout(startDismiss, AUTO_DISMISS_MS);
  }, [startDismiss]);

  return (
    <div
      className={`notification-toast notification-toast--${notification.type}${dismissing ? ' notification-toast--dismissing' : ''}`}
      role="alert"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="notification-toast__body">
        <div className="notification-toast__title">{notification.title}</div>
        <div className="notification-toast__message">{notification.message}</div>
        <div className="notification-toast__time">{formatTime(notification.timestamp)}</div>
      </div>
      <button
        className="notification-toast__dismiss"
        onClick={() => startDismiss()}
        aria-label="Dismiss notification"
        type="button"
      >
        &times;
      </button>
    </div>
  );
}

export function NotificationCenter() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismissNotification = useNotificationStore((s) => s.dismissNotification);

  if (notifications.length === 0) return null;

  return (
    <div className="notification-center">
      {notifications.map((n) => (
        <NotificationToast
          key={n.id}
          notification={n}
          onDismiss={dismissNotification}
        />
      ))}
    </div>
  );
}
