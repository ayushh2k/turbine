import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'subnautica',
  autoUpdateEnabled: true,
  defaultShell: null,
  agentLaunchDelay: 500,
  terminalScrollbackLines: 10000,
  customKeybindings: {},
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
        auto_update_enabled: boolean;
        default_shell: string | null;
        agent_launch_delay: number;
        terminal_scrollback_lines: number;
        custom_keybindings: Record<string, string>;
      }>('load_settings');

      set({
        settings: {
          theme: raw.theme,
          autoUpdateEnabled: raw.auto_update_enabled,
          defaultShell: raw.default_shell,
          agentLaunchDelay: raw.agent_launch_delay,
          terminalScrollbackLines: raw.terminal_scrollback_lines,
          customKeybindings: raw.custom_keybindings,
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
        auto_update_enabled: merged.autoUpdateEnabled,
        default_shell: merged.defaultShell,
        agent_launch_delay: merged.agentLaunchDelay,
        terminal_scrollback_lines: merged.terminalScrollbackLines,
        custom_keybindings: merged.customKeybindings,
      },
    });
  },

  resetSettings: () => {
    set({ settings: { ...DEFAULT_SETTINGS } });
  },
}));

export { DEFAULT_SETTINGS };
