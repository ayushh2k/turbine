import { useMemo, useState, useCallback } from 'react';
import type { FileTreeEntry } from '../types';
import './FileBrowser.css';

interface FileBrowserProps {
  rootPath: string | null;
  entries: FileTreeEntry[];
  activeFilePath?: string | null;
  onOpenFile: (path: string) => void;
  onRefresh?: () => void;
}

interface FileTreeNode {
  name: string;
  path: string;
  relativePath: string;
  isDir: boolean;
  children: FileTreeNode[];
}

function joinTreePath(parent: string, child: string): string {
  return parent ? `${parent}/${child}` : child;
}

function createTree(entries: FileTreeEntry[]): FileTreeNode[] {
  const normalizedEntries = entries.filter(
    (entry): entry is FileTreeEntry =>
      Boolean(entry?.path) && Boolean(entry?.relativePath),
  );
  const root: FileTreeNode[] = [];
  const directories = new Map<string, FileTreeNode>();

  const ensureDirectory = (relativePath: string, path: string): FileTreeNode => {
    const existing = directories.get(relativePath);
    if (existing) {
      return existing;
    }

    const segments = relativePath.split('/').filter(Boolean);
    const name = segments[segments.length - 1] ?? relativePath;
    const node: FileTreeNode = {
      name,
      path,
      relativePath,
      isDir: true,
      children: [],
    };

    directories.set(relativePath, node);

    const parentPath = segments.slice(0, -1).join('/');
    if (!parentPath) {
      root.push(node);
      return node;
    }

    const parent = directories.get(parentPath);
    if (parent) {
      parent.children.push(node);
    } else {
      root.push(node);
    }

    return node;
  };

  const sortedEntries = [...normalizedEntries].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' }),
  );

  for (const entry of sortedEntries) {
    const segments = entry.relativePath.split('/').filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    if (entry.isDir) {
      ensureDirectory(entry.relativePath, entry.path);
      continue;
    }

    const fileName = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join('/');
    const fileNode: FileTreeNode = {
      name: fileName,
      path: entry.path,
      relativePath: entry.relativePath,
      isDir: false,
      children: [],
    };

    if (!parentPath) {
      root.push(fileNode);
      continue;
    }

    const parent = directories.get(parentPath);
    if (parent) {
      parent.children.push(fileNode);
    } else {
      root.push(fileNode);
    }
  }

  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }

      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    for (const node of nodes) {
      if (node.isDir) {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(root);
  return root;
}

function getRootLabel(rootPath: string | null): string {
  if (!rootPath) {
    return 'No project root';
  }

  const normalized = rootPath.replace(/\\/g, '/');
  const label = normalized.split('/').filter(Boolean).pop();
  return label || normalized;
}

export function FileBrowser({
  rootPath,
  entries,
  activeFilePath,
  onOpenFile,
  onRefresh,
}: FileBrowserProps) {
  const [query, setQuery] = useState('');
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

  const tree = useMemo(() => createTree(entries), [entries]);

  const fileMatches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return [];
    }

    return entries.filter((entry) => {
      if (entry.isDir) {
        return false;
      }

      return entry.relativePath.toLowerCase().includes(trimmed);
    });
  }, [entries, query]);

  const toggleDirectory = useCallback((relativePath: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }
      return next;
    });
  }, []);

  return (
    <aside className="file-browser" aria-label="Project files">
      <div className="file-browser__header">
        <div>
          <div className="file-browser__eyebrow">Project</div>
          <div className="file-browser__title">{getRootLabel(rootPath)}</div>
        </div>
        {onRefresh && (
          <button
            className="file-browser__refresh"
            type="button"
            title="Refresh file list"
            onClick={onRefresh}
          >
            Refresh
          </button>
        )}
      </div>

      <div className="file-browser__root-path" title={rootPath ?? 'No workspace root detected'}>
        {rootPath ?? 'Set a pane working directory to browse project files'}
      </div>

      <input
        className="file-browser__search"
        type="text"
        placeholder="Filter files..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="file-browser__content">
        {!rootPath && (
          <div className="file-browser__empty">
            Turbine needs a real workspace path before it can index files.
          </div>
        )}

        {rootPath && query.trim() && (
          <div className="file-browser__results">
            {fileMatches.length === 0 && (
              <div className="file-browser__empty">No matching files</div>
            )}
            {fileMatches.map((entry) => (
              <button
                key={entry.path}
                type="button"
                className={[
                  'file-browser__file',
                  entry.path === activeFilePath ? 'file-browser__file--active' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onOpenFile(entry.path)}
              >
                <span className="file-browser__file-name">
                  {entry.relativePath.split('/').pop()}
                </span>
                <span className="file-browser__file-path">{entry.relativePath}</span>
              </button>
            ))}
          </div>
        )}

        {rootPath && !query.trim() && (
          <div className="file-browser__tree">
            {tree.map((node) => (
              <TreeNode
                key={node.relativePath || node.path}
                node={node}
                depth={0}
                collapsedDirs={collapsedDirs}
                activeFilePath={activeFilePath ?? null}
                onToggleDirectory={toggleDirectory}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  collapsedDirs: Set<string>;
  activeFilePath: string | null;
  onToggleDirectory: (relativePath: string) => void;
  onOpenFile: (path: string) => void;
}

function TreeNode({
  node,
  depth,
  collapsedDirs,
  activeFilePath,
  onToggleDirectory,
  onOpenFile,
}: TreeNodeProps) {
  const collapsed = node.isDir && collapsedDirs.has(node.relativePath);

  if (!node.isDir) {
    return (
      <button
        type="button"
        className={[
          'file-browser__row',
          'file-browser__row--file',
          node.path === activeFilePath ? 'file-browser__row--active' : '',
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => onOpenFile(node.path)}
      >
        <span className="file-browser__icon">·</span>
        <span className="file-browser__label">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="file-browser__row file-browser__row--dir"
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => onToggleDirectory(node.relativePath)}
      >
        <span className="file-browser__icon">{collapsed ? '+' : '-'}</span>
        <span className="file-browser__label">{node.name}</span>
      </button>
      {!collapsed && node.children.map((child) => (
        <TreeNode
          key={joinTreePath(node.relativePath, child.name)}
          node={child}
          depth={depth + 1}
          collapsedDirs={collapsedDirs}
          activeFilePath={activeFilePath}
          onToggleDirectory={onToggleDirectory}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}
