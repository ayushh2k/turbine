import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.css";
import App from "./App";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// Dev-only hooks for the Rust debug bridge (src-tauri/src/debug_bridge.rs):
// eval'd scripts have no module scope, so expose the IPC helpers on window.
if (import.meta.env.DEV) {
  const appWindow = getCurrentWebviewWindow();
  const w = window as Window & {
    __dbgInvoke?: typeof invoke;
    __dbgListen?: typeof listen;
    __dbgWinListen?: typeof appWindow.listen;
  };
  w.__dbgInvoke = invoke;
  w.__dbgListen = listen;
  w.__dbgWinListen = appWindow.listen.bind(appWindow);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
