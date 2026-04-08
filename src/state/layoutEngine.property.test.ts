import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
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

// ──────────────────────────────────────────────────────────────────────────
// Arbitraries
// ──────────────────────────────────────────────────────────────────────────

const arbPaneTemplate = fc.constantFrom<PaneTemplate>(1, 2, 4, 6, 8, 10, 12, 14, 16);

// Arbitraries for random LayoutNode generation could be used for deeper
// fuzz testing but templates cover the structured case well enough.

// ──────────────────────────────────────────────────────────────────────────
// Property 7: Template produces correct pane count
// ──────────────────────────────────────────────────────────────────────────

describe('Property 7: Template produces correct pane count', () => {
  it('applyTemplate(n) always produces exactly n leaves', () => {
    fc.assert(
      fc.property(arbPaneTemplate, (template) => {
        const layout = applyTemplate(template);
        expect(countLeaves(layout)).toBe(template);
      }),
    );
  });

  it('all leaf IDs are unique', () => {
    fc.assert(
      fc.property(arbPaneTemplate, (template) => {
        const layout = applyTemplate(template);
        const ids = findLeafIds(layout);
        expect(new Set(ids).size).toBe(ids.length);
      }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Property 8: Split increases pane count by one
// ──────────────────────────────────────────────────────────────────────────

describe('Property 8: Split increases pane count by one', () => {
  it('splitHorizontal adds exactly one leaf', () => {
    fc.assert(
      fc.property(arbPaneTemplate, (template) => {
        const layout = applyTemplate(template);
        const ids = findLeafIds(layout);
        const target = ids[Math.floor(Math.random() * ids.length)];
        const result = splitHorizontal(layout, target);
        expect(countLeaves(result)).toBe(template + 1);
      }),
      { numRuns: 50 },
    );
  });

  it('splitVertical adds exactly one leaf', () => {
    fc.assert(
      fc.property(arbPaneTemplate, (template) => {
        const layout = applyTemplate(template);
        const ids = findLeafIds(layout);
        const target = ids[Math.floor(Math.random() * ids.length)];
        const result = splitVertical(layout, target);
        expect(countLeaves(result)).toBe(template + 1);
      }),
      { numRuns: 50 },
    );
  });

  it('original pane ID is preserved after split', () => {
    fc.assert(
      fc.property(arbPaneTemplate, (template) => {
        const layout = applyTemplate(template);
        const ids = findLeafIds(layout);
        const target = ids[0];
        const result = splitHorizontal(layout, target);
        expect(findLeafIds(result)).toContain(target);
      }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Property 9: Close pane decreases count and preserves remaining
// ──────────────────────────────────────────────────────────────────────────

describe('Property 9: Close pane decreases count', () => {
  it('closing a leaf in a multi-leaf tree removes exactly one', () => {
    const templates = [2, 4, 6, 8, 10, 12, 14, 16] as const;
    fc.assert(
      fc.property(fc.constantFrom(...templates), (template) => {
        const layout = applyTemplate(template);
        const ids = findLeafIds(layout);
        const target = ids[Math.floor(Math.random() * ids.length)];
        const result = closePane(layout, target);
        expect(countLeaves(result)).toBe(template - 1);
        expect(findLeafIds(result)).not.toContain(target);
      }),
      { numRuns: 50 },
    );
  });

  it('remaining IDs are a subset of original', () => {
    fc.assert(
      fc.property(fc.constantFrom<PaneTemplate>(4, 8, 16), (template) => {
        const layout = applyTemplate(template);
        const ids = findLeafIds(layout);
        const target = ids[0];
        const result = closePane(layout, target);
        const remaining = new Set(findLeafIds(result));
        for (const id of remaining) {
          expect(ids).toContain(id);
        }
      }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Property 10: Resize keeps split ratios valid
// ──────────────────────────────────────────────────────────────────────────

function collectRatios(node: LayoutNode): number[] {
  if (node.type === 'leaf') return [];
  return [
    node.ratio,
    ...collectRatios(node.children[0]),
    ...collectRatios(node.children[1]),
  ];
}

describe('Property 10: Resize keeps split ratios in (0.01, 0.99)', () => {
  it('all ratios remain valid after resize', () => {
    fc.assert(
      fc.property(
        arbPaneTemplate.filter((t) => t >= 2),
        fc.double({ min: -2, max: 2, noNaN: true }),
        (template, delta) => {
          const layout = applyTemplate(template);
          const ids = findLeafIds(layout);
          const target = ids[0];
          const result = resizePane(layout, target, delta);
          for (const ratio of collectRatios(result)) {
            expect(ratio).toBeGreaterThanOrEqual(0.01);
            expect(ratio).toBeLessThanOrEqual(0.99);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Property 11: Pane rearrange preserves all panes
// ──────────────────────────────────────────────────────────────────────────

describe('Property 11: movePane preserves all pane IDs', () => {
  it('swap preserves exact set of IDs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PaneTemplate>(2, 4, 6, 8),
        (template) => {
          const layout = applyTemplate(template);
          const ids = findLeafIds(layout);
          const a = ids[0];
          const b = ids[ids.length - 1];
          const result = movePane(layout, a, b);
          const resultIds = findLeafIds(result);
          expect(new Set(resultIds)).toEqual(new Set(ids));
        },
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Property 12: Navigation returns valid pane
// ──────────────────────────────────────────────────────────────────────────

describe('Property 12: navigatePane always returns a valid pane ID', () => {
  it('result is always a leaf in the layout', () => {
    fc.assert(
      fc.property(
        arbPaneTemplate,
        fc.constantFrom<'up' | 'down' | 'left' | 'right'>('up', 'down', 'left', 'right'),
        (template, direction) => {
          const layout = applyTemplate(template);
          const ids = findLeafIds(layout);
          const current = ids[Math.floor(Math.random() * ids.length)];
          const result = navigatePane(layout, current, direction);
          expect(ids).toContain(result);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Property: computePaneBounds covers full unit square
// ──────────────────────────────────────────────────────────────────────────

describe('computePaneBounds tiles the unit square', () => {
  it('total area of all bounds equals 1.0', () => {
    fc.assert(
      fc.property(arbPaneTemplate, (template) => {
        const layout = applyTemplate(template);
        const bounds = computePaneBounds(layout);
        const totalArea = bounds.reduce((sum, b) => sum + b.w * b.h, 0);
        expect(totalArea).toBeCloseTo(1.0, 6);
      }),
    );
  });

  it('no bounds extend outside the unit square', () => {
    fc.assert(
      fc.property(arbPaneTemplate, (template) => {
        const layout = applyTemplate(template);
        const bounds = computePaneBounds(layout);
        for (const b of bounds) {
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(1.0 + 1e-9);
          expect(b.y + b.h).toBeLessThanOrEqual(1.0 + 1e-9);
          expect(b.w).toBeGreaterThan(0);
          expect(b.h).toBeGreaterThan(0);
        }
      }),
    );
  });
});
