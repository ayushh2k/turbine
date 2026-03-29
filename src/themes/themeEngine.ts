import type { ThemeDef } from '../types';
import { builtinThemes } from './builtinThemes';

const themeRegistry = new Map<string, ThemeDef>();

// Register all built-in themes
for (const theme of builtinThemes) {
  themeRegistry.set(theme.id, theme);
}

/**
 * Get all available themes (built-in + custom).
 */
export function getAllThemes(): ThemeDef[] {
  return Array.from(themeRegistry.values());
}

/**
 * Get a theme by ID.
 */
export function getTheme(id: string): ThemeDef | undefined {
  return themeRegistry.get(id);
}

/**
 * Register a custom theme (e.g. loaded from JSON).
 */
export function registerCustomTheme(theme: ThemeDef): void {
  themeRegistry.set(theme.id, theme);
}

/**
 * Load a custom theme from a JSON string.
 */
export function loadCustomThemeJson(json: string): ThemeDef {
  const theme = JSON.parse(json) as ThemeDef;
  if (!theme.id || !theme.name || !theme.colors) {
    throw new Error('Invalid theme JSON: missing required fields (id, name, colors)');
  }
  registerCustomTheme(theme);
  return theme;
}

/**
 * Apply a theme by setting CSS custom properties on the document root.
 */
export function applyTheme(themeId: string): boolean {
  const theme = themeRegistry.get(themeId);
  if (!theme) return false;

  const root = document.documentElement;
  const { colors } = theme;

  // Core UI colors
  root.style.setProperty('--color-bg', colors.background);
  root.style.setProperty('--color-fg', colors.foreground);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--tab-bar-bg', colors.tabBar);
  root.style.setProperty('--pane-border', colors.paneBorder);

  // Terminal ANSI colors
  const termColors = colors.terminal;
  root.style.setProperty('--term-black', termColors.black);
  root.style.setProperty('--term-red', termColors.red);
  root.style.setProperty('--term-green', termColors.green);
  root.style.setProperty('--term-yellow', termColors.yellow);
  root.style.setProperty('--term-blue', termColors.blue);
  root.style.setProperty('--term-magenta', termColors.magenta);
  root.style.setProperty('--term-cyan', termColors.cyan);
  root.style.setProperty('--term-white', termColors.white);
  root.style.setProperty('--term-bright-black', termColors.brightBlack);
  root.style.setProperty('--term-bright-red', termColors.brightRed);
  root.style.setProperty('--term-bright-green', termColors.brightGreen);
  root.style.setProperty('--term-bright-yellow', termColors.brightYellow);
  root.style.setProperty('--term-bright-blue', termColors.brightBlue);
  root.style.setProperty('--term-bright-magenta', termColors.brightMagenta);
  root.style.setProperty('--term-bright-cyan', termColors.brightCyan);
  root.style.setProperty('--term-bright-white', termColors.brightWhite);
  root.style.setProperty('--term-foreground', termColors.foreground);
  root.style.setProperty('--term-background', termColors.background);
  root.style.setProperty('--term-cursor', termColors.cursor);

  // Code viewer colors
  const cvColors = colors.codeViewer;
  root.style.setProperty('--cv-bg', cvColors.background);
  root.style.setProperty('--cv-fg', cvColors.foreground);
  root.style.setProperty('--cv-line-number', cvColors.lineNumber);

  return true;
}

/**
 * Get the xterm.js theme object from a ThemeDef for direct terminal configuration.
 */
export function getXtermTheme(themeId: string) {
  const theme = themeRegistry.get(themeId);
  if (!theme) return undefined;

  const t = theme.colors.terminal;
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.cursor,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
  };
}
