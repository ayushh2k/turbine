# Turbine — Feature Status Audit

Comparison of the 12 original requirements against the current implementation.

## Requirements Status

### Requirement 1: Application Shell and Cross-Platform Support
**Status: ✅ Implemented**

- Tauri v2 app with Rust backend and React 19 frontend
- Builds on macOS, Windows, and Linux
- Main window with TabBar and workspace restoration on startup
- Standard window management (minimize, maximize, restore, close) via Tauri defaults

### Requirement 2: Workspace Management
**Status: ✅ Implemented**

- Create, rename, duplicate, delete workspaces (`workspaceStore.ts`)
- TabBar with color indicators and drag-and-drop reordering
- Workspace switching restores layout and pane contents
- New workspace initializes with a single home pane
- Keyboard shortcuts: Ctrl+Tab/Ctrl+Shift+Tab for next/prev, Ctrl+1-9 for direct access

### Requirement 3: Workspace Persistence
**Status: ✅ Implemented**

- SQLite persistence via `rusqlite` (workspaces, panes, settings, keybindings, themes tables)
- Auto-save on change (2s debounce) plus periodic 30s safety-net save
- Stores workspace name, tab color, pane layout, pane types, working directories, env vars
- Pane label, title, and taskId now persisted (fixed in this release)
- Corrupt/missing DB detection with automatic recreation and user notification

### Requirement 4: Multi-Pane Layout
**Status: ✅ Implemented**

- Binary tree layout engine (`layoutEngine.ts`) with templates for 1–16 panes
- Resize via drag handles between panes
- Drag-and-drop pane rearrangement
- Ctrl+D / Ctrl+Shift+D for horizontal/vertical splits
- Pane close redistributes space to siblings
- Minimum pane size enforcement (80×24)

### Requirement 5: Terminal Emulation
**Status: ✅ Implemented**

- xterm.js with WebGL addon for hardware-accelerated rendering
- `portable-pty` in Rust for native shell processes
- Full VT100/VT220/xterm escape sequence support via xterm.js
- Configurable scrollback (default 10,000 lines)
- Ctrl+F search within terminal panes (SearchAddon)
- Text selection, copy/paste support
- OSC 133 command block parsing and collapsible display

### Requirement 6: Rich Media Rendering in Terminal
**Status: ⚠️ Partially Implemented**

- ✅ Sixel graphics protocol support via `@xterm/addon-image`
- ✅ iTerm Image Protocol (IIP) support
- ⚠️ Kitty graphics protocol: not directly supported (xterm-addon-image supports Sixel + IIP, not Kitty)
- ✅ Image scaling to fit pane width
- ✅ PNG, JPEG, GIF, WebP support
- ⚠️ Video stream URL embedding: `MediaOverlay` component detects URLs but relies on basic `<video>` overlay rather than cell-positioned embedding
- ✅ Unsupported format placeholder (via `MediaViewer` component)

### Requirement 7: Broadcast Input Mode
**Status: ✅ Implemented**

- `useBroadcast` hook replicates keystrokes to all terminal panes in active workspace
- TabBar shows "BROADCAST" indicator when active
- Toggle via Ctrl+Shift+B
- ⚠️ Per-pane target selection UI not implemented — broadcast goes to all terminal panes in the workspace (the `broadcastTargets` Set exists in state but no UI to configure it)

### Requirement 8: Built-in Code Viewer
**Status: ✅ Implemented**

- CodeMirror 6 with syntax highlighting for 20+ languages
- Language detection from file extension (`languageDetect.ts`)
- Line numbers
- Ctrl+F search within files
- Incremental loading for large files (512KB chunks)
- Basic editing (insert, delete, modify)
- Dirty indicator on pane tab
- External file change detection with safe reload (fixed: now checks dirty state before reloading)

### Requirement 9: Agent Auto-Launch
**Status: ✅ Implemented**

- Per-pane startup command configuration via PaneToolbar
- Auto-launch on workspace activation when `autoLaunch` is true
- Sequential launch with configurable delay (default 500ms)
- Error display in affected pane terminal on failure
- Per-pane enable/disable toggle

### Requirement 10: Theming and Appearance
**Status: ✅ Implemented**

- 11 built-in dark themes (Subnautica default)
- Theme applies to all UI: TabBar, pane borders, terminal ANSI colors, code viewer
- Custom theme JSON loading support
- Theme preference persisted to SQLite and restored on startup

### Requirement 11: Keyboard Shortcuts and Navigation
**Status: ✅ Implemented**

- Ctrl+T: new workspace (opens folder picker)
- Ctrl+W: close focused pane
- Ctrl+Shift+P: command palette
- Ctrl+Arrow keys: directional pane navigation
- Customizable keybindings via Settings panel
- Keybindings persisted to SQLite

### Requirement 12: Auto-Updates
**Status: ⚠️ Partially Implemented**

- ✅ `tauri-plugin-updater` integrated
- ✅ `check_for_updates` / `install_update` Rust commands
- ✅ `UpdateNotification` component with update/dismiss/retry UI
- ✅ User can disable auto-update checks in settings
- ✅ Updater signing pubkey is configured in `src-tauri/tauri.conf.json`
- ⚠️ Release builds still require `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub secrets

## Bonus Features (Beyond Original Spec)

These features were added beyond the 12 original requirements:

| Feature | Description |
|---------|-------------|
| **Home Screen** | Welcome screen with quick actions, workspace list, and folder opener |
| **Task Board** | Kanban board (customizable columns) scoped per project, with drag-and-drop task management |
| **Swarm Panel** | Multi-agent orchestration: agent presets, workflow steps, run history, mailbox messages |
| **Diff Viewer** | Git diff viewer for reviewing agent-generated code changes |
| **File Browser** | Side panel with tree view, git status indicators, file icons, and search |
| **Agent Presets** | Configurable CLI templates for Claude Code, Gemini CLI, Codex, and custom agents |
| **Activity Bar** | VS Code-style sidebar with file browser, task board, and swarm panel toggles |
| **Notification Center** | Toast notifications for background process completion |
| **Cross-Pane Search** | Ctrl+Shift+F to search terminal scrollback across all panes |
| **Custom Pane Titles** | Double-click to rename any pane; titles now persisted across restarts |
| **Pane Detach** | Detach a pane into its own new workspace tab |
| **Context Menus** | Right-click menus for workspaces and terminal panes |
| **Starter Presets** | "Code + Console" and "Web Dev" workspace layout presets |
| **Auto-Save** | Periodic workspace persistence to prevent data loss on crash |
