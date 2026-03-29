import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LayoutNode, PaneTemplate } from '../types';
import {
  applyTemplate,
  splitHorizontal,
  splitVertical,
  closePane,
  resizePane,
  movePane,
  countLeaves,
  findLeafIds,
  computePaneBounds,
  navigatePane,
} from './layoutEngine';

let uuidCounter = 0;
beforeEach(() => {
  uuidCounter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    return `pane-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`;
  });
});

describe('applyTemplate', () => {
  it('creates a single leaf for template 1', () => {
    const layout = applyTemplate(1);
    expect(layout.type).toBe('leaf');
    expect(countLeaves(layout)).toBe(1);
  });

  it.each([2, 4, 6, 8, 10, 12, 14, 16] as PaneTemplate[])(
    'creates %d leaves for template %d',
    (n) => {
      const layout = applyTemplate(n);
      expect(countLeaves(layout)).toBe(n);
      const ids = findLeafIds(layout);
      expect(new Set(ids).size).toBe(n);
    },
  );
});

describe('splitHorizontal / splitVertical', () => {
  it('increases leaf count by 1 on horizontal split', () => {
    const layout = applyTemplate(1);
    const paneId = findLeafIds(layout)[0];
    const split = splitHorizontal(layout, paneId);
    expect(countLeaves(split)).toBe(2);
    expect(split.type).toBe('split');
    if (split.type === 'split') {
      expect(split.direction).toBe('horizontal');
      expect(split.ratio).toBe(0.5);
    }
  });

  it('increases leaf count by 1 on vertical split', () => {
    const layout = applyTemplate(1);
    const paneId = findLeafIds(layout)[0];
    const split = splitVertical(layout, paneId);
    expect(countLeaves(split)).toBe(2);
    if (split.type === 'split') {
      expect(split.direction).toBe('vertical');
    }
  });

  it('preserves original pane in left child after split', () => {
    const layout = applyTemplate(1);
    const paneId = findLeafIds(layout)[0];
    const split = splitHorizontal(layout, paneId);
    const ids = findLeafIds(split);
    expect(ids).toContain(paneId);
    expect(ids.length).toBe(2);
  });

  it('returns layout unchanged if pane not found', () => {
    const layout = applyTemplate(2);
    const result = splitHorizontal(layout, 'nonexistent');
    expect(result).toEqual(layout);
  });
});

describe('closePane', () => {
  it('returns single leaf unchanged', () => {
    const layout: LayoutNode = { type: 'leaf', paneId: 'a' };
    expect(closePane(layout, 'a')).toBe(layout);
  });

  it('promotes sibling when closing left child', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', paneId: 'a' },
        { type: 'leaf', paneId: 'b' },
      ],
    };
    const result = closePane(layout, 'a');
    expect(result).toEqual({ type: 'leaf', paneId: 'b' });
  });

  it('promotes sibling when closing right child', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', paneId: 'a' },
        { type: 'leaf', paneId: 'b' },
      ],
    };
    const result = closePane(layout, 'b');
    expect(result).toEqual({ type: 'leaf', paneId: 'a' });
  });

  it('decreases leaf count by 1 in deep tree', () => {
    const layout = applyTemplate(4);
    const ids = findLeafIds(layout);
    const result = closePane(layout, ids[2]);
    expect(countLeaves(result)).toBe(3);
    expect(findLeafIds(result)).not.toContain(ids[2]);
  });
});

describe('resizePane', () => {
  it('adjusts ratio for left child', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', paneId: 'a' },
        { type: 'leaf', paneId: 'b' },
      ],
    };
    const result = resizePane(layout, 'a', 0.1);
    expect(result.type).toBe('split');
    if (result.type === 'split') {
      expect(result.ratio).toBeCloseTo(0.6);
    }
  });

  it('clamps ratio to min 0.01', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.05,
      children: [
        { type: 'leaf', paneId: 'a' },
        { type: 'leaf', paneId: 'b' },
      ],
    };
    const result = resizePane(layout, 'a', -1);
    if (result.type === 'split') {
      expect(result.ratio).toBe(0.01);
    }
  });

  it('clamps ratio to max 0.99', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.95,
      children: [
        { type: 'leaf', paneId: 'a' },
        { type: 'leaf', paneId: 'b' },
      ],
    };
    const result = resizePane(layout, 'a', 1);
    if (result.type === 'split') {
      expect(result.ratio).toBe(0.99);
    }
  });
});

describe('movePane', () => {
  it('swaps two pane IDs', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', paneId: 'a' },
        { type: 'leaf', paneId: 'b' },
      ],
    };
    const result = movePane(layout, 'a', 'b');
    const ids = findLeafIds(result);
    expect(ids).toEqual(['b', 'a']);
  });

  it('returns same layout when swapping with self', () => {
    const layout: LayoutNode = { type: 'leaf', paneId: 'a' };
    expect(movePane(layout, 'a', 'a')).toBe(layout);
  });

  it('preserves all pane IDs after swap', () => {
    const layout = applyTemplate(4);
    const ids = findLeafIds(layout);
    const result = movePane(layout, ids[0], ids[3]);
    const newIds = findLeafIds(result);
    expect(new Set(newIds)).toEqual(new Set(ids));
  });
});

describe('computePaneBounds', () => {
  it('single leaf fills entire space', () => {
    const layout: LayoutNode = { type: 'leaf', paneId: 'a' };
    const bounds = computePaneBounds(layout);
    expect(bounds).toEqual([{ paneId: 'a', x: 0, y: 0, w: 1, h: 1 }]);
  });

  it('horizontal split divides width', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', paneId: 'a' },
        { type: 'leaf', paneId: 'b' },
      ],
    };
    const bounds = computePaneBounds(layout);
    expect(bounds[0].w).toBeCloseTo(0.5);
    expect(bounds[1].w).toBeCloseTo(0.5);
    expect(bounds[0].x).toBeCloseTo(0);
    expect(bounds[1].x).toBeCloseTo(0.5);
  });

  it('vertical split divides height', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'vertical',
      ratio: 0.3,
      children: [
        { type: 'leaf', paneId: 'a' },
        { type: 'leaf', paneId: 'b' },
      ],
    };
    const bounds = computePaneBounds(layout);
    expect(bounds[0].h).toBeCloseTo(0.3);
    expect(bounds[1].h).toBeCloseTo(0.7);
  });
});

describe('navigatePane', () => {
  const layout: LayoutNode = {
    type: 'split',
    direction: 'horizontal',
    ratio: 0.5,
    children: [
      {
        type: 'split',
        direction: 'vertical',
        ratio: 0.5,
        children: [
          { type: 'leaf', paneId: 'top-left' },
          { type: 'leaf', paneId: 'bottom-left' },
        ],
      },
      { type: 'leaf', paneId: 'right' },
    ],
  };

  it('navigates right from top-left to right pane', () => {
    expect(navigatePane(layout, 'top-left', 'right')).toBe('right');
  });

  it('navigates left from right to nearest left pane', () => {
    const result = navigatePane(layout, 'right', 'left');
    expect(['top-left', 'bottom-left']).toContain(result);
  });

  it('navigates down from top-left to bottom-left', () => {
    expect(navigatePane(layout, 'top-left', 'down')).toBe('bottom-left');
  });

  it('navigates up from bottom-left to top-left', () => {
    expect(navigatePane(layout, 'bottom-left', 'up')).toBe('top-left');
  });

  it('returns current pane when no neighbor in direction', () => {
    expect(navigatePane(layout, 'top-left', 'up')).toBe('top-left');
  });

  it('returns current pane for single leaf', () => {
    const single: LayoutNode = { type: 'leaf', paneId: 'only' };
    expect(navigatePane(single, 'only', 'right')).toBe('only');
  });
});
