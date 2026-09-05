# Turbine Dedicated Backend Relay Server

The dedicated relay server enables the **Turbine Mobile Companion App** to connect seamlessly to Turbine Desktop from anywhere in the world (over cellular 5G/LTE or remote Wi-Fi), bypassing NATs, firewalls, and dynamic IP issues without requiring router port-forwarding.

---

## Quick Start (Local)

```bash
cd relay
npm install
npm run dev
```

The server starts on port `4448`:
- Health check: `http://localhost:4448/health`
- WebSocket endpoint: `ws://localhost:4448/ws`

---

## Deployment Options

### 1. Docker / VPS
```bash
docker compose up -d --build
```

### 2. Railway (1-Click)
1. Push this repo to GitHub.
2. In Railway dashboard, click **New Project** $\rightarrow$ **Deploy from GitHub repo**.
3. Set root directory to `/relay`.
4. Railway will automatically detect the `Dockerfile` and expose the service on a public HTTPS/WSS domain (e.g. `https://turbine-relay-production.up.railway.app`).

### 3. Fly.io
```bash
cd relay
fly launch
fly deploy
```

### 4. Render
1. Create a new **Web Service** on Render.
2. Connect repository, select root directory `relay`.
3. Select Docker or Node runtime (`npm install && npm run build`, start command: `npm start`).

---

## Connecting Turbine Desktop & Mobile App
1. Open Turbine Desktop $\rightarrow$ Click the **Mobile Companion** phone icon in the ActivityBar.
2. If self-hosting, enter your relay server URL (e.g. `wss://your-relay.up.railway.app`).
3. The desktop will register a session and display a QR code and a 6-character pairing code (e.g. `TRB-849`).
4. Scan the QR code with the **Turbine React Native Mobile App** or enter the pairing code.
