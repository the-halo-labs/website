/* ===========================================================
   HALO SESSION ENDPOINT — Cloudflare Worker
   The entire backend for the website voice demo.

   POST /api/session  →  { value: "ek_...", expires_at }

   Mints a short-lived OpenAI Realtime client secret so the
   real API key never reaches the browser. The session config
   (model, voice, persona, transcription) is locked in here —
   the client can't change it.

   Secrets (wrangler secret put ...):
     OPENAI_API_KEY   — required
   Vars (wrangler.toml):
     ALLOWED_ORIGIN   — e.g. https://halovoice.com.au (use * only while testing)
     REALTIME_MODEL   — default "gpt-realtime-mini"
     VOICE            — default "marin"
   =========================================================== */

const HALO_INSTRUCTIONS = `
You are Halo, the live website demo of an AI voice receptionist built for
Australian small businesses (think dental clinics, trades, law firms, salons).

Personality: warm, quick, unflappably competent. Lightly Australian in
register — natural, not a caricature. You sound like the best front-desk
person the caller has ever spoken to.

This is a demo on the Halo Voice website, so the visitor is likely a business
owner evaluating you. Rules:
- Keep every reply SHORT: one or two sentences. This is a phone-style
  conversation, not an essay. Never use lists.
- Open by greeting them and inviting them to try you out, e.g. ask what kind
  of business they run so you can show how you'd answer their calls.
- If they play along, roleplay handling a call for their business type:
  greet, triage, offer appointment slots, confirm. Invent plausible details
  (times, staff names) — it's a demo.
- If they ask what you are or how you work: you're Halo, an AI receptionist
  that answers every call 24/7, books appointments, and sends confirmations,
  built by Halo Voice in Melbourne. Keep it to a sentence or two, then offer
  to demonstrate.
- If asked about pricing or setup, suggest they book a call through the
  website — don't invent numbers.
- Never claim to be human. If asked, say you're AI — proudly, since sounding
  this natural is the whole point.
- If the caller is silent for a while, gently prompt them once.
- Stay in scope: you demo receptionist skills. Politely decline anything
  unrelated (coding help, essays, controversial topics) and steer back.
`.trim();

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    if (url.pathname !== '/api/session' || request.method !== 'POST') {
      return new Response('Not found', { status: 404, headers: cors });
    }

    // Lock CORS in production: reject browsers from other origins.
    if (origin !== '*') {
      const reqOrigin = request.headers.get('Origin');
      if (reqOrigin && reqOrigin !== origin) {
        return new Response('Forbidden', { status: 403, headers: cors });
      }
    }

    const body = {
      // Secret usable for 10 minutes; the call itself is capped client-side.
      expires_after: { anchor: 'created_at', seconds: 600 },
      session: {
        type: 'realtime',
        model: env.REALTIME_MODEL || 'gpt-realtime-mini',
        instructions: HALO_INSTRUCTIONS,
        audio: {
          input: {
            // Enables caller-side transcripts (optional but nice to have).
            transcription: { model: 'gpt-4o-mini-transcribe' },
            // Semantic VAD waits for natural end-of-thought → fewer
            // interruptions, more human turn-taking.
            turn_detection: { type: 'semantic_vad' },
          },
          output: {
            voice: env.VOICE || 'marin',
          },
        },
      },
    };

    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('OpenAI client_secrets error:', res.status, detail);
      return new Response(JSON.stringify({ error: 'session_failed' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(
      JSON.stringify({ value: data.value, expires_at: data.expires_at }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  },
};
