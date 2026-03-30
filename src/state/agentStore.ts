import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AgentPreset } from '../types';

interface AgentState {
  presets: AgentPreset[];
  loadPresets: () => Promise<void>;
  savePreset: (preset: AgentPreset) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set) => ({
  presets: [],
  loadPresets: async () => {
    try {
      const presets = await invoke<AgentPreset[]>('load_agent_presets');
      set({ presets });
    } catch (e) {
      console.error('Failed to load agent presets', e);
    }
  },
  savePreset: async (preset: AgentPreset) => {
    try {
      await invoke('save_agent_preset', { preset });
      set((state) => {
        const index = state.presets.findIndex((p) => p.id === preset.id);
        if (index >= 0) {
          const newPresets = [...state.presets];
          newPresets[index] = preset;
          return { presets: newPresets };
        } else {
          return { presets: [...state.presets, preset].sort((a, b) => a.name.localeCompare(b.name)) };
        }
      });
    } catch (e) {
      console.error('Failed to save agent preset', e);
    }
  },
  deletePreset: async (id: string) => {
    try {
      await invoke('delete_agent_preset', { presetId: id });
      set((state) => ({
        presets: state.presets.filter((p) => p.id !== id),
      }));
    } catch (e) {
      console.error('Failed to delete agent preset', e);
    }
  },
}));
