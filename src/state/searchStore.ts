import { create } from 'zustand';

interface SearchState {
  /** Whether the global search bar is visible */
  visible: boolean;
  /** The current search query text */
  query: string;
  /** Search scope: 'focused' searches only the focused pane, 'all' searches every terminal pane */
  paneScope: 'focused' | 'all';
  /** Monotonically increasing counter bumped on "find next" / "find previous" to trigger effects */
  findTick: number;
  /** Direction of the last find action */
  findDirection: 'next' | 'previous';

  // Actions
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  setPaneScope: (scope: 'focused' | 'all') => void;
  findNext: () => void;
  findPrevious: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  visible: false,
  query: '',
  paneScope: 'focused',
  findTick: 0,
  findDirection: 'next',

  open: () => set({ visible: true }),
  close: () => set({ visible: false, query: '' }),
  toggle: () => set((s) => s.visible ? { visible: false, query: '' } : { visible: true }),
  setQuery: (query) => set({ query }),
  setPaneScope: (scope) => set({ paneScope: scope }),
  findNext: () => set((s) => ({ findTick: s.findTick + 1, findDirection: 'next' })),
  findPrevious: () => set((s) => ({ findTick: s.findTick + 1, findDirection: 'previous' })),
}));
