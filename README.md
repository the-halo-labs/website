# Halo Voice — Live Demo Setup

Architecture:

```
Browser (hero orb) ──POST──▶ Cloudflare Worker  /api/session   ← the ENTIRE backend
        │                        └── mints ephemeral key via OpenAI
        └────── WebRTC audio ──▶ api.openai.com/v1/realtime/calls (speech-to-speech)
```

No media server, no agent worker, no LiveKit. Fixed cost: $0.
Variable cost: only the minutes visitors actually talk to the orb.

## 1. Deploy the backend (5 minutes)

```bash
cd backend
npm install -g wrangler          # if you don't have it
npx wrangler login
npx wrangler secret put OPENAI_API_KEY   # paste your OpenAI key
npx wrangler deploy
```

Copy the deployed URL (e.g. `https://halo-session.teja.workers.dev`).

## 2. Point the frontend at it

In `website/index.html`, set:

```js
window.__HALO_CONFIG = {
  sessionUrl: "https://halo-session.YOUR-SUBDOMAIN.workers.dev/api/session",
  maxDemoSeconds: 180
};
```

## 3. Test locally

```bash
cd website
python3 -m http.server 8000
# open http://localhost:8000 → click "Hear it live" on the orb
```

Mic permission → orb goes CONNECTING → LISTENING → talk to Halo.

## 4. Before launch

- In `backend/wrangler.toml`, set `ALLOWED_ORIGIN` to your real domain
  (stops other sites from minting sessions on your key) and redeploy.
- Set a hard monthly spend limit in the OpenAI dashboard (Billing → Limits).
  With `maxDemoSeconds: 180` each visitor call costs roughly
  US$0.20–0.45 on gpt-realtime-mini.
- Model/voice knobs live in `wrangler.toml` (`REALTIME_MODEL`, `VOICE`) and
  the persona prompt lives at the top of `backend/worker.js`.
- The site itself is static — host on Cloudflare Pages / Vercel / Netlify
  free tier. HTTPS is required for mic access (localhost is exempt).

## What changed in the frontend

- `realtime.js` (new) — WebRTC client for the OpenAI Realtime API. Exposes
  the same `window.__halo.live` interface `livekit.js` had.
- `orb.js` — "Hear it live" now connects to the real agent; falls back to
  the original simulation if the backend is unreachable.
- `index.html` — LiveKit CDN + `livekit.js` removed from load; config
  updated; industry panel "Talk live" button hidden (scripted demos only).
- `livekit.js` — kept in the repo, not loaded. Reuse it later for the
  production product (SIP/phone agents), where LiveKit is the right tool.

## Rate limiting (optional hardening)

If the demo gets hammered, add Cloudflare's free WAF rate-limiting rule on
`/api/session` (e.g. 5 requests/min per IP) in the dashboard — no code needed.
