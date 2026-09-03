# Turbine Mobile Companion (React Native)

Native mobile companion app for **Turbine** built with React Native and Expo. It allows developers to monitor and control their desktop terminal workspace, AI swarms, kanban tasks, and git diffs remotely from their iPhone or Android phone.

---

## Features

- **Desktop Layout Mirroring**: View your multi-pane terminal workspace on mobile with the exact spatial layout and proportions as your desktop monitor.
- **Focus-to-Type Mode**: Tap any terminal pane to focus and maximize it for comfortable typing, with a mobile virtual keyboard (`Esc`, `Tab`, `Ctrl+C`, `↑`, `↓`, `y`, `n`) and prompt input bar. Tapping "← Tiled Layout" unfocuses and returns to the desktop overview.
- **AI Swarm Orchestration**: Monitor autonomous agent runs (Builder, Reviewer, etc.) and launch new swarms remotely.
- **Kanban Task Board**: Manage project tasks, update statuses, and trigger 1-tap "Run with Agent".
- **Live Git Diffs**: Review code modifications made by AI agents on the go.
- **Global Remote Access**: Connect via the dedicated cloud relay server or direct local socket.

---

## Running with Expo

### Prerequisites
- Node.js 20+
- [Expo Go](https://expo.dev/go) app installed on your iPhone or Android phone (from App Store or Google Play).

### Start Dev Server
```bash
cd mobile
npm install
npm start
```

1. Scan the Metro QR code shown in the terminal with the **Expo Go** app on your phone.
2. When the Turbine Companion app opens on your phone, enter the 6-character pairing code displayed in Turbine Desktop (or scan the pairing QR code).
