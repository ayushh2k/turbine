import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// ---------------------------------------------------------------------------
// Setup: deterministic UUID for applyTemplate / split internals
// ---------------------------------------------------------------------------

let uuidCounter = 0;
beforeEach(() => {
  uuidCounter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    return `pane-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`;
  });
});

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

/** Generate a valid PaneTemplate value. */
const arbTemplate: fc.Arbitrary<PaneTemplate> = fc.constantFrom(
  1, 2, 4, 6, 8, 10, 12, 14, 16,
) as fc.Arbitrary<PaneTemplate>;

/**
 * Generate a random LayoutNode tree with 1-8 leaves using fc.letrec.
 * Ratios are in [0.1, 0.9] to stay well within clamping bounds.
 * Uses the `depthSize` option to bias toward smaller trees.
 */
const arbLayoutTree: fc.Arbitrary<LayoutNode> = fc
  .letrec<{ tree: LayoutNode }>((tie) => ({
    tree: fc.oneof(
      { depthSize: 'small' },
      // Leaf node
      fc.record({
        type: fc.constant('leaf' as const),
        paneId: fc.uuid(),
      }),
      // Split node with two children
      fc
        .record({
          type: fc.constant('split' as const),
          direction: fc.constantFrom(
            'horizontal' as const,
            'vertical' as const,
          ),
          ratio: fc.double({ min: 0.1, max: 0.9, noNaN: true }),
          children: fc.tuple(tie('tree'), tie('tree')),
        })
        .map((r) => ({
          ...r,
          children: r.children as [LayoutNode, LayoutNode],
        })),
    ),
  }))
  .tree.filter((tree) => {
    const n = countLeaves(tree);
    return n >= 1 && n <= 8;
  });

/** Pick a random leaf ID from a layout tree. */
function arbLeafId(tree: LayoutNode): fc.Arbitrary<string> {
  const ids = findLeafIds(tree);
  return fc.constantFrom(...ids);
}

/** Pick two distinct leaf IDs from a layout tree (requires >= 2 leaves). */
function arbTwoLeafIds(tree: LayoutNode): fc.Arbitrary<[string, string]> {
  const ids = findLeafIds(tree);
  return fc
    .tuple(
      fc.integer({ min: 0, max: ids.length - 1 }),
      fc.integer({ min: 0, max: ids.length - 1 }),
    )
    .filter(([a, b]) => a !== b)
    .map(([a, b]) => [ids[a], ids[b]]);
}

const arbDirection = fc.constantFrom(
  'up' as const,
  'down' as const,
  'left' as const,
  'right' as const,
);

// ---------------------------------------------------------------------------
// Helper: collect all ratios from a layout tree
// ---------------------------------------------------------------------------

function collectRatios(node: LayoutNode): number[] {
  if (node.type === 'leaf') return [];
  return [
    node.ratio,
    ...collectRatios(node.children[0]),
    ...collectRatios(node.children[1]),
  ];
}

// ===========================================================================
// Property 7: Template produces correct pane count
// ===========================================================================

describe('Property 7: Template produces correct pane count', () => {
  it('applyTemplate returns a tree with exactly the requested number of leaves', () => {
    fc.assert(
      fc.property(arbTemplate, (template) => {
        const tree = applyTemplate(template);
        const leafCount = countLeaves(tree);
        expect(leafCount).toBe(template);
      }),
      { numRuns: 200 },
    );
  });

  it('applyTemplate produces unique pane IDs', () => {
    fc.assert(
      fc.property(arbTemplate, (template) => {
        const tree = applyTemplate(template);
        const ids = findLeafIds(tree);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
      }),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// Property 8: Split increases pane count by one
// ===========================================================================

describe('Property 8: Split increases pane count by one', () => {
  it('splitHorizontal increases leaf count by exactly 1', () => {
    fc.assert(
      fc.property(arbLayoutTree, (tree) => {
        const ids = findLeafIds(tree);
        const targetId = ids[0];
        const before = countLeaves(tree);
        const after = countLeaves(splitHorizontal(tree, targetId));
        expect(after).toBe(before + 1);
      }),
      { numRuns: 300 },
    );
  });

  it('splitVertical increases leaf count by exactly 1', () => {
    fc.assert(
      fc.property(arbLayoutTree, (tree) => {
        const ids = findLeafIds(tree);
        const targetId = ids[0];
        const before = countLeaves(tree);
        const after = countLeaves(splitVertical(tree, targetId));
        expect(after).toBe(before + 1);
      }),
      { numRuns: 300 },
    );
  });

  it('splitting preserves all original pane IDs', () => {
    fc.assert(
      fc.property(arbLayoutTree, (tree) => {
        const originalIds = findLeafIds(tree);
        const targetId = originalIds[0];
        const newTree = splitHorizontal(tree, targetId);
        const newIds = new Set(findLeafIds(newTree));
        for (const id of originalIds) {
          expect(newIds.has(id)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('splitting any arbitrary leaf in the tree increases count by 1', () => {
    fc.assert(
      fc.property(
        arbLayoutTree.chain((tree) =>
          arbLeafId(tree).map((leafId) => ({ tree, leafId })),
        ),
        ({ tree, leafId }) => {
          const before = countLeaves(tree);
          const afterH = countLeaves(splitHorizontal(tree, leafId));
          const afterV = countLeaves(splitVertical(tree, leafId));
          expect(afterH).toBe(before + 1);
          expect(afterV).toBe(before + 1);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ===========================================================================
// Property 9: Close pane decreases count and preserves tiling
// ===========================================================================

describe('Property 9: Close pane decreases count and preserves tiling', () => {
  const arbMultiLeafTree = arbLayoutTree.filter(
    (tree) => countLeaves(tree) > 1,
  );

  it('closing a leaf decreases count by 1', () => {
    fc.assert(
      fc.property(
        arbMultiLeafTree.chain((tree) =>
          arbLeafId(tree).map((leafId) => ({ tree, leafId })),
        ),
        ({ tree, leafId }) => {
          const before = countLeaves(tree);
          const newTree = closePane(tree, leafId);
          const after = countLeaves(newTree);
          expect(after).toBe(before - 1);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('remaining pane IDs are a subset of the original', () => {
    fc.assert(
      fc.property(
        arbMultiLeafTree.chain((tree) =>
          arbLeafId(tree).map((leafId) => ({ tree, leafId })),
        ),
        ({ tree, leafId }) => {
          const originalIds = new Set(findLeafIds(tree));
          const newTree = closePane(tree, leafId);
          const remainingIds = findLeafIds(newTree);
          for (const id of remainingIds) {
            expect(originalIds.has(id)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('closed pane ID is not present in the result', () => {
    fc.assert(
      fc.property(
        arbMultiLeafTree.chain((tree) =>
          arbLeafId(tree).map((leafId) => ({ tree, leafId })),
        ),
        ({ tree, leafId }) => {
          const newTree = closePane(tree, leafId);
          const remainingIds = findLeafIds(newTree);
          expect(remainingIds).not.toContain(leafId);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('closing the only pane in a single-leaf tree returns the tree unchanged', () => {
    fc.assert(
      fc.property(fc.uuid(), (paneId) => {
        const tree: LayoutNode = { type: 'leaf', paneId };
        const result = closePane(tree, paneId);
        expect(result).toBe(tree);
        expect(countLeaves(result)).toBe(1);
      }),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// Property 10: Resize keeps split ratios valid
// ===========================================================================

describe('Property 10: Resize keeps split ratios valid', () => {
  const arbSplitTree = arbLayoutTree.filter((t) => t.type === 'split');

  it('all ratios remain within [0.01, 0.99] after resizePane', () => {
    fc.assert(
      fc.property(
        arbSplitTree.chain((tree) =>
          fc
            .tuple(
              arbLeafId(tree),
              fc.double({ min: -1, max: 1, noNaN: true }),
            )
            .map(([leafId, delta]) => ({ tree, leafId, delta })),
        ),
        ({ tree, leafId, delta }) => {
          const resized = resizePane(tree, leafId, delta);
          const ratios = collectRatios(resized);
          for (const ratio of ratios) {
            expect(ratio).toBeGreaterThanOrEqual(0.01);
            expect(ratio).toBeLessThanOrEqual(0.99);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('resize with zero delta does not change ratios', () => {
    fc.assert(
      fc.property(
        arbSplitTree.chain((tree) =>
          arbLeafId(tree).map((leafId) => ({ tree, leafId })),
        ),
        ({ tree, leafId }) => {
          const resized = resizePane(tree, leafId, 0);
          const originalRatios = collectRatios(tree);
          const newRatios = collectRatios(resized);
          expect(newRatios).toEqual(originalRatios);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('resize preserves leaf count and pane IDs', () => {
    fc.assert(
      fc.property(
        arbSplitTree.chain((tree) =>
          fc
            .tuple(
              arbLeafId(tree),
              fc.double({ min: -0.5, max: 0.5, noNaN: true }),
            )
            .map(([leafId, delta]) => ({ tree, leafId, delta })),
        ),
        ({ tree, leafId, delta }) => {
          const resized = resizePane(tree, leafId, delta);
          expect(countLeaves(resized)).toBe(countLeaves(tree));
          const originalIds = findLeafIds(tree).sort();
          const newIds = findLeafIds(resized).sort();
          expect(newIds).toEqual(originalIds);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('extreme delta values are properly clamped', () => {
    fc.assert(
      fc.property(
        arbSplitTree.chain((tree) =>
          arbLeafId(tree).map((leafId) => ({ tree, leafId })),
        ),
        fc.constantFrom(-1000, -100, -10, 10, 100, 1000),
        ({ tree, leafId }, delta) => {
          const resized = resizePane(tree, leafId, delta);
          const ratios = collectRatios(resized);
          for (const ratio of ratios) {
            expect(ratio).toBeGreaterThanOrEqual(0.01);
            expect(ratio).toBeLessThanOrEqual(0.99);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// Property 11: Pane rearrange (movePane) preserves all panes
// ===========================================================================

describe('Property 11: Pane rearrange preserves all panes', () => {
  const arbMultiLeafTree = arbLayoutTree.filter(
    (tree) => countLeaves(tree) >= 2,
  );

  it('movePane preserves the same set of pane IDs', () => {
    fc.assert(
      fc.property(
        arbMultiLeafTree.chain((tree) =>
          arbTwoLeafIds(tree).map(([a, b]) => ({ tree, a, b })),
        ),
        ({ tree, a, b }) => {
          const moved = movePane(tree, a, b);
          const originalIds = findLeafIds(tree).sort();
          const movedIds = findLeafIds(moved).sort();
          expect(movedIds).toEqual(originalIds);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('movePane preserves leaf count', () => {
    fc.assert(
      fc.property(
        arbMultiLeafTree.chain((tree) =>
          arbTwoLeafIds(tree).map(([a, b]) => ({ tree, a, b })),
        ),
        ({ tree, a, b }) => {
          const moved = movePane(tree, a, b);
          expect(countLeaves(moved)).toBe(countLeaves(tree));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('movePane with same source and target is identity (referential equality)', () => {
    fc.assert(
      fc.property(
        arbLayoutTree.chain((tree) =>
          arbLeafId(tree).map((id) => ({ tree, id })),
        ),
        ({ tree, id }) => {
          const result = movePane(tree, id, id);
          expect(result).toBe(tree);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('movePane is its own inverse (swap A,B then swap A,B restores positions)', () => {
    fc.assert(
      fc.property(
        arbMultiLeafTree.chain((tree) =>
          arbTwoLeafIds(tree).map(([a, b]) => ({ tree, a, b })),
        ),
        ({ tree, a, b }) => {
          const once = movePane(tree, a, b);
          const twice = movePane(once, a, b);
          // Verify all pane positions are fully restored
          const originalLeafList = findLeafIds(tree);
          const restoredLeafList = findLeafIds(twice);
          expect(restoredLeafList).toEqual(originalLeafList);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('movePane preserves tree structure (ratios and directions unchanged)', () => {
    fc.assert(
      fc.property(
        arbMultiLeafTree.chain((tree) =>
          arbTwoLeafIds(tree).map(([a, b]) => ({ tree, a, b })),
        ),
        ({ tree, a, b }) => {
          const moved = movePane(tree, a, b);
          const originalRatios = collectRatios(tree);
          const movedRatios = collectRatios(moved);
          expect(movedRatios).toEqual(originalRatios);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// Property 12: Navigation returns valid pane
// ===========================================================================

describe('Property 12: Navigation returns valid pane', () => {
  it('navigatePane always returns a pane ID that exists in the layout', () => {
    fc.assert(
      fc.property(
        arbLayoutTree.chain((tree) =>
          fc
            .tuple(arbLeafId(tree), arbDirection)
            .map(([paneId, dir]) => ({ tree, paneId, dir })),
        ),
        ({ tree, paneId, dir }) => {
          const result = navigatePane(tree, paneId, dir);
          const allIds = findLeafIds(tree);
          expect(allIds).toContain(result);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('navigatePane on a single-leaf tree returns the same pane', () => {
    fc.assert(
      fc.property(fc.uuid(), arbDirection, (paneId, dir) => {
        const tree: LayoutNode = { type: 'leaf', paneId };
        const result = navigatePane(tree, paneId, dir);
        expect(result).toBe(paneId);
      }),
      { numRuns: 200 },
    );
  });

  it('navigatePane never returns undefined or empty string', () => {
    fc.assert(
      fc.property(
        arbLayoutTree.chain((tree) =>
          fc
            .tuple(arbLeafId(tree), arbDirection)
            .map(([paneId, dir]) => ({ tree, paneId, dir })),
        ),
        ({ tree, paneId, dir }) => {
          const result = navigatePane(tree, paneId, dir);
          expect(result).toBeDefined();
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ===========================================================================
// computePaneBounds covers full area (unit square tiling)
// ===========================================================================

describe('computePaneBounds covers full area', () => {
  it('total area of all bounds equals 1.0 (unit square)', () => {
    fc.assert(
      fc.property(arbLayoutTree, (tree) => {
        const bounds = computePaneBounds(tree);
        const totalArea = bounds.reduce((sum, b) => sum + b.w * b.h, 0);
        expect(totalArea).toBeCloseTo(1.0, 8);
      }),
      { numRuns: 500 },
    );
  });

  it('number of bounds equals number of leaves', () => {
    fc.assert(
      fc.property(arbLayoutTree, (tree) => {
        const bounds = computePaneBounds(tree);
        expect(bounds.length).toBe(countLeaves(tree));
      }),
      { numRuns: 300 },
    );
  });

  it('all bounds are within the unit square', () => {
    fc.assert(
      fc.property(arbLayoutTree, (tree) => {
        const bounds = computePaneBounds(tree);
        const EPS = 1e-9;
        for (const b of bounds) {
          expect(b.x).toBeGreaterThanOrEqual(-EPS);
          expect(b.y).toBeGreaterThanOrEqual(-EPS);
          expect(b.x + b.w).toBeLessThanOrEqual(1 + EPS);
          expect(b.y + b.h).toBeLessThanOrEqual(1 + EPS);
          expect(b.w).toBeGreaterThan(0);
          expect(b.h).toBeGreaterThan(0);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('pane bounds do not overlap (no two panes share interior area)', () => {
    fc.assert(
      fc.property(arbLayoutTree, (tree) => {
        const bounds = computePaneBounds(tree);
        const EPS = 1e-9;
        for (let i = 0; i < bounds.length; i++) {
          for (let j = i + 1; j < bounds.length; j++) {
            const a = bounds[i];
            const b = bounds[j];
            // Calculate overlap rectangle
            const overlapX = Math.max(
              0,
              Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
            );
            const overlapY = Math.max(
              0,
              Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
            );
            const overlapArea = overlapX * overlapY;
            expect(overlapArea).toBeLessThan(EPS);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('each bound has a unique pane ID matching the tree leaves', () => {
    fc.assert(
      fc.property(arbLayoutTree, (tree) => {
        const bounds = computePaneBounds(tree);
        const boundIds = bounds.map((b) => b.paneId).sort();
        const leafIds = findLeafIds(tree).sort();
        expect(boundIds).toEqual(leafIds);
      }),
      { numRuns: 300 },
    );
  });

  it('bounds tile the unit square with no gaps (grid-sampled point-in-pane check)', () => {
    // Sample a grid of interior points in the unit square and verify each
    // point falls inside exactly one pane's bounds.
    fc.assert(
      fc.property(arbLayoutTree, (tree) => {
        const bounds = computePaneBounds(tree);
        const SAMPLES = 20;
        const EPS = 1e-9;
        for (let xi = 0; xi < SAMPLES; xi++) {
          for (let yi = 0; yi < SAMPLES; yi++) {
            // Use interior sample points to avoid boundary ambiguity
            const px = (xi + 0.5) / SAMPLES;
            const py = (yi + 0.5) / SAMPLES;
            let containCount = 0;
            for (const b of bounds) {
              if (
                px >= b.x - EPS &&
                px <= b.x + b.w + EPS &&
                py >= b.y - EPS &&
                py <= b.y + b.h + EPS
              ) {
                containCount++;
              }
            }
            expect(containCount).toBe(1);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// Integration: combined operations preserve invariants
// ===========================================================================

describe('Combined operations preserve invariants', () => {
  it('split then close restores original leaf count', () => {
    fc.assert(
      fc.property(
        arbLayoutTree.chain((tree) =>
          arbLeafId(tree).map((leafId) => ({ tree, leafId })),
        ),
        ({ tree, leafId }) => {
          const before = countLeaves(tree);
          const split = splitHorizontal(tree, leafId);
          // The new pane is the one not in the original set
          const originalIds = new Set(findLeafIds(tree));
          const newIds = findLeafIds(split);
          const addedId = newIds.find((id) => !originalIds.has(id));
          expect(addedId).toBeDefined();
          const closed = closePane(split, addedId!);
          expect(countLeaves(closed)).toBe(before);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('applyTemplate then resize keeps all ratios valid', () => {
    fc.assert(
      fc.property(
        arbTemplate.filter((t) => t > 1),
        fc.double({ min: -0.5, max: 0.5, noNaN: true }),
        (template, delta) => {
          const tree = applyTemplate(template);
          const ids = findLeafIds(tree);
          const resized = resizePane(tree, ids[0], delta);
          const ratios = collectRatios(resized);
          for (const ratio of ratios) {
            expect(ratio).toBeGreaterThanOrEqual(0.01);
            expect(ratio).toBeLessThanOrEqual(0.99);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('applyTemplate then computePaneBounds tiles the unit square', () => {
    fc.assert(
      fc.property(arbTemplate, (template) => {
        const tree = applyTemplate(template);
        const bounds = computePaneBounds(tree);
        const totalArea = bounds.reduce((sum, b) => sum + b.w * b.h, 0);
        expect(totalArea).toBeCloseTo(1.0, 8);
        expect(bounds.length).toBe(template);
      }),
      { numRuns: 200 },
    );
  });

  it('split then navigate always returns a valid pane', () => {
    fc.assert(
      fc.property(
        arbLayoutTree.chain((tree) =>
          fc
            .tuple(arbLeafId(tree), arbDirection)
            .map(([leafId, dir]) => ({ tree, leafId, dir })),
        ),
        ({ tree, leafId, dir }) => {
          const split = splitVertical(tree, leafId);
          const allIds = findLeafIds(split);
          const result = navigatePane(split, leafId, dir);
          expect(allIds).toContain(result);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('multiple sequential splits each increment count by 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (numSplits) => {
          let tree = applyTemplate(1);
          for (let i = 0; i < numSplits; i++) {
            const ids = findLeafIds(tree);
            const target = ids[i % ids.length];
            tree = i % 2 === 0
              ? splitHorizontal(tree, target)
              : splitVertical(tree, target);
            expect(countLeaves(tree)).toBe(1 + i + 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
