import { describe, it, expect } from 'vitest';
import { getAllThemes, getTheme, registerCustomTheme, loadCustomThemeJson, getXtermTheme } from './themeEngine';
import type { ThemeDef } from '../types';

describe('themeEngine', () => {
  describe('getAllThemes', () => {
    it('returns built-in themes', () => {
      const themes = getAllThemes();
      expect(themes.length).toBeGreaterThanOrEqual(11);
    });

    it('includes subnautica as default theme', () => {
      const themes = getAllThemes();
      const subnautica = themes.find((t) => t.id === 'subnautica');
      expect(subnautica).toBeDefined();
      expect(subnautica!.name).toBe('Subnautica');
    });
  });

  describe('getTheme', () => {
    it('returns a theme by ID', () => {
      const theme = getTheme('subnautica');
      expect(theme).toBeDefined();
      expect(theme!.colors.background).toBe('#0b1929');
    });

    it('returns undefined for unknown ID', () => {
      expect(getTheme('nonexistent')).toBeUndefined();
    });
  });

  describe('registerCustomTheme', () => {
    it('adds a custom theme to the registry', () => {
      const custom: ThemeDef = {
        id: 'test-custom',
        name: 'Test Custom',
        colors: {
          background: '#111',
          foreground: '#eee',
          accent: '#f00',
          tabBar: '#222',
          paneBorder: '#333',
          terminal: {
            black: '#000', red: '#f00', green: '#0f0', yellow: '#ff0',
            blue: '#00f', magenta: '#f0f', cyan: '#0ff', white: '#fff',
            brightBlack: '#888', brightRed: '#f88', brightGreen: '#8f8',
            brightYellow: '#ff8', brightBlue: '#88f', brightMagenta: '#f8f',
            brightCyan: '#8ff', brightWhite: '#fff',
            foreground: '#eee', background: '#111', cursor: '#f00',
          },
          codeViewer: { background: '#111', foreground: '#eee', lineNumber: '#444' },
        },
      };
      registerCustomTheme(custom);
      expect(getTheme('test-custom')).toEqual(custom);
    });
  });

  describe('loadCustomThemeJson', () => {
    it('parses valid JSON and registers theme', () => {
      const theme: ThemeDef = {
        id: 'json-test',
        name: 'JSON Test',
        colors: {
          background: '#000',
          foreground: '#fff',
          accent: '#0f0',
          tabBar: '#111',
          paneBorder: '#222',
          terminal: {
            black: '#000', red: '#f00', green: '#0f0', yellow: '#ff0',
            blue: '#00f', magenta: '#f0f', cyan: '#0ff', white: '#fff',
            brightBlack: '#888', brightRed: '#f88', brightGreen: '#8f8',
            brightYellow: '#ff8', brightBlue: '#88f', brightMagenta: '#f8f',
            brightCyan: '#8ff', brightWhite: '#fff',
            foreground: '#fff', background: '#000', cursor: '#0f0',
          },
          codeViewer: { background: '#000', foreground: '#fff', lineNumber: '#444' },
        },
      };
      const result = loadCustomThemeJson(JSON.stringify(theme));
      expect(result.id).toBe('json-test');
      expect(getTheme('json-test')).toBeDefined();
    });

    it('throws on invalid JSON', () => {
      expect(() => loadCustomThemeJson('{')).toThrow();
    });

    it('throws on missing required fields', () => {
      expect(() => loadCustomThemeJson(JSON.stringify({ id: 'x' }))).toThrow('missing required');
    });
  });

  describe('getXtermTheme', () => {
    it('returns xterm theme for valid ID', () => {
      const xt = getXtermTheme('subnautica');
      expect(xt).toBeDefined();
      expect(xt!.background).toBe('#0b1929');
      expect(xt!.foreground).toBe('#c8dce8');
      expect(xt!.cursor).toBe('#00e5c8');
      expect(xt!.red).toBeDefined();
      expect(xt!.brightCyan).toBeDefined();
    });

    it('returns undefined for unknown ID', () => {
      expect(getXtermTheme('nonexistent')).toBeUndefined();
    });
  });
});
