<div align="center">

# Turbine

**A terminal workspace for AI-assisted development.**

Turbine is a cross-platform desktop app built on [Tauri](https://tauri.app) (Rust) + React 19. It gives you a tiling multi-pane terminal layout, a built-in code viewer, and first-class hooks for running CLI-based AI agents — all from a single, fast, local-first app.

[![CI](https://github.com/ayushh2k/turbine/actions/workflows/ci.yml/badge.svg)](https://github.com/ayushh2k/turbine/actions/workflows/ci.yml)
[![Release](https://github.com/ayushh2k/turbine/actions/workflows/release.yml/badge.svg)](https://github.com/ayushh2k/turbine/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## Features

### 🖥️ Terminal
- Fully featured xterm.js terminal with WebGL rendering
- Spawn any shell (zsh, bash, fish, or custom) per pane
- Per-pane working directory, startup command, and env vars
- In-terminal search (Ctrl+F), copy/paste, OSC 133 command block detection

### 🔲 Tiling Layout
- Binary-tree tiling layout — split any pane horizontal (Ctrl+D) or vertical (Ctrl+Shift+D)
- Drag-and-drop pane rearrangement and resizable borders
- 1-to-16 pane templates via the command palette
- Directional pane navigation with Ctrl+Arrow

### 🗂️ Workspaces
- Named workspaces with color-coded tabs — full layout + pane state persisted to SQLite
- Drag to reorder tabs; duplicate, rename, or delete via right-click
- Broadcast mode — fan out keystrokes to all terminal panes simultaneously

### 🤖 AI Agent Integration
- **Agent Presets** — configure CLI commands for Orchestrator / Builder / Reviewer / Support roles
- **Task Board** — Kanban board (todo → in-progress → review → done) scoped per project
- **Swarm Panel** — launch multi-agent workflows against a task; track each agent's status
- **Diff Viewer** — review git diffs produced by agents before merging
- Auto-launch panes: set a startup command + auto-launch flag per pane for instant agent spin-up

### 📄 Code Viewer
- CodeMirror 6 editor with syntax highlighting for 20+ languages
- Incremental loading for large files (512 KB chunks)
- Ctrl+F search, Ctrl+S save, dirty indicator, external change detection

### 🎨 Themes
11 built-in dark themes:
> Subnautica · Deep Ocean · Midnight Ember · Aurora Borealis · Neon Tokyo · Forest Canopy · Arctic Frost · Solar Flare · Void Purple · Copper Oxide · Monochrome

Custom themes can be defined as JSON and loaded via Settings.

### ⌨️ Keyboard-First
- Fully customizable keybindings persisted to SQLite
- Command palette (Ctrl+P) for all actions + fuzzy file-open
- Ctrl+1-9 direct workspace switching

---

## Prerequisites

| Tool | Version |
|------|---------|
| [Rust](https://rustup.rs) | stable (≥ 1.77) |
| [Node.js](https://nodejs.org) | 20+ |
| [pnpm](https://pnpm.io) | 9+ (`npm i -g pnpm`) |
| [Tauri CLI](https://tauri.app/start/prerequisites/) | v2 (installed via pnpm) |

**macOS only:** Xcode Command Line Tools (`xcode-select --install`)  
**Linux only:** `libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev`  
**Windows:** Microsoft C++ Build Tools + WebView2

See the full [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) for details.

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/ayushh2k/turbine.git
cd turbine

# Install JS dependencies
pnpm install

# Start in development mode (opens the app window)
pnpm tauri dev
```

The first run will compile the Rust backend — this takes a few minutes. Subsequent runs use incremental builds and are much faster.

### Build for production

```bash
pnpm tauri build
```

The signed installer / `.app` bundle will be placed in `src-tauri/target/release/bundle/`.

---

## Running Tests

```bash
# Rust backend tests
cargo test --manifest-path src-tauri/Cargo.toml

# TypeScript type check
npx tsc --noEmit

# Frontend unit tests (vitest)
pnpm exec vitest run
```

---

## Project Structure

```
turbine/                          # repo root (= turbine-app/)
├── src/
│   ├── components/               # React components (TerminalPane, CodeViewer, TabBar…)
│   ├── hooks/                    # Custom React hooks
│   ├── state/                    # Zustand stores + layout engine
│   ├── themes/                   # Built-in themes + theme engine
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utility helpers
├── src-tauri/
│   └── src/
│       ├── commands.rs           # Tauri command handlers (workspace, tasks, agents…)
│       ├── db.rs                 # SQLite schema + init
│       ├── file_ops.rs           # File read/write/watch
│       ├── pty_manager.rs        # PTY spawn/write/resize/kill
│       └── types.rs              # Rust types (mirrors TypeScript types)
├── .github/
│   ├── workflows/ci.yml          # CI: cargo test + tsc + vitest on every PR
│   ├── workflows/release.yml     # Release: cross-platform builds on git tag push
│   └── ISSUE_TEMPLATE/
├── AGENTS.md                     # AI assistant context (architecture quick-ref)
└── CONTRIBUTING.md
```

Full architecture documentation lives in [`.kiro/specs/turbine/design.md`](.kiro/specs/turbine/design.md).

---

## Releasing a New Version

Releases are automated. Push a version tag and GitHub Actions will build installers for all platforms and create a draft GitHub Release:

```bash
# Bump the version in package.json + tauri.conf.json first, then:
git tag v0.2.0
git push origin v0.2.0
```

The release pipeline builds:

| Platform | Artifacts |
|----------|-----------|
| **macOS** | `Turbine_*.dmg` (universal — Apple Silicon + Intel) |
| **Linux** | `turbine-app_*_amd64.deb` · `turbine-app_*_amd64.AppImage` |
| **Windows** | `Turbine_*_x64-setup.exe` · `Turbine_*_x64_en-US.msi` |

The release is created as a **draft** — review the artifacts on the [Releases page](https://github.com/ayushh2k/turbine/releases) and publish when ready.

> [!TIP]
> Tags containing a hyphen (`v1.0.0-beta.1`) are automatically marked as pre-releases.

---

## Contributing

We'd love your help! Please read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

---

## License

MIT — see [LICENSE](LICENSE).
