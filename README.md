# Turbine

A Tauri v2 desktop terminal multiplexer with AI swarm orchestration.

<!-- screenshot -->

## Features

- **Terminal multiplexer** -- multiple shell sessions in a single window with full xterm.js rendering
- **Binary tree pane layout** -- split any pane horizontally or vertically; resize and navigate with keyboard shortcuts
- **AI swarm orchestration** -- configure agent presets (Orchestrator, Builder, Reviewer, Support), launch multi-agent workflows, and track status from a dedicated swarm panel
- **11 built-in themes** -- Subnautica, Deep Ocean, Midnight Ember, Aurora Borealis, Neon Tokyo, Forest Canopy, Arctic Frost, Solar Flare, Void Purple, Copper Oxide, Monochrome
- **Command palette** -- fuzzy search for all actions and files via Ctrl+P
- **Code viewer** -- CodeMirror 6 editor with syntax highlighting for 20+ languages, incremental loading, and save support
- **File watcher** -- automatic detection of external file changes via the notify crate
- **Task board** -- Kanban board (todo, in-progress, review, done) scoped per project
- **Auto-updates** -- built-in updater powered by tauri-plugin-updater
- **Keyboard-driven workflow** -- fully customizable keybindings persisted to SQLite; directional pane navigation, workspace switching, and broadcast mode

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop framework | [Tauri v2](https://tauri.app) |
| Backend | Rust (PTY management, SQLite, file I/O) |
| Frontend | [React 19](https://react.dev) |
| Terminal emulator | [xterm.js](https://xtermjs.org) with WebGL renderer |
| Code editor | [CodeMirror 6](https://codemirror.net) |
| Database | SQLite via [rusqlite](https://github.com/rusqlite/rusqlite) |
| State management | [Zustand](https://zustand.docs.pmnd.rs) |

## Prerequisites

- [Rust](https://rustup.rs) (stable toolchain)
- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io) 9+

Platform-specific dependencies are listed in the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/).

## Build Instructions

```bash
# Install dependencies
pnpm install

# Run in development mode (compiles Rust backend + starts Vite dev server)
pnpm tauri dev

# Build for production
pnpm tauri build
```

The first run is slow due to Rust compilation. Subsequent runs use incremental builds.

## License

[MIT](LICENSE)
