import { useSettingsStore } from './settingsStore';

export type Action =
  | 'newWorkspace'
  | 'closePane'
  | 'commandPalette'
  | 'nextWorkspace'
  | 'prevWorkspace'
  | `workspace${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | 'splitHorizontal'
  | 'splitVertical'
  | 'navUp' | 'navDown' | 'navLeft' | 'navRight'
  | 'search'
  | 'searchPanes'
  | 'toggleBroadcast'
  | 'openSettings'
  | 'showShortcuts';

/** Modifier-aware key string, e.g. "Ctrl+Shift+D" */
type KeyCombo = string;

const DEFAULT_BINDINGS: Record<Action, KeyCombo> = {
  newWorkspace: 'Ctrl+T',
  closePane: 'Ctrl+W',
  commandPalette: 'Ctrl+Shift+P',
  nextWorkspace: 'Ctrl+Tab',
  prevWorkspace: 'Ctrl+Shift+Tab',
  workspace1: 'Ctrl+1', workspace2: 'Ctrl+2', workspace3: 'Ctrl+3',
  workspace4: 'Ctrl+4', workspace5: 'Ctrl+5', workspace6: 'Ctrl+6',
  workspace7: 'Ctrl+7', workspace8: 'Ctrl+8', workspace9: 'Ctrl+9',
  splitHorizontal: 'Ctrl+D',
  splitVertical: 'Ctrl+Shift+D',
  navUp: 'Ctrl+ArrowUp',
  navDown: 'Ctrl+ArrowDown',
  navLeft: 'Ctrl+ArrowLeft',
  navRight: 'Ctrl+ArrowRight',
  search: 'Ctrl+F',
  searchPanes: 'Ctrl+Shift+F',
  toggleBroadcast: 'Ctrl+Shift+B',
  openSettings: 'Ctrl+,',
  showShortcuts: 'Ctrl+/',
};

type ActionHandler = () => void;

class KeybindingManager {
  private handlers = new Map<Action, ActionHandler>();
  private boundListener: ((e: KeyboardEvent) => void) | null = null;

  /** Register a handler for an action. */
  register(action: Action, handler: ActionHandler): void {
    this.handlers.set(action, handler);
  }

  /** Unregister a handler for an action. */
  unregister(action: Action): void {
    this.handlers.delete(action);
  }

  /** Get the effective bindings (defaults merged with user overrides). */
  getBindings(): Record<Action, KeyCombo> {
    const custom = useSettingsStore.getState().settings.customKeybindings;
    const merged = { ...DEFAULT_BINDINGS };
    for (const [action, combo] of Object.entries(custom)) {
      if (action in merged) {
        (merged as Record<string, string>)[action] = combo;
      }
    }
    return merged;
  }

  /** Rebind an action to a new key combo. */
  async rebind(action: Action, combo: KeyCombo): Promise<void> {
    const store = useSettingsStore.getState();
    await store.saveSettings({
      customKeybindings: {
        ...store.settings.customKeybindings,
        [action]: combo,
      },
    });
  }

  /** Start listening for global keyboard events. */
  activate(): void {
    if (this.boundListener) return;

    this.boundListener = (e: KeyboardEvent) => {
      const pressed = keyEventToCombo(e);
      const bindings = this.getBindings();

      for (const [action, combo] of Object.entries(bindings)) {
        if (normalizeCombo(combo) === pressed) {
          const handler = this.handlers.get(action as Action);
          if (handler) {
            e.preventDefault();
            e.stopPropagation();
            handler();
            return;
          }
        }
      }
    };

    document.addEventListener('keydown', this.boundListener, true);
  }

  /** Stop listening. */
  deactivate(): void {
    if (this.boundListener) {
      document.removeEventListener('keydown', this.boundListener, true);
      this.boundListener = null;
    }
  }
}

/** Convert a KeyboardEvent to a normalized combo string. */
function keyEventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  let key = e.key;
  // Normalize key names
  if (key === ' ') key = 'space';
  if (key.length === 1) key = key.toLowerCase();

  // Don't add modifier keys themselves
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return '';

  parts.push(key.toLowerCase());
  return parts.join('+');
}

/** Normalize a combo string like "Ctrl+Shift+D" to "ctrl+shift+d". */
function normalizeCombo(combo: string): string {
  return combo
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .sort((a, b) => {
      const order = ['ctrl', 'shift', 'alt'];
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return 0;
    })
    .join('+');
}

// Singleton
export const keybindingManager = new KeybindingManager();
export { DEFAULT_BINDINGS };
