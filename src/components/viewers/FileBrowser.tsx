import { useMemo, useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileTreeEntry } from '../../types';
import './FileBrowser.css';

/** File icon color + letter, mimicking VS Code's Seti icon theme. */
interface FileIconDef { letter: string; color: string }

function getFileIconDef(name: string): FileIconDef {
  const lower = name.toLowerCase();
  const ext = lower.split('.').pop() ?? '';

  // Special filenames first
  if (lower === 'package.json') return { letter: 'N', color: '#8bc34a' };
  if (lower === 'tsconfig.json' || lower === 'jsconfig.json') return { letter: 'TS', color: '#3178c6' };
  if (lower === 'cargo.toml') return { letter: 'C', color: '#dea584' };
  if (lower === '.gitignore' || lower === '.gitattributes') return { letter: 'G', color: '#f54d27' };
  if (lower === 'dockerfile' || lower.startsWith('docker-compose')) return { letter: 'D', color: '#2496ed' };
  if (lower === 'makefile') return { letter: 'M', color: '#6d8086' };
  if (lower.endsWith('.lock')) return { letter: 'L', color: '#6d8086' };

  const map: Record<string, FileIconDef> = {
    ts:   { letter: 'TS', color: '#3178c6' },
    tsx:  { letter: 'TS', color: '#3178c6' },
    js:   { letter: 'JS', color: '#f1e05a' },
    jsx:  { letter: 'JS', color: '#f1e05a' },
    mjs:  { letter: 'JS', color: '#f1e05a' },
    cjs:  { letter: 'JS', color: '#f1e05a' },
    rs:   { letter: 'RS', color: '#dea584' },
    py:   { letter: 'PY', color: '#3572a5' },
    go:   { letter: 'GO', color: '#00add8' },
    java: { letter: 'J',  color: '#b07219' },
    kt:   { letter: 'KT', color: '#a97bff' },
    swift:{ letter: 'S',  color: '#f05138' },
    c:    { letter: 'C',  color: '#555555' },
    cpp:  { letter: 'C+', color: '#f34b7d' },
    h:    { letter: 'H',  color: '#555555' },
    cs:   { letter: 'C#', color: '#178600' },
    rb:   { letter: 'RB', color: '#cc342d' },
    php:  { letter: 'PH', color: '#4f5d95' },
    lua:  { letter: 'LU', color: '#000080' },
    sh:   { letter: 'SH', color: '#89e051' },
    bash: { letter: 'SH', color: '#89e051' },
    zsh:  { letter: 'SH', color: '#89e051' },
    json: { letter: '{}', color: '#f1e05a' },
    yaml: { letter: 'YM', color: '#cb171e' },
    yml:  { letter: 'YM', color: '#cb171e' },
    toml: { letter: 'TM', color: '#9c4221' },
    xml:  { letter: '<>', color: '#f34b7d' },
    html: { letter: '<>', color: '#e34c26' },
    htm:  { letter: '<>', color: '#e34c26' },
    css:  { letter: '#',  color: '#563d7c' },
    scss: { letter: '#',  color: '#c6538c' },
    less: { letter: '#',  color: '#1d365d' },
    md:   { letter: 'M',  color: '#083fa1' },
    mdx:  { letter: 'M',  color: '#083fa1' },
    txt:  { letter: 'T',  color: '#6d8086' },
    svg:  { letter: 'SV', color: '#ffb13b' },
    png:  { letter: 'IM', color: '#a074c4' },
    jpg:  { letter: 'IM', color: '#a074c4' },
    jpeg: { letter: 'IM', color: '#a074c4' },
    gif:  { letter: 'IM', color: '#a074c4' },
    webp: { letter: 'IM', color: '#a074c4' },
    ico:  { letter: 'IM', color: '#a074c4' },
    icns: { letter: 'IM', color: '#a074c4' },
    mp4:  { letter: 'VD', color: '#fd971f' },
    webm: { letter: 'VD', color: '#fd971f' },
    sql:  { letter: 'SQ', color: '#e38c00' },
    env:  { letter: 'EN', color: '#ecd53f' },
    log:  { letter: 'LG', color: '#6d8086' },
    wasm: { letter: 'WA', color: '#654ff0' },
  };

  return map[ext] ?? { letter: 'F', color: '#6d8086' };
}

type GitStatus = 'new' | 'modified' | 'deleted' | 'renamed' | 'clean';

type DirGitStatus = 'new' | 'modified';

/**
 * Rolls up file-level git statuses to directory level (VS Code style).
 * - "new" wins if any descendant is new (untracked).
 * - Otherwise "modified" if any descendant is modified/deleted/renamed.
 * Clean dirs are omitted from the map.
 */
function rollupDirStatuses(
  fileStatuses: Map<string, GitStatus>,
): Map<string, DirGitStatus> {
  const dirStatuses = new Map<string, DirGitStatus>();

  for (const [filePath, status] of fileStatuses) {
    if (status === 'clean') continue;

    const segments = filePath.split('/').filter(Boolean);
    // Walk every ancestor directory
    for (let i = 1; i < segments.length; i++) {
      const dirPath = segments.slice(0, i).join('/');
      const existing = dirStatuses.get(dirPath);
      if (status === 'new') {
        dirStatuses.set(dirPath, 'new');
      } else if (existing !== 'new') {
        dirStatuses.set(dirPath, 'modified');
      }
    }
  }

  return dirStatuses;
}

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
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [gitStatuses, setGitStatuses] = useState<Map<string, GitStatus>>(new Map());

  const tree = useMemo(() => createTree(entries), [entries]);
  const gitDirStatuses = useMemo(() => rollupDirStatuses(gitStatuses), [gitStatuses]);

  // Fetch git status for the project
  useEffect(() => {
    if (!rootPath) return;
    invoke<Record<string, string>>('git_status', { path: rootPath })
      .then((result) => {
        const map = new Map<string, GitStatus>();
        for (const [file, status] of Object.entries(result)) {
          map.set(file, status as GitStatus);
        }
        setGitStatuses(map);
      })
      .catch(() => {
        // git not available or not a git repo — ignore
      });
  }, [rootPath, entries]);

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
    setExpandedDirs((prev) => {
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
        <div className="file-browser__eyebrow">{getRootLabel(rootPath)}</div>
        {onRefresh && (
          <button
            className="file-browser__refresh"
            type="button"
            title="Refresh file list"
            onClick={onRefresh}
          >
            ↻
          </button>
        )}
      </div>

      <input
        className="file-browser__search"
        type="text"
        placeholder="Filter files..."
        aria-label="Filter project files"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="file-browser__content">
        {!rootPath && (
          <div className="file-browser__empty">
            Open a folder to browse files
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
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/turbine-filepath', entry.path);
                  e.dataTransfer.setData('text/plain', entry.path);
                  e.dataTransfer.effectAllowed = 'copyMove';
                }}
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
                expandedDirs={expandedDirs}
                activeFilePath={activeFilePath ?? null}
                gitStatuses={gitStatuses}
                gitDirStatuses={gitDirStatuses}
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
  expandedDirs: Set<string>;
  activeFilePath: string | null;
  gitStatuses: Map<string, GitStatus>;
  gitDirStatuses: Map<string, DirGitStatus>;
  onToggleDirectory: (relativePath: string) => void;
  onOpenFile: (path: string) => void;
}

function gitStatusClass(status: GitStatus | undefined): string {
  if (!status || status === 'clean') return '';
  return `file-browser__row--git-${status}`;
}

function gitDirStatusClass(status: DirGitStatus | undefined): string {
  if (!status) return '';
  return `file-browser__row--git-dir-${status}`;
}

function TreeNode({
  node,
  depth,
  expandedDirs,
  activeFilePath,
  gitStatuses,
  gitDirStatuses,
  onToggleDirectory,
  onOpenFile,
}: TreeNodeProps) {
  const expanded = node.isDir && expandedDirs.has(node.relativePath);
  const indent = 8 + depth * 16;

  if (!node.isDir) {
    const gs = gitStatuses.get(node.relativePath);
    const iconDef = getFileIconDef(node.name);
    return (
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/turbine-filepath', node.path);
          e.dataTransfer.setData('text/plain', node.path);
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        className={[
          'file-browser__row',
          'file-browser__row--file',
          node.path === activeFilePath ? 'file-browser__row--active' : '',
          gitStatusClass(gs),
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => onOpenFile(node.path)}
      >
        <span className="file-browser__file-icon" style={{ color: iconDef.color }}>{iconDef.letter}</span>
        <span className="file-browser__label">{node.name}</span>
      </button>
    );
  }

  const dirStatus = gitDirStatuses.get(node.relativePath);

  return (
    <div>
      <button
        type="button"
        className={[
          'file-browser__row',
          'file-browser__row--dir',
          gitDirStatusClass(dirStatus),
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => onToggleDirectory(node.relativePath)}
      >
        <span className={`file-browser__chevron${expanded ? ' file-browser__chevron--open' : ''}`}>▶</span>
        <span className="file-browser__dir-icon" style={{ color: expanded ? '#dcb67a' : '#6d8086' }}>{expanded ? '▾' : '▸'}</span>
        <span className="file-browser__label">{node.name}</span>
      </button>
      {expanded && node.children.map((child) => (
        <TreeNode
          key={joinTreePath(node.relativePath, child.name)}
          node={child}
          depth={depth + 1}
          expandedDirs={expandedDirs}
          activeFilePath={activeFilePath}
          gitStatuses={gitStatuses}
          gitDirStatuses={gitDirStatuses}
          onToggleDirectory={onToggleDirectory}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}
