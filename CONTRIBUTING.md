# Contributing to Turbine

Thanks for your interest in contributing! Here's everything you need to get up and running.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [Workflow](#workflow)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)

---

## Development Setup

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | stable ≥ 1.77 | [rustup.rs](https://rustup.rs) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm i -g pnpm` |

**macOS:** You'll need Xcode Command Line Tools: `xcode-select --install`

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install -y \
  libgtk-3-dev libwebkit2gtk-4.1-dev \
  libappindicator3-dev librsvg2-dev patchelf
```

**Windows:** Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

See the full [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) if you run into issues.

### First-time setup

```bash
git clone https://github.com/ayushh2k/turbine.git
cd turbine
pnpm install
```

### Run in development

```bash
pnpm tauri dev
```

This starts the Vite dev server and compiles the Rust backend, then opens the app window. **The first build takes several minutes** due to Rust compilation. Subsequent runs use incremental builds.

To iterate on the frontend UI without the full Tauri process, you can run just Vite:

```bash
pnpm dev
# then open http://localhost:1420 in a browser
# Note: Tauri IPC calls (invoke/listen) won't work in this mode
```

---

## Running Tests

Always run these before opening a PR:

```bash
# 1. Rust backend tests
cargo test --manifest-path src-tauri/Cargo.toml

# 2. TypeScript type check (must be zero errors)
npx tsc --noEmit

# 3. Frontend unit tests
pnpm exec vitest run
```

---

## Project Structure

The repo root is `turbine-app/`. Key directories:

```
src/
  components/       React components (one .tsx + .css per component)
  hooks/            Custom React hooks
  state/            Zustand stores (workspaceStore, settingsStore…) + layoutEngine
  themes/           Built-in themes (builtinThemes.ts) + themeEngine
  types/            TypeScript interfaces (index.ts is the single source of truth)
  utils/            Pure utility helpers

src-tauri/src/
  commands.rs       Tauri IPC commands (workspace, task, agent, settings CRUD)
  db.rs             SQLite schema init and migration
  file_ops.rs       read_file / write_file / watch_file / list_workspace_files
  pty_manager.rs    PTY spawn / write / resize / kill
  types.rs          Rust structs (mirror of src/types/index.ts)
  lib.rs            App setup: state init, command registration
```

For a deep dive into the architecture, read [`.kiro/specs/turbine/design.md`](.kiro/specs/turbine/design.md).

### Frontend → Backend IPC pattern

Frontend calls use Tauri's `invoke()`:
```ts
const result = await invoke<ReturnType>('command_name', { arg1, arg2 });
```

Backend pushes events with Tauri's `emit()`:
```ts
// Frontend listener
const unlisten = await listen<Payload>('event_name', (event) => { ... });
```

---

## Workflow

1. **Fork** the repo and create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes.** Keep commits focused — one logical change per commit.

3. **Run the full test suite** (see [Running Tests](#running-tests)) — all three checks must pass.

4. **Open a pull request** against `main`. Fill in the PR template.

5. A maintainer will review and merge. Please be responsive to review comments.

---

## Code Style

### TypeScript / React

- Functional components only (no class components, except the existing `ErrorBoundary`)
- Co-locate CSS next to the component file (`ComponentName.tsx` + `ComponentName.css`)
- Use the Zustand stores for shared state; avoid prop-drilling more than two levels
- All shared types go in `src/types/index.ts`
- `camelCase` for TypeScript fields; Rust-to-TS conversion happens in store methods

### Rust

- Run `cargo fmt` before committing
- All public functions should have a doc comment
- Rust types use `snake_case`; they're mapped to TypeScript `camelCase` in the store layer
- Errors should be returned as `Result<T, String>` from Tauri commands (Tauri serializes these)

### CSS

- Vanilla CSS, no utility-first frameworks
- Use CSS custom properties defined in `themeEngine.ts` for all colors
- Class names follow BEM-lite: `block__element--modifier`

---

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add swarm panel pane type
fix: prevent layout ratio from exceeding 1.0 on resize
docs: update contributing guide
chore: bump tauri to 2.x
```

---

## Questions?

Open a [Discussion](../../discussions) or file an [Issue](../../issues). We're happy to help.
