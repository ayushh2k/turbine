import { describe, it, expect } from 'vitest';
import {
  createPairingSession,
  getPairingSession,
  setPairingAnswer,
  addIceCandidate,
} from './store.js';

describe('SignalingStore', () => {
  it('creates a session with a 6-character code and stores SDP offer', async () => {
    const mockOffer = { type: 'offer', sdp: 'v=0...' };
    const session = await createPairingSession(mockOffer, [{ candidate: 'cand1' }]);

    expect(session.code).toMatch(/^TRB-[2-9A-HJ-NP-Z]{3}$/);
    expect(session.offer).toEqual(mockOffer);
    expect(session.offerCandidates).toHaveLength(1);

    const retrieved = await getPairingSession(session.code);
    expect(retrieved).toBeDefined();
    expect(retrieved?.code).toBe(session.code);
  });

  it('sets pairing answer and adds ICE candidates', async () => {
    const session = await createPairingSession({ type: 'offer' });
    const mockAnswer = { type: 'answer', sdp: 'v=0...' };

    const success = await setPairingAnswer(session.code, mockAnswer, [{ candidate: 'candA' }]);
    expect(success).toBe(true);

    const updated = await getPairingSession(session.code);
    expect(updated?.answer).toEqual(mockAnswer);
    expect(updated?.answerCandidates).toHaveLength(1);

    await addIceCandidate(session.code, 'desktop', { candidate: 'cand2' });
    expect(updated?.offerCandidates).toHaveLength(1);
  });

  it('returns undefined for non-existent session', async () => {
    expect(await getPairingSession('TRB-NON')).toBeUndefined();
    expect(await setPairingAnswer('TRB-NON', {})).toBe(false);
  });
});
