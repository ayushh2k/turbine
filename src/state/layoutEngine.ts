import type { LayoutNode, PaneTemplate, PaneConfig } from '../types';

/**
 * Generate a balanced binary tree of splits for the given pane count.
 * Each leaf gets a unique pane ID via crypto.randomUUID().
 */
export function applyTemplate(template: PaneTemplate): LayoutNode {
  if (template === 1) {
    return { type: 'leaf', paneId: crypto.randomUUID() };
  }

  const paneIds: string[] = [];
  for (let i = 0; i < template; i++) {
    paneIds.push(crypto.randomUUID());
  }

  return buildBalancedTree(paneIds, 'horizontal');
}

function buildBalancedTree(
  paneIds: string[],
  direction: 'horizontal' | 'vertical'
): LayoutNode {
  if (paneIds.length === 1) {
    return { type: 'leaf', paneId: paneIds[0] };
  }

  const mid = Math.ceil(paneIds.length / 2);
  const left = paneIds.slice(0, mid);
  const right = paneIds.slice(mid);
  const nextDirection = direction === 'horizontal' ? 'vertical' : 'horizontal';

  return {
    type: 'split',
    direction,
    ratio: left.length / paneIds.length,
    children: [
      buildBalancedTree(left, nextDirection),
      buildBalancedTree(right, nextDirection),
    ],
  };
}

export interface StarterPreset {
  layout: LayoutNode;
  panes: { id: string; type: PaneConfig['type'] }[];
}

export function createCodeAndConsolePreset(): StarterPreset {
  const codeId = crypto.randomUUID();
  const consoleId = crypto.randomUUID();
  return {
    layout: {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.6,
      children: [
        { type: 'leaf', paneId: codeId },
        { type: 'leaf', paneId: consoleId },
      ],
    },
    panes: [
      { id: codeId, type: 'code_viewer' },
      { id: consoleId, type: 'terminal' },
    ],
  };
}

export function createWebDevPreset(): StarterPreset {
  const codeId = crypto.randomUUID();
  const consoleId = crypto.randomUUID();
  const mediaId = crypto.randomUUID();
  return {
    layout: {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', paneId: codeId },
        {
          type: 'split',
          direction: 'vertical',
          ratio: 0.5,
          children: [
            { type: 'leaf', paneId: consoleId },
            { type: 'leaf', paneId: mediaId },
          ],
        },
      ],
    },
    panes: [
      { id: codeId, type: 'code_viewer' },
      { id: consoleId, type: 'terminal' },
      { id: mediaId, type: 'media_viewer' },
    ],
  };
}

/**
 * Split a pane horizontally — the target leaf becomes a horizontal split
 * with the original pane on the left and a new pane on the right.
 */
export function splitHorizontal(layout: LayoutNode, paneId: string): LayoutNode {
  return splitPane(layout, paneId, 'horizontal');
}

/**
 * Split a pane vertically — the target leaf becomes a vertical split
 * with the original pane on top and a new pane on the bottom.
 */
export function splitVertical(layout: LayoutNode, paneId: string): LayoutNode {
  return splitPane(layout, paneId, 'vertical');
}

function splitPane(
  layout: LayoutNode,
  paneId: string,
  direction: 'horizontal' | 'vertical'
): LayoutNode {
  if (layout.type === 'leaf') {
    if (layout.paneId === paneId) {
      return {
        type: 'split',
        direction,
        ratio: 0.5,
        children: [
          { type: 'leaf', paneId },
          { type: 'leaf', paneId: crypto.randomUUID() },
        ],
      };
    }
    return layout;
  }

  return {
    type: 'split',
    direction: layout.direction,
    ratio: layout.ratio,
    children: [
      splitPane(layout.children[0], paneId, direction),
      splitPane(layout.children[1], paneId, direction),
    ],
  };
}

/**
 * Close a pane — removes the leaf and promotes its sibling.
 * If the layout is a single leaf, returns it unchanged.
 */
export function closePane(layout: LayoutNode, paneId: string): LayoutNode {
  if (layout.type === 'leaf') {
    // Can't close the only pane
    return layout;
  }

  const [left, right] = layout.children;

  // Check if one of the direct children is the target leaf
  if (left.type === 'leaf' && left.paneId === paneId) {
    return right;
  }
  if (right.type === 'leaf' && right.paneId === paneId) {
    return left;
  }

  // Recurse into children
  const newLeft = closePane(left, paneId);
  const newRight = closePane(right, paneId);

  // If nothing changed, return as-is
  if (newLeft === left && newRight === right) {
    return layout;
  }

  return {
    type: 'split',
    direction: layout.direction,
    ratio: layout.ratio,
    children: [newLeft, newRight],
  };
}

/**
 * Resize a pane's parent split ratio by delta.
 * Finds the split node whose first child contains the target pane
 * and adjusts the ratio, clamping to (0.0, 1.0) exclusive.
 */
export function resizePane(
  layout: LayoutNode,
  paneId: string,
  delta: number
): LayoutNode {
  if (layout.type === 'leaf') {
    return layout;
  }

  const leftContains = containsPane(layout.children[0], paneId);
  const rightContains = containsPane(layout.children[1], paneId);

  if (leftContains && !rightContains) {
    // The pane is in the left child — check if it's a direct child
    if (layout.children[0].type === 'leaf' && layout.children[0].paneId === paneId) {
      const newRatio = clampRatio(layout.ratio + delta);
      return {
        type: 'split',
        direction: layout.direction,
        ratio: newRatio,
        children: layout.children,
      };
    }
    // Recurse into left
    return {
      type: 'split',
      direction: layout.direction,
      ratio: layout.ratio,
      children: [
        resizePane(layout.children[0], paneId, delta),
        layout.children[1],
      ],
    };
  }

  if (rightContains && !leftContains) {
    // The pane is in the right child — check if it's a direct child
    if (layout.children[1].type === 'leaf' && layout.children[1].paneId === paneId) {
      // Growing the right child means shrinking the ratio
      const newRatio = clampRatio(layout.ratio - delta);
      return {
        type: 'split',
        direction: layout.direction,
        ratio: newRatio,
        children: layout.children,
      };
    }
    // Recurse into right
    return {
      type: 'split',
      direction: layout.direction,
      ratio: layout.ratio,
      children: [
        layout.children[0],
        resizePane(layout.children[1], paneId, delta),
      ],
    };
  }

  return layout;
}

/**
 * Resize a split node at the given path by delta.
 * Path is an array of indices (0 = first child, 1 = second child)
 * identifying the exact split node in the tree.
 * An empty path means resize the root split.
 */
export function resizeAtPath(
  layout: LayoutNode,
  path: number[],
  delta: number
): LayoutNode {
  if (layout.type === 'leaf') return layout;

  if (path.length === 0) {
    return {
      type: 'split',
      direction: layout.direction,
      ratio: clampRatio(layout.ratio + delta),
      children: layout.children,
    };
  }

  const [head, ...rest] = path;
  return {
    type: 'split',
    direction: layout.direction,
    ratio: layout.ratio,
    children: layout.children.map((child, i) =>
      i === head ? resizeAtPath(child, rest, delta) : child,
    ) as [LayoutNode, LayoutNode],
  };
}

function clampRatio(ratio: number): number {
  const MIN = 0.01;
  const MAX = 0.99;
  return Math.min(MAX, Math.max(MIN, ratio));
}

function containsPane(node: LayoutNode, paneId: string): boolean {
  if (node.type === 'leaf') {
    return node.paneId === paneId;
  }
  return containsPane(node.children[0], paneId) || containsPane(node.children[1], paneId);
}

/**
 * Move (swap) two pane positions in the layout tree.
 */
export function movePane(
  layout: LayoutNode,
  fromId: string,
  toId: string
): LayoutNode {
  if (fromId === toId) return layout;

  return swapPaneIds(layout, fromId, toId);
}

function swapPaneIds(
  node: LayoutNode,
  idA: string,
  idB: string
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.paneId === idA) return { type: 'leaf', paneId: idB };
    if (node.paneId === idB) return { type: 'leaf', paneId: idA };
    return node;
  }

  return {
    type: 'split',
    direction: node.direction,
    ratio: node.ratio,
    children: [
      swapPaneIds(node.children[0], idA, idB),
      swapPaneIds(node.children[1], idA, idB),
    ],
  };
}

/**
 * Count the number of leaf nodes in a layout tree.
 */
export function countLeaves(layout: LayoutNode): number {
  if (layout.type === 'leaf') return 1;
  return countLeaves(layout.children[0]) + countLeaves(layout.children[1]);
}

/**
 * Collect all leaf pane IDs from a layout tree.
 */
export function findLeafIds(layout: LayoutNode): string[] {
  if (layout.type === 'leaf') return [layout.paneId];
  return [
    ...findLeafIds(layout.children[0]),
    ...findLeafIds(layout.children[1]),
  ];
}

/**
 * Geometric bounds for a pane within the layout.
 */
interface PaneBounds {
  paneId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute geometric bounds for every leaf pane in the layout.
 * Coordinates are normalized 0-1.
 */
export function computePaneBounds(
  layout: LayoutNode,
  x = 0,
  y = 0,
  w = 1,
  h = 1,
): PaneBounds[] {
  if (layout.type === 'leaf') {
    return [{ paneId: layout.paneId, x, y, w, h }];
  }

  const { direction, ratio, children } = layout;

  if (direction === 'horizontal') {
    const leftW = w * ratio;
    const rightW = w - leftW;
    return [
      ...computePaneBounds(children[0], x, y, leftW, h),
      ...computePaneBounds(children[1], x + leftW, y, rightW, h),
    ];
  } else {
    const topH = h * ratio;
    const bottomH = h - topH;
    return [
      ...computePaneBounds(children[0], x, y, w, topH),
      ...computePaneBounds(children[1], x, y + topH, w, bottomH),
    ];
  }
}

type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Find the geometrically adjacent pane in the given direction.
 * Returns the adjacent pane ID, or the current pane ID if no neighbor exists.
 */
export function navigatePane(
  layout: LayoutNode,
  currentPaneId: string,
  direction: Direction,
): string {
  const bounds = computePaneBounds(layout);
  const current = bounds.find((b) => b.paneId === currentPaneId);
  if (!current) return currentPaneId;

  const cx = current.x + current.w / 2;
  const cy = current.y + current.h / 2;

  let best: PaneBounds | null = null;
  let bestDist = Infinity;

  for (const b of bounds) {
    if (b.paneId === currentPaneId) continue;

    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;

    let isCandidate = false;
    switch (direction) {
      case 'left':  isCandidate = bx < cx; break;
      case 'right': isCandidate = bx > cx; break;
      case 'up':    isCandidate = by < cy; break;
      case 'down':  isCandidate = by > cy; break;
    }

    if (!isCandidate) continue;

    const dist = Math.hypot(bx - cx, by - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = b;
    }
  }

  return best?.paneId ?? currentPaneId;
}
