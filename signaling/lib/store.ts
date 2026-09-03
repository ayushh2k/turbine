export interface SignalingSession {
  code: string;
  token: string;
  offer: unknown;
  offerCandidates: unknown[];
  answer: unknown | null;
  answerCandidates: unknown[];
  createdAt: number;
  expiresAt: number;
}

// In-memory fallback / L1 cache
const localSessions = new Map<string, SignalingSession>();

function generatePairingCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'TRB-';
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function cleanTopic(code: string): string {
  return `turbine-p2p-${code.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`;
}

export async function createPairingSession(
  offer: unknown,
  offerCandidates: unknown[] = [],
  token?: string,
  ttlMs: number = 5 * 60 * 1000
): Promise<SignalingSession> {
  const code = generatePairingCode();
  const now = Date.now();
  const session: SignalingSession = {
    code,
    token: token || Math.random().toString(36).substring(2, 15),
    offer,
    offerCandidates,
    answer: null,
    answerCandidates: [],
    createdAt: now,
    expiresAt: now + ttlMs,
  };

  localSessions.set(code, session);

  // Publish session offer to global ephemeral relay
  try {
    const topic = cleanTopic(code);
    await fetch(`https://ntfy.sh/${topic}-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
  } catch (e) {
    console.error('[Signaling] Failed to publish offer to relay:', e);
  }

  return session;
}

export async function getPairingSession(code: string): Promise<SignalingSession | undefined> {
  const cleanCode = code.toUpperCase().trim();
  const cached = localSessions.get(cleanCode);

  // Also check if an answer has been posted to the global relay
  try {
    const topic = cleanTopic(cleanCode);
    const ansResp = await fetch(`https://ntfy.sh/${topic}-answer/json?poll=1`, {
      headers: { Accept: 'application/json' },
    });
    if (ansResp.ok) {
      const text = await ansResp.text();
      const lines = text.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const data = typeof parsed.message === 'string' ? JSON.parse(parsed.message) : parsed.message;
          if (data && data.answer) {
            if (cached) {
              cached.answer = data.answer;
              if (Array.isArray(data.candidates)) {
                cached.answerCandidates.push(...data.candidates);
              }
              return cached;
            } else {
              // Session not cached locally, fetch base offer first
              const sess = await fetchSessionFromRelay(cleanCode);
              if (sess) {
                sess.answer = data.answer;
                if (Array.isArray(data.candidates)) {
                  sess.answerCandidates.push(...data.candidates);
                }
                localSessions.set(cleanCode, sess);
                return sess;
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  if (cached) {
    return cached;
  }

  // Not in local cache, fetch from global relay
  return await fetchSessionFromRelay(cleanCode);
}

async function fetchSessionFromRelay(cleanCode: string): Promise<SignalingSession | undefined> {
  try {
    const topic = cleanTopic(cleanCode);
    const resp = await fetch(`https://ntfy.sh/${topic}-offer/json?poll=1`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return undefined;

    const text = await resp.text();
    const lines = text.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const data = typeof parsed.message === 'string' ? JSON.parse(parsed.message) : parsed.message;
        if (data && data.code && data.offer) {
          localSessions.set(cleanCode, data);
          return data;
        }
      } catch {}
    }
  } catch {}

  return undefined;
}

export async function setPairingAnswer(
  code: string,
  answer: unknown,
  answerCandidates: unknown[] = []
): Promise<boolean> {
  const cleanCode = code.toUpperCase().trim();
  const session = await getPairingSession(cleanCode);
  if (!session) return false;

  session.answer = answer;
  if (answerCandidates.length > 0) {
    session.answerCandidates.push(...answerCandidates);
  }

  // Publish answer to global ephemeral relay
  try {
    const topic = cleanTopic(cleanCode);
    await fetch(`https://ntfy.sh/${topic}-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer, candidates: answerCandidates }),
    });
    return true;
  } catch (e) {
    console.error('[Signaling] Failed to publish answer to relay:', e);
    return false;
  }
}

export async function addIceCandidate(
  code: string,
  role: 'desktop' | 'mobile',
  candidate: unknown
): Promise<boolean> {
  const cleanCode = code.toUpperCase().trim();
  const session = await getPairingSession(cleanCode);
  if (!session) return false;

  if (role === 'desktop') {
    session.offerCandidates.push(candidate);
  } else {
    session.answerCandidates.push(candidate);
  }
  return true;
}
