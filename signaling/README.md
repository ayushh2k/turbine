# Turbine P2P WebRTC Signaling Server (Vercel Serverless)

A lightweight, serverless signaling service for **Turbine Mobile Companion** WebRTC DataChannel connections.

---

## How it works

1. **Zero Bandwidth**: It only handles the initial 2-second SDP handshake (Offer, Answer, and ICE candidates).
2. **Zero Permanent Storage**: Sessions expire and are pruned after 5 minutes.
3. **100% Free**: Operates entirely within Vercel's free serverless hobby tier forever.
4. **100% Private**: Once the peer-to-peer WebRTC DataChannel is established, all terminal streams, keystrokes, agent outputs, and code diffs flow **directly device-to-device with DTLS end-to-end encryption**.

---

## Deploy to Vercel

```bash
cd signaling
npx vercel
```
Or import this directory into your [Vercel Dashboard](https://vercel.com/new).

Once deployed, copy your deployment URL (e.g. `https://turbine-signaling.vercel.app`) into Turbine Desktop!
