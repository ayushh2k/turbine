import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'subnautica',
  defaultShell: null,
  agentLaunchDelay: 500,
  terminalScrollbackLines: 10000,
  customKeybindings: {},
  autoUpdateEnabled: true,
};

interface SettingsState {
  settings: AppSettings;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },

  loadSettings: async () => {
    try {
      const raw = await invoke<{
        theme: string;
        default_shell: string | null;
        agent_launch_delay: number;
        terminal_scrollback_lines: number;
        custom_keybindings: Record<string, string>;
        auto_update_enabled: boolean;
      }>('load_settings');

      set({
        settings: {
          theme: raw.theme,
          defaultShell: raw.default_shell,
          agentLaunchDelay: raw.agent_launch_delay,
          terminalScrollbackLines: raw.terminal_scrollback_lines,
          customKeybindings: raw.custom_keybindings,
          autoUpdateEnabled: raw.auto_update_enabled,
        },
      });
    } catch {
      // If loading fails, keep defaults
      set({ settings: { ...DEFAULT_SETTINGS } });
    }
  },

  saveSettings: async (partial: Partial<AppSettings>) => {
    const current = get().settings;
    const merged: AppSettings = { ...current, ...partial };

    set({ settings: merged });

    await invoke('save_settings', {
      settings: {
        theme: merged.theme,
        default_shell: merged.defaultShell,
        agent_launch_delay: merged.agentLaunchDelay,
        terminal_scrollback_lines: merged.terminalScrollbackLines,
        custom_keybindings: merged.customKeybindings,
        auto_update_enabled: merged.autoUpdateEnabled,
      },
    });
  },

  resetSettings: () => {
    set({ settings: { ...DEFAULT_SETTINGS } });
  },
}));

export { DEFAULT_SETTINGS };
