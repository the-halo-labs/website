/* ===========================================================
   REALTIME — connects the hero orb (or any caller) to a live
   Halo agent via the OpenAI Realtime API over WebRTC.

   Architecture:
     browser ──POST──▶ your token endpoint (Cloudflare Worker)
             ◀─ ephemeral client secret (ek_...)
     browser ──WebRTC SDP──▶ api.openai.com/v1/realtime/calls
             ◀── bidirectional audio + data channel events

   No media server. No agent worker. Sub-second speech-to-speech.

   Depends on:
     - window.__HALO_CONFIG.sessionUrl   (URL of the token endpoint)
     - window.__HALO_CONFIG.maxDemoSeconds (optional, default 180)

   Exposes (same interface livekit.js exposed):
     window.__halo.live = {
       connect(context)  : Promise
       disconnect()      : Promise
       isConnected()     : boolean
       getAmplitude()    : number  // 0..1, remote+local mix, for orb/wave
       getState()        : 'idle' | 'connecting' | 'listening' | 'speaking'
     }
   Optional hooks it will call if present:
     window.__halo.demo.addBubble(who, text)     — transcripts
     window.__halo.demo.onLiveStateChange(state)
     window.__halo.demo.onLiveEnd()
     window.__halo.orb.onLiveState(state)        — hero orb status
   =========================================================== */
(() => {
  const CONFIG = window.__HALO_CONFIG || {};
  const SESSION_URL = CONFIG.sessionUrl || 'http://localhost:8787/api/session';
  const MAX_SECONDS = CONFIG.maxDemoSeconds || 180; // cost guard: auto-hangup

  let pc = null;              // RTCPeerConnection
  let dc = null;              // data channel for events
  let micStream = null;
  let remoteAudioEl = null;

  let audioCtx = null;
  let remoteAnalyser = null, remoteFreq = null;
  let localAnalyser = null, localFreq = null;

  let state = 'idle';
  let currentContext = 'hero'; // hero calls don't render transcript bubbles
  let ampSmoothed = 0;
  let agentIsSpeaking = false;
  let hangupTimer = null;
  let rafId = null;

  // ---------- state plumbing ----------
  function setState(s){
    state = s;
    // Hero calls drive only the orb; the demo panel below is scripted-only.
    if (currentContext !== 'hero') window.__halo?.demo?.onLiveStateChange?.(s);
    window.__halo?.orb?.onLiveState?.(s);
  }

  // ---------- audio analysis (drives the orb) ----------
  function ensureAudioCtx(){
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function attachAnalyser(mediaStream){
    const ctx = ensureAudioCtx();
    const src = ctx.createMediaStreamSource(mediaStream);
    const a = ctx.createAnalyser();
    a.fftSize = 512;
    a.smoothingTimeConstant = 0.75;
    src.connect(a);
    return { analyser: a, buf: new Uint8Array(a.frequencyBinCount) };
  }

  function readAmp(analyser, buf){
    if (!analyser) return 0;
    analyser.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 2; i < 60; i++) sum += buf[i];
    return Math.min(1, (sum / (58 * 255)) * 1.9);
  }

  function tickAmp(){
    if (!pc){ ampSmoothed = 0; return; }
    const rAmp = readAmp(remoteAnalyser, remoteFreq);
    const lAmp = readAmp(localAnalyser, localFreq);

    // Amplitude-based fallback for speaking state (data channel events
    // below are the primary source; this catches anything they miss).
    if (rAmp > 0.05 && !agentIsSpeaking){ agentIsSpeaking = true; setState('speaking'); }
    else if (rAmp < 0.02 && agentIsSpeaking){ agentIsSpeaking = false; setState('listening'); }

    const target = Math.max(rAmp, lAmp * 0.9);
    ampSmoothed += (target - ampSmoothed) * 0.25;
    rafId = requestAnimationFrame(tickAmp);
  }

  // ---------- server events (transcripts + turn state) ----------
  function onServerEvent(ev){
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    switch (msg.type){
      // Caller's words (needs input transcription enabled server-side).
      case 'conversation.item.input_audio_transcription.completed':
        if (msg.transcript?.trim() && currentContext !== 'hero'){
          window.__halo?.demo?.addBubble?.('caller', msg.transcript.trim());
        }
        break;

      // Halo's words — GA and beta event names both handled.
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        if (msg.transcript?.trim() && currentContext !== 'hero'){
          window.__halo?.demo?.addBubble?.('halo', msg.transcript.trim());
        }
        break;

      // Turn-taking → drive orb state precisely.
      case 'input_audio_buffer.speech_started':
        if (!agentIsSpeaking) setState('listening');
        break;
      case 'output_audio_buffer.started':        // WebRTC: agent audio began
        agentIsSpeaking = true;
        setState('speaking');
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':        // interruption
        agentIsSpeaking = false;
        setState('listening');
        break;
      case 'response.created':
        // Agent has started formulating a reply but audio hasn't begun.
        if (!agentIsSpeaking) setState('thinking');
        break;

      case 'error':
        console.warn('[halo/realtime] server error:', msg.error);
        break;
    }
  }

  // ---------- connect / disconnect ----------
  async function fetchClientSecret(context){
    const res = await fetch(SESSION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    });
    if (!res.ok) throw new Error(`session endpoint ${res.status}`);
    const data = await res.json();
    if (!data.value) throw new Error('no client secret in response');
    return data.value; // ek_...
  }

  async function connect(context = 'hero'){
    if (pc) await disconnect();
    currentContext = context;
    ampSmoothed = 0;
    setState('connecting');

    let secret;
    try {
      secret = await fetchClientSecret(context);
    } catch (e){
      setState('idle');
      throw new Error('Could not reach the session endpoint. Is the Worker deployed and sessionUrl set?');
    }

    // 1. Mic
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e){
      setState('idle');
      throw new Error('Microphone access denied.');
    }

    // 2. Peer connection
    pc = new RTCPeerConnection();

    // Remote (agent) audio out.
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      if (!remoteAudioEl){
        remoteAudioEl = document.createElement('audio');
        remoteAudioEl.autoplay = true;
        remoteAudioEl.setAttribute('playsinline', '');
        remoteAudioEl.style.display = 'none';
        document.body.appendChild(remoteAudioEl);
      }
      remoteAudioEl.srcObject = stream;
      remoteAudioEl.play().catch(() => {}); // click gesture should satisfy autoplay
      const a = attachAnalyser(stream);
      remoteAnalyser = a.analyser; remoteFreq = a.buf;
    };

    // Local mic in (+ analyser so the orb reacts to the caller too).
    micStream.getTracks().forEach(tr => pc.addTrack(tr, micStream));
    const la = attachAnalyser(micStream);
    localAnalyser = la.analyser; localFreq = la.buf;

    // Events channel.
    dc = pc.createDataChannel('oai-events');
    dc.onmessage = onServerEvent;

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected'){
        disconnect();
      }
    };

    // 3. SDP exchange with OpenAI, authorized by the ephemeral secret.
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    let answerSdp;
    try {
      const res = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!res.ok) throw new Error(`realtime SDP ${res.status}`);
      answerSdp = await res.text();
    } catch (e){
      await disconnect();
      throw new Error('Failed to establish the realtime call.');
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    setState('listening');
    tickAmp();

    // Cost guard: end the demo automatically.
    clearTimeout(hangupTimer);
    hangupTimer = setTimeout(() => disconnect(), MAX_SECONDS * 1000);

    return { context };
  }

  async function disconnect(){
    clearTimeout(hangupTimer); hangupTimer = null;
    if (rafId){ cancelAnimationFrame(rafId); rafId = null; }
    if (micStream){
      try { micStream.getTracks().forEach(tr => tr.stop()); } catch(_){}
      micStream = null;
    }
    if (dc){ try { dc.close(); } catch(_){} dc = null; }
    if (pc){ try { pc.close(); } catch(_){} pc = null; }
    if (remoteAudioEl){ remoteAudioEl.srcObject = null; remoteAudioEl.remove(); remoteAudioEl = null; }
    remoteAnalyser = null; remoteFreq = null;
    localAnalyser = null; localFreq = null;
    agentIsSpeaking = false;
    ampSmoothed = 0;
    setState('idle');
    if (currentContext !== 'hero') window.__halo?.demo?.onLiveEnd?.();
  }

  window.__halo = window.__halo || {};
  window.__halo.live = {
    connect,
    disconnect,
    isConnected: () => !!pc && pc.connectionState === 'connected',
    getAmplitude: () => ampSmoothed,
    getState: () => state,
  };
})();
