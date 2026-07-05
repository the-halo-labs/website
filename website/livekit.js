/* ===========================================================
   LIVEKIT — connects the demo panel to a live Halo agent.

   Depends on:
     - LivekitClient (global, from CDN)
     - window.__HALO_CONFIG.tokenUrl (URL of the token server)
     - window.__halo.demo hooks (exposed by demo.js)

   Exposes:
     window.__halo.live = {
       connect(industry) : Promise
       disconnect()      : Promise
       isConnected()     : boolean
       getAmplitude()    : number  // 0..1, for waveform
       getState()        : 'idle' | 'connecting' | 'listening' | 'speaking'
     }
   =========================================================== */
(() => {
  const CONFIG = window.__HALO_CONFIG || { tokenUrl: 'http://localhost:3001/api/token' };

  const LK = window.LivekitClient;
  if (!LK) {
    console.warn('[halo/live] LivekitClient not loaded — live demo disabled.');
    return;
  }

  let room = null;
  let localTrack = null;
  let audioCtx = null;
  let remoteAnalyser = null;
  let remoteFreq = null;
  let localAnalyser = null;
  let localFreq = null;
  let remoteAudioEl = null;
  let agentIsSpeaking = false;
  let ampSmoothed = 0;
  let state = 'idle';

  // Track seen transcript segments so we don't add duplicates when a
  // stream sends multiple updates for the same segment.
  const seenSegments = new Set();

  function setState(s){
    state = s;
    window.__halo?.demo?.onLiveStateChange?.(s);
  }

  function ensureAudioCtx(){
    if (!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
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
    if (!room) { ampSmoothed = 0; return; }
    const rAmp = readAmp(remoteAnalyser, remoteFreq);
    const lAmp = readAmp(localAnalyser, localFreq);

    // Track who's speaking to update UI state.
    if (rAmp > 0.05 && !agentIsSpeaking){ agentIsSpeaking = true; setState('speaking'); }
    else if (rAmp < 0.02 && agentIsSpeaking){ agentIsSpeaking = false; setState('listening'); }

    const target = Math.max(rAmp, lAmp * 0.9);
    ampSmoothed += (target - ampSmoothed) * 0.25;

    requestAnimationFrame(tickAmp);
  }

  // ---------- TRANSCRIPTS ----------
  // Primary path: text streams on topic `lk.transcription`, which is the
  // default for modern livekit-agents. We register a handler once the
  // room is connected.
  function wireTranscripts(){
    if (!room.registerTextStreamHandler){
      // very old SDK — skip; fall back to DataReceived below.
      return;
    }
    try {
      room.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
        // Read the full stream, then emit once as a final line.
        const attrs = reader.info?.attributes || {};
        const isFinal = attrs['lk.transcription_final'] === 'true';
        const segId = reader.info?.id || `${participantInfo.identity}-${Date.now()}`;

        let full = '';
        try {
          for await (const chunk of reader) full += chunk;
        } catch (e) {
          full = await reader.readAll?.() ?? '';
        }
        if (!full.trim()) return;

        // Only surface finals — skip interim chunks to keep the transcript clean.
        if (!isFinal) return;
        if (seenSegments.has(segId)) return;
        seenSegments.add(segId);

        const isLocal = participantInfo.identity === room.localParticipant?.identity;
        window.__halo?.demo?.addBubble?.(isLocal ? 'caller' : 'halo', full.trim());
      });
    } catch (e) {
      console.warn('[halo/live] registerTextStreamHandler failed:', e);
    }
  }

  // Fallback path: raw data messages on topic `lk.transcription`
  // Payload: JSON string  { text, final }
  function onDataReceived(payload, participant, _kind, topic){
    if (topic !== 'lk.transcription') return;
    try {
      const txt = new TextDecoder().decode(payload);
      const obj = JSON.parse(txt);
      if (!obj.text || obj.final === false) return;
      const isLocal = participant?.identity === room.localParticipant?.identity;
      window.__halo?.demo?.addBubble?.(isLocal ? 'caller' : 'halo', obj.text);
    } catch (_) { /* not our payload */ }
  }

  // ---------- CONNECT / DISCONNECT ----------
  async function fetchToken(industry){
    const url = new URL(CONFIG.tokenUrl, window.location.origin);
    url.searchParams.set('industry', industry);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`token server ${res.status}`);
    return res.json();
  }

  async function connect(industry = 'dental'){
    if (room) await disconnect();
    seenSegments.clear();
    ampSmoothed = 0;
    setState('connecting');

    let tokenData;
    try {
      tokenData = await fetchToken(industry);
    } catch (e) {
      setState('idle');
      throw new Error('Could not reach token server. Is it running?');
    }

    room = new LK.Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { dtx: true, red: true },
    });

    room.on(LK.RoomEvent.TrackSubscribed, (track, _pub, _participant) => {
      if (track.kind === LK.Track.Kind.Audio){
        remoteAudioEl = track.attach();
        remoteAudioEl.style.display = 'none';
        remoteAudioEl.setAttribute('playsinline', '');
        document.body.appendChild(remoteAudioEl);
        // Prefer the underlying MediaStream if exposed, otherwise build one.
        const stream = track.mediaStream || new MediaStream([track.mediaStreamTrack]);
        const a = attachAnalyser(stream);
        remoteAnalyser = a.analyser; remoteFreq = a.buf;
      }
    });

    room.on(LK.RoomEvent.TrackUnsubscribed, (track) => {
      if (track === remoteAudioEl) return;
      track.detach?.().forEach?.(el => el.remove());
    });

    room.on(LK.RoomEvent.DataReceived, onDataReceived);

    room.on(LK.RoomEvent.Disconnected, () => {
      cleanup();
      setState('idle');
      window.__halo?.demo?.onLiveEnd?.();
    });

    room.on(LK.RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!room.canPlaybackAudio){
        // Chrome/Safari may block autoplay — resume needs a user gesture,
        // which the click we're inside of should satisfy.
        room.startAudio().catch(() => {});
      }
    });

    try {
      await room.connect(tokenData.url, tokenData.token);
    } catch (e) {
      cleanup();
      setState('idle');
      throw new Error('Failed to connect to LiveKit room.');
    }

    wireTranscripts();

    // Publish mic.
    try {
      localTrack = await LK.createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      await room.localParticipant.publishTrack(localTrack);
      // Analyser on local mic too, so the wave reacts while the caller speaks.
      const localStream = new MediaStream([localTrack.mediaStreamTrack]);
      const a = attachAnalyser(localStream);
      localAnalyser = a.analyser; localFreq = a.buf;
    } catch (e) {
      await disconnect();
      throw new Error('Microphone access denied.');
    }

    setState('listening');
    tickAmp();

    return { room: tokenData.room, identity: tokenData.identity, industry: tokenData.industry };
  }

  async function disconnect(){
    if (localTrack){
      try { localTrack.stop(); } catch(_){}
      localTrack = null;
    }
    if (room){
      try { await room.disconnect(); } catch(_){}
      room = null;
    }
    cleanup();
    setState('idle');
  }

  function cleanup(){
    if (remoteAudioEl){ remoteAudioEl.remove(); remoteAudioEl = null; }
    remoteAnalyser = null; remoteFreq = null;
    localAnalyser = null; localFreq = null;
    agentIsSpeaking = false;
    ampSmoothed = 0;
  }

  window.__halo = window.__halo || {};
  window.__halo.live = {
    connect,
    disconnect,
    isConnected: () => room !== null && room.state === 'connected',
    getAmplitude: () => ampSmoothed,
    getState: () => state,
  };
})();
