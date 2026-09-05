import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { getPairingSession, setPairingAnswer, addIceCandidate } from '../../lib/store.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const parts = reqUrl.pathname.split('/').filter(Boolean);
  const code = parts[parts.length - 1] || reqUrl.searchParams.get('code') || '';

  if (!code) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Pairing code is required' }));
    return;
  }

  const session = await getPairingSession(code);
  if (!session) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Session not found or expired' }));
    return;
  }

  // GET: Retrieve offer or check answer
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        code: session.code,
        offer: session.offer,
        offerCandidates: session.offerCandidates,
        answer: session.answer,
        answerCandidates: session.answerCandidates,
        expiresAt: session.expiresAt,
      })
    );
    return;
  }

  // POST: Submit answer from mobile
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        if (!data.answer) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'WebRTC SDP answer is required' }));
          return;
        }

        const success = await setPairingAnswer(code, data.answer, data.candidates || []);
        res.statusCode = success ? 200 : 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success }));
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // PATCH: Add an ICE candidate
  if (req.method === 'PATCH') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const role = data.role === 'desktop' ? 'desktop' : 'mobile';
        if (!data.candidate) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Candidate is required' }));
          return;
        }

        const success = await addIceCandidate(code, role, data.candidate);
        res.statusCode = success ? 200 : 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success }));
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  res.statusCode = 405;
  res.end();
}
