# Codebase Map

This document is the fastest way to understand how Turbine is organized before
making a change.

## At a Glance

Turbine is a Tauri desktop app with a clean frontend/backend split:

- `src/`: React 19 frontend
- `src-tauri/src/`: Rust backend
- `docs/`: contributor-facing docs and media assets
- `.github/`: issue templates, PR template, and CI

The app has three core responsibilities:

1. Render tiled workspaces made of terminal, code, media, task, and swarm panes.
2. Manage native PTY processes, file I/O, SQLite persistence, and updates.
3. Coordinate multi-agent "swarm" workflows on top of the terminal system.

## Top-Level Directory Guide

```text
.
├── src/                 React app
├── src-tauri/           Rust + Tauri backend
├── docs/                Project docs and demo assets
├── public/              Static frontend assets
├── scripts/             Small repo utilities
├── .github/             CI and community templates
├── README.md            Product overview and quick start
└── CONTRIBUTING.md      Setup, workflow, and contribution rules
```

## Frontend Map

### `src/App.tsx`

The main composition root. It wires together:

- workspace loading and autosave
- layout actions like split, resize, and close
- file browser state
- swarm pane insertion
- command palette, settings, notifications, and side panels

If you want to understand how the app behaves as a whole, start here.

### `src/components/`

UI building blocks. The most important files are:

- `PaneContainer.tsx`: recursively renders the binary layout tree
- `TerminalPane.tsx`: xterm.js integration and PTY session lifecycle
- `CodeViewer.tsx`: CodeMirror file viewer/editor with external file watching
- `SwarmPanel.tsx`: swarm run orchestration UI
- `TaskBoard.tsx`: per-project kanban board
- `TabBar.tsx`: workspace tabs and top-level navigation
- `SettingsPanel.tsx`: user settings and theme preferences

The directory is intentionally flat today. That keeps browsing easy for small and
medium components, but contributors should expect a future split into feature
subfolders as the app grows.

### `src/state/`

Zustand stores and stateful app helpers:

- `workspaceStore.ts`: source of truth for workspaces, panes, and persistence
- `settingsStore.ts`: theme, shell, scrollback, and keybinding settings
- `swarmStore.ts`: run history, agent lifecycle, mailbox messages, workflow steps
- `taskStore.ts`: task board persistence
- `agentStore.ts`: agent presets
- `terminalSession.ts`: PTY spawn/write helpers
- `layoutEngine.ts`: pure layout tree operations

If you're changing app behavior, there is a good chance the relevant logic lives
here even if the trigger starts in a component.

### `src/hooks/`

Focused glue logic that would otherwise bloat components:

- `useAppStartup.ts`: startup flow
- `usePtyStatus.ts`: PTY status and lifecycle tracking
- `useBroadcast.ts`: broadcast mode input fan-out
- `useWorkspaceKeybindings.ts`: keyboard shortcuts for the active workspace
- `useCommandBlocks.ts`: terminal command segmentation

### `src/types/`

`index.ts` is the shared frontend type contract. This is the best place to
learn the main domain objects:

- `Workspace`
- `PaneConfig`
- `LayoutNode`
- `Task`
- `SwarmRun`
- `SwarmAgent`

### `src/themes/` and `src/utils/`

- `themes/`: built-in themes and theme application logic
- `utils/`: focused helpers such as language detection, media file detection,
  workspace root derivation, and folder opening

## Backend Map

### `src-tauri/src/lib.rs`

Backend entry point. It:

- initializes SQLite
- registers managed state
- registers Tauri commands
- shuts down PTYs on app exit

### `src-tauri/src/pty_manager.rs`

The native terminal layer:

- spawns shell processes using `portable-pty`
- writes stdin to panes
- resizes terminals
- emits `pty_output` and `pty_exit`
- kills sessions on demand or app exit

### `src-tauri/src/commands.rs`

The main IPC command surface. It currently includes:

- workspace CRUD
- settings and theme persistence
- task CRUD
- agent preset CRUD
- swarm run / message / agent / workflow-step persistence

This file is readable, but it is also one of the biggest backend hotspots.
When adding new backend capabilities, prefer grouping related commands together
and consider splitting by domain if the file keeps growing.

### `src-tauri/src/db.rs`

SQLite schema initialization and migrations. This is the single best file for
understanding what the app persists.

### `src-tauri/src/file_ops.rs`

Native file operations:

- read and write files
- incremental file reads
- file watching
- workspace file indexing
- git status lookup

### `src-tauri/src/swarm_engine.rs`

Workflow dependency evaluation for swarm runs. It decides which workflow steps
are ready after an agent completes.

## Runtime Flow

The most important end-to-end flows are:

### App startup

1. `src/main.tsx` mounts the app.
2. `src/App.tsx` calls `useAppStartup.ts`.
3. Startup loads settings, themes, and persisted workspaces.
4. Any auto-launch panes write their startup commands into existing PTYs.

### Terminal session

1. `TerminalPane.tsx` creates an xterm instance.
2. `terminalSession.ts` invokes `pty_spawn`.
3. `pty_manager.rs` spawns the shell and emits `pty_output`.
4. The frontend listens for terminal output and writes it into xterm.

### File viewer

1. A pane opens a file path as `code_viewer` or `media_viewer`.
2. `CodeViewer.tsx` invokes `read_file`.
3. `file_ops.rs` reads the file and optionally starts a watcher.
4. External changes trigger `file_changed` and the editor reloads.

### Swarm run

1. `SwarmPanel.tsx` creates a run and spawns agents through `swarmStore.ts`.
2. The backend stores swarm metadata in SQLite.
3. `App.tsx` converts pending agents into real terminal panes.
4. Agent completion updates run state and can trigger `swarm_engine.rs` to
   schedule downstream workflow steps.

## Where to Start by Task

- New pane type: `src/types/index.ts`, `src/components/PaneContainer.tsx`, and
  whichever component renders the pane
- Terminal behavior: `src/components/TerminalPane.tsx`,
  `src/state/terminalSession.ts`, `src-tauri/src/pty_manager.rs`
- Workspace persistence: `src/state/workspaceStore.ts`,
  `src-tauri/src/commands.rs`, `src-tauri/src/db.rs`
- File browser or editor changes: `src/components/FileBrowser.tsx`,
  `src/components/CodeViewer.tsx`, `src-tauri/src/file_ops.rs`
- Swarm features: `src/components/SwarmPanel.tsx`,
  `src/state/swarmStore.ts`, `src-tauri/src/swarm_engine.rs`
- Settings and themes: `src/state/settingsStore.ts`,
  `src/themes/themeEngine.ts`, `src/components/SettingsPanel.tsx`

## Current Readability Notes

The structure is already good enough for open source, but these files carry a
lot of responsibility and are worth treating carefully:

- `src/App.tsx`
- `src/components/SwarmPanel.tsx`
- `src/components/TerminalPane.tsx`
- `src-tauri/src/commands.rs`
- `src-tauri/src/db.rs`

They are not blockers, but they are the most likely places to benefit from
future extraction into smaller domain modules.
