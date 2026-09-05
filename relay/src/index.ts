import http from 'node:http';
import { URL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { SessionStore } from './sessionStore.js';
import type { RegisterSessionRequest } from './types.js';

const PORT = parseInt(process.env.PORT || '4448', 10);
const HOST = process.env.HOST || '0.0.0.0';

export const sessionStore = new SessionStore();

// Periodically prune dead sessions every hour
setInterval(() => {
  sessionStore.pruneExpired();
}, 60 * 60 * 1000);

export function createRelayServer() {
  const server = http.createServer(async (req, res) => {
    // CORS headers for API requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Health check endpoint with Fly.io region info
    if (req.method === 'GET' && reqUrl.pathname === '/health') {
      const region = process.env.FLY_REGION || (req.headers['fly-region'] as string) || 'local';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'turbine-relay',
          region,
          uptime: process.uptime(),
        })
      );
      return;
    }

    // Register desktop session
    if (req.method === 'POST' && reqUrl.pathname === '/api/sessions/register') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed: RegisterSessionRequest = JSON.parse(body || '{}');
          if (!parsed.sessionId || !parsed.token) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'sessionId and token are required' }));
            return;
          }

          const result = sessionStore.registerSession(parsed.sessionId, parsed.token, parsed.machineName);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    // Check session info
    if (req.method === 'GET' && reqUrl.pathname.startsWith('/api/sessions/')) {
      const identifier = reqUrl.pathname.replace('/api/sessions/', '').trim();
      const info = sessionStore.getSessionInfo(identifier);
      if (!info) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(info));
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (reqUrl.pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const role = reqUrl.searchParams.get('role');
    const sessionId = reqUrl.searchParams.get('session');
    const token = reqUrl.searchParams.get('token');
    const name = reqUrl.searchParams.get('name') || undefined;

    if (!role || !sessionId || !token) {
      ws.send(
        JSON.stringify({
          type: 'relay:error',
          payload: { code: 'AUTH_FAILED', message: 'role, session, and token are required' },
        })
      );
      ws.close(1008, 'Missing required credentials');
      return;
    }

    let attached = false;
    if (role === 'desktop') {
      attached = sessionStore.attachDesktop(sessionId, token, ws, name);
    } else if (role === 'mobile') {
      attached = sessionStore.attachMobile(sessionId, token, ws, name);
    }

    if (!attached) {
      ws.send(
        JSON.stringify({
          type: 'relay:error',
          payload: { code: 'SESSION_NOT_FOUND', message: 'Invalid session or token' },
        })
      );
      ws.close(1008, 'Authentication failed');
      return;
    }

    const region = process.env.FLY_REGION || (req.headers['fly-region'] as string) || 'local';

    // Acknowledge connection
    ws.send(
      JSON.stringify({
        type: 'relay:connected',
        payload: { role, session: sessionId, region, timestamp: Date.now() },
      })
    );

    // Keepalive ping/pong
    let isAlive = true;
    ws.on('pong', () => {
      isAlive = true;
    });

    const pingInterval = setInterval(() => {
      if (!isAlive) {
        clearInterval(pingInterval);
        ws.terminate();
        return;
      }
      isAlive = false;
      ws.ping();
    }, 30000);

    ws.on('message', (data: string | Buffer) => {
      const raw = data.toString();
      try {
        const parsed = JSON.parse(raw);
        if (parsed.type === 'ping') {
          ws.send(
            JSON.stringify({
              type: 'pong',
              payload: {
                clientTime: parsed.payload?.clientTime || parsed.timestamp,
                serverTime: Date.now(),
                region,
              },
            })
          );
          return;
        }
      } catch {}
      sessionStore.routeMessage(ws, raw);
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      sessionStore.handleDisconnect(ws);
    });

    ws.on('error', () => {
      clearInterval(pingInterval);
      sessionStore.handleDisconnect(ws);
    });
  });

  return { server, wss };
}

// Start standalone if executed directly
if (process.env.NODE_ENV !== 'test') {
  const { server } = createRelayServer();
  server.listen(PORT, HOST, () => {
    console.log(`[Turbine Relay] Server listening on ${HOST}:${PORT}`);
    console.log(`[Turbine Relay] WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
  });
}
