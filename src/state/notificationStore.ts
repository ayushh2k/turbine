import { create } from 'zustand';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  timestamp: number;
}

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (title: string, message: string, type?: NotificationType) => void;
  dismissNotification: (id: string) => void;
}

const MAX_VISIBLE = 3;

let idCounter = 0;

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  addNotification: (title, message, type = 'info') => {
    const id = `notif-${Date.now()}-${++idCounter}`;
    const notification: AppNotification = {
      id,
      title,
      message,
      type,
      timestamp: Date.now(),
    };

    set((state) => {
      // Keep only the newest MAX_VISIBLE - 1 so the new one makes MAX_VISIBLE total
      const existing = state.notifications.slice(-(MAX_VISIBLE - 1));
      return { notifications: [...existing, notification] };
    });
  },

  dismissNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));
