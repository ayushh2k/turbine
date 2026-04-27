<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" alt="Turbine logo" />
</p>

<h1 align="center">Turbine</h1>

<p align="center">
  <strong>Open-source mission control for AI coding agents</strong>
</p>

<p align="center">
  Run Claude Code, Gemini CLI, Codex, or any CLI tool side-by-side in a tiled terminal workspace with built-in code editing, task management, and multi-agent orchestration.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#features">Features</a> · <a href="docs/FEATURE_STATUS.md">Feature Status</a> · <a href="CONTRIBUTING.md">Contributing</a> · <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-developer_preview-orange?style=flat-square" alt="Status: Developer Preview" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Platforms" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License: MIT" />
  <img src="https://img.shields.io/badge/built_with-Tauri%20v2%20%2B%20React%2019-purple?style=flat-square" alt="Built with Tauri v2 + React 19" />
</p>

<br />

<p align="center">
  <img src="docs/demo/hero.gif" alt="Turbine demo — multi-pane terminal workspace with AI agents" width="960" />
</p>

---

## What is Turbine?

Turbine is a native desktop app that gives you a single window to run, monitor, and coordinate multiple AI coding agents. Instead of juggling terminal tabs, editor windows, and task trackers, you get a tiled workspace where everything lives together.

It's built on [Tauri v2](https://tauri.app) (Rust backend) and React 19 — not Electron — so it's fast and lightweight even with 16 terminals running simultaneously.

**Turbine is not** an IDE or a replacement for your editor. It's the command center that sits alongside your editor, purpose-built for the workflow of delegating tasks to AI agents and watching them work in parallel.

## Features

### Multi-pane terminal workspace
Split your screen into up to 16 terminal panes. Resize, drag-to-swap, and navigate between panes with keyboard shortcuts. Apply layout templates instantly.

<p align="center">
  <img src="docs/demo/quick_panes.gif" alt="Quick pane layout templates" width="720" />
</p>

### Workspace tabs with persistence
Each workspace tab has its own layout, pane configuration, and settings. Everything auto-saves to SQLite and restores on startup — pane titles, working directories, environment variables, and startup commands.

<p align="center">
  <img src="docs/demo/workspace.png" alt="Multi-workspace tabs" width="720" />
</p>

### Built-in code viewer
CodeMirror 6 editor with syntax highlighting for 20+ languages, search, line numbers, and save support. Open files from the file browser or drag them onto terminal panes.

### Task board
Kanban board scoped per project. Create tasks, assign them to agents, and launch CLI commands directly from the board.

<p align="center">
  <img src="docs/demo/kanban.png" alt="Kanban task board" width="720" />
</p>

### 11 built-in themes
Dark-first design with Subnautica as the default. Switch themes live from the settings panel with color previews.

<p align="center">
  <img src="docs/demo/theme_switcher.gif" alt="Theme switcher with live preview" width="720" />
</p>

### And more
- **Broadcast mode** — type once, send to multiple terminals. Per-pane target selection.
- **Command palette** — fuzzy search for all actions (Ctrl+Shift+P)
- **File browser** — tree view with git status indicators and drag-to-terminal
- **Agent auto-launch** — configure startup commands per pane, auto-run on workspace open
- **Swarm panel** — multi-agent orchestration with role-based presets
- **Diff viewer** — review agent-generated code changes
- **Keyboard-driven** — fully customizable keybindings, directional pane navigation (Ctrl+/)
- **Custom pane titles** — double-click to rename, persisted across restarts
- **Inline images** — Sixel graphics protocol support via xterm.js

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io) 9+
- Platform dependencies per the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

### Run

```bash
git clone https://github.com/ayushh2k/turbine.git
cd turbine/turbine-app
pnpm install
pnpm tauri dev
```

First run is slow (Rust compilation). Subsequent runs use incremental builds.

```bash
pnpm tauri build    # Production build
```

> Always use `pnpm`, not `npm`.

### Optional: AI Agent CLIs

The task runner and swarm features launch external CLI tools. Install whichever agents you use:

| Agent | Install |
|-------|---------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `npm i -g @anthropic-ai/claude-code` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `npm i -g @google/gemini-cli` |
| [OpenAI Codex](https://github.com/openai/codex) | `npm i -g @openai/codex` |

Any CLI tool that reads stdin/stdout works. Configure custom agent presets in the Swarm Panel.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop framework | [Tauri v2](https://tauri.app) |
| Backend | Rust — `portable-pty`, `rusqlite`, `notify` |
| Frontend | [React 19](https://react.dev) + [Zustand](https://zustand.docs.pmnd.rs) |
| Terminal | [xterm.js](https://xtermjs.org) (WebGL) |
| Code editor | [CodeMirror 6](https://codemirror.net) |
| Database | SQLite (embedded) |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Tauri Window                    │
│  ┌───────────────────────────────────────────┐  │
│  │  React 19 Frontend                        │  │
│  │  TabBar · PaneContainer · CommandPalette  │  │
│  │  Zustand stores · Layout engine · Themes  │  │
│  └──────────────────┬────────────────────────┘  │
│                     │ IPC (invoke / listen)      │
│  ┌──────────────────┴────────────────────────┐  │
│  │  Rust Backend                             │  │
│  │  PTY Manager · SQLite · File Watcher      │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

Key entry points: `src/App.tsx`, `src/state/workspaceStore.ts`, `src/state/layoutEngine.ts`, `src-tauri/src/lib.rs`, `src-tauri/src/pty_manager.rs`

See [`docs/codebase-map.md`](docs/codebase-map.md) for a guided walkthrough.

## Contributing

Contributions welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines.

```bash
# Verify before submitting
cargo check --manifest-path src-tauri/Cargo.toml
npx tsc --noEmit
pnpm vitest --run
```

## License

[MIT](LICENSE)
