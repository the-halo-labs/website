/* ===========================================================
   HERO — FUTURISTIC ORB with live voice reactivity
   - Idle: slowly rotating gradient orb, soft filaments, atmosphere
   - Active (listening): orb pulses to mic input, filaments react to
     voice amplitude, color saturates. Click "Hear it live" to toggle.
   =========================================================== */
(() => {
  const canvas = document.getElementById('orb');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, DPR;
  const MAX_DPR = 1.75;

  // ------- state -------
  const state = {
    mode: 'idle',         // 'idle' | 'listening' | 'thinking' | 'speaking'
    amp: 0,               // smoothed 0..1 mic energy (or synthetic when speaking)
    rawAmp: 0,            // instant energy
    activation: 0,        // 0..1 how "woken" the orb is
    status: 'standby',    // label text
    startedAt: 0
  };

  // equator band particles (subtle surface detail, no planet rings)
  const SURF_N = 360;
  const surf = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i=0;i<SURF_N;i++){
    const y = 1 - (i / (SURF_N-1)) * 2;
    const r = Math.sqrt(1 - y*y);
    const t = phi * i;
    surf.push({ x: Math.cos(t)*r, y, z: Math.sin(t)*r, seed: Math.random() });
  }

  // radial filaments
  const FIL_N = 32;
  const fils = [];
  for (let i=0;i<FIL_N;i++){
    fils.push({
      a: (i / FIL_N) * Math.PI*2 + Math.random()*0.12,
      len: 0.25 + Math.random()*0.5,
      phase: Math.random()*Math.PI*2,
      freq: 0.6 + Math.random()*1.2,
      thick: 0.5 + Math.random()*0.8
    });
  }

  // ambient sparks drifting around orb
  const SPARK_N = 22;
  const sparks = [];
  for (let i=0;i<SPARK_N;i++){
    sparks.push({
      a: Math.random()*Math.PI*2,
      r: 1.25 + Math.random()*0.6,
      speed: (Math.random()-0.5) * 0.0012,
      size: 0.5 + Math.random()*1.2,
      phase: Math.random()*Math.PI*2
    });
  }

  // pointer parallax
  let mx=0, my=0, tmx=0, tmy=0;
  window.addEventListener('mousemove', e=>{
    tmx = (e.clientX / window.innerWidth - .5) * 2;
    tmy = (e.clientY / window.innerHeight - .5) * 2;
  });

  function size(){
    DPR = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  size();
  window.addEventListener('resize', size);

  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4ade80';
  function hexRgb(h){
    const m = h.replace('#','');
    const n = m.length === 3 ? m.split('').map(c=>c+c).join('') : m;
    return { r: parseInt(n.slice(0,2),16), g: parseInt(n.slice(2,4),16), b: parseInt(n.slice(4,6),16) };
  }

  let t0 = performance.now();
  let scrollY = 0;
  window.addEventListener('scroll', ()=>{ scrollY = window.scrollY; }, {passive:true});

  // =========================================================
  // AUDIO — real mic when permitted, synthetic when speaking
  // =========================================================
  let audioCtx=null, analyser=null, micSrc=null, micStream=null, freq=null;
  let speakSynthT0 = 0;

  async function startMic(){
    try{
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      if (!micStream){
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true } });
      }
      if (!analyser){
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.75;
        freq = new Uint8Array(analyser.frequencyBinCount);
      }
      if (!micSrc){
        micSrc = audioCtx.createMediaStreamSource(micStream);
        micSrc.connect(analyser);
      }
      return true;
    } catch(e){
      return false;
    }
  }
  function stopMic(){
    if (micStream){
      micStream.getTracks().forEach(tr => tr.stop());
      micStream = null; micSrc = null;
    }
  }

  function currentAmp(){
    // listening → mic, speaking → synthetic wave, else 0
    if (state.mode === 'listening' && analyser){
      analyser.getByteFrequencyData(freq);
      let sum = 0;
      // voice band ~ bins 2..60
      for (let i=2;i<60;i++) sum += freq[i];
      const v = sum / (58 * 255);
      return Math.min(1, v * 1.9);
    }
    if (state.mode === 'speaking'){
      const dt = (performance.now() - speakSynthT0) / 1000;
      // layered sines to fake voice envelope
      const env = (Math.sin(dt*6.1)*0.5+0.5) * (Math.sin(dt*1.7)*0.5+0.5);
      const fine = (Math.sin(dt*14.3)*0.25+0.25);
      return Math.min(1, (env + fine) * 0.85);
    }
    return 0;
  }

  // =========================================================
  // RENDER
  // =========================================================
  function render(now){
    const t = (now - t0) / 1000;
    mx += (tmx - mx) * 0.04;
    my += (tmy - my) * 0.04;

    const animMult = parseFloat(getComputedStyle(document.body).getPropertyValue('--anim-mult')) || 1;

    const heroH = window.innerHeight;
    const fade = Math.max(0, 1 - scrollY / (heroH * 0.85));

    ctx.clearRect(0,0,W,H);
    if (fade <= 0.01){ requestAnimationFrame(render); return; }

    // update amp + activation smoothing
    const tgt = currentAmp();
    state.rawAmp = tgt;
    state.amp += (tgt - state.amp) * 0.22;

    const active = state.mode !== 'idle';
    state.activation += ((active ? 1 : 0) - state.activation) * 0.08;

    const cx = W/2;
    const cy = H/2 + Math.min(H*0.03, 28);
    const baseR = Math.min(W, H) * 0.3;

    const acc = accent();
    const aRgb = hexRgb(acc);

    const rotY = t * 0.18 * animMult + mx * 0.2;
    const rotX = Math.sin(t * 0.11 * animMult) * 0.1 + my * 0.1;
    const cY = Math.cos(rotY), sY = Math.sin(rotY);
    const cX = Math.cos(rotX), sX = Math.sin(rotX);

    // pulse scale from breathing + amp
    const breath = 1 + Math.sin(t * 1.0 * animMult) * 0.02;
    const ampPush = state.amp * 0.10 * state.activation;
    const R = baseR * (breath + ampPush);

    // -------- OUTER BLOOM (swells with activation + amp) --------
    const bloomR = baseR * (1.8 + state.activation * 0.5 + state.amp * 0.4);
    const bloomA = (0.10 + state.activation * 0.18 + state.amp * 0.25) * fade;
    const bloom = ctx.createRadialGradient(cx, cy, baseR*0.3, cx, cy, bloomR);
    bloom.addColorStop(0,  `rgba(${aRgb.r},${aRgb.g},${aRgb.b},${bloomA})`);
    bloom.addColorStop(0.5,`rgba(${aRgb.r},${aRgb.g},${aRgb.b},${bloomA*0.35})`);
    bloom.addColorStop(1, 'transparent');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(cx, cy, bloomR, 0, Math.PI*2); ctx.fill();

    // -------- VOICE RINGS (expanding rings when speaking/listening) --------
    if (state.activation > 0.05){
      for (let k=0;k<3;k++){
        const phase = ((t * (0.4 + k*0.1) + k*0.33) % 1);
        const rr = R * (1.0 + phase * 0.9);
        const a = (1 - phase) * 0.28 * state.activation * fade;
        ctx.globalAlpha = a;
        ctx.strokeStyle = acc;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI*2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // -------- ORB BODY: layered radial gradient (glass sphere) --------
    // 1) dark base fill (gives solid silhouette)
    const body = ctx.createRadialGradient(cx - R*0.35, cy - R*0.4, R*0.05, cx, cy, R);
    const bodyA = 0.55 + state.activation * 0.2;
    body.addColorStop(0,   `rgba(255,255,255,${0.14 * fade})`);
    body.addColorStop(0.35,`rgba(${aRgb.r},${aRgb.g},${aRgb.b},${0.18 * fade * (0.6 + state.activation*0.8)})`);
    body.addColorStop(0.7, `rgba(${Math.round(aRgb.r*0.25)},${Math.round(aRgb.g*0.25)},${Math.round(aRgb.b*0.25)},${0.55 * fade})`);
    body.addColorStop(1,   `rgba(8,8,10,${0.9 * fade})`);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();

    // 2) rim light
    const rim = ctx.createRadialGradient(cx, cy, R*0.82, cx, cy, R*1.02);
    rim.addColorStop(0, 'transparent');
    rim.addColorStop(0.7, `rgba(${aRgb.r},${aRgb.g},${aRgb.b},${(0.35 + state.activation*0.3) * fade})`);
    rim.addColorStop(1,  `rgba(${aRgb.r},${aRgb.g},${aRgb.b},0)`);
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(cx, cy, R*1.02, 0, Math.PI*2); ctx.fill();

    // 3) top highlight (specular)
    const spec = ctx.createRadialGradient(cx - R*0.3, cy - R*0.45, 0, cx - R*0.3, cy - R*0.45, R*0.6);
    spec.addColorStop(0, `rgba(255,255,255,${0.35 * fade})`);
    spec.addColorStop(1, 'transparent');
    ctx.fillStyle = spec;
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // 4) inner accent glow (grows with amp)
    const innerR = R * (0.35 + state.amp * 0.3 * state.activation);
    const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
    const innerA = (0.35 + state.amp * 0.55) * (0.5 + state.activation * 0.6) * fade;
    inner.addColorStop(0,   `rgba(${aRgb.r},${aRgb.g},${aRgb.b},${innerA})`);
    inner.addColorStop(0.5, `rgba(${aRgb.r},${aRgb.g},${aRgb.b},${innerA*0.4})`);
    inner.addColorStop(1, 'transparent');
    ctx.fillStyle = inner;
    ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI*2); ctx.fill();

    // 5) hot pupil (only visible when activated)
    if (state.activation > 0.05){
      const pupilR = 1.5 + state.amp * 3 * state.activation;
      ctx.globalAlpha = (0.9 * state.activation) * fade;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx, cy, pupilR, 0, Math.PI*2); ctx.fill();
    }

    // -------- SURFACE DETAIL — subtle specks on front hemisphere --------
    ctx.globalAlpha = 1;
    for (let i=0;i<SURF_N;i++){
      const p = surf[i];
      let x = p.x, y = p.y, z = p.z;
      // rotate
      let xr = x*cY - z*sY, zr = x*sY + z*cY;
      let yr = y*cX - zr*sX, zr2 = y*sX + zr*cX;
      const depth = (zr2 + 1) / 2;
      if (depth < 0.55) continue;
      const persp = 600 / (600 - zr2 * R * 1.1);
      const px = cx + xr*R*persp*0.99;
      const py = cy + yr*R*persp*0.99;
      const a = (0.15 + depth*0.5) * fade * (0.5 + state.activation*0.5);
      if (p.seed > 0.92){
        ctx.globalAlpha = a;
        ctx.fillStyle = acc;
        ctx.beginPath(); ctx.arc(px, py, 0.9*persp, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px-0.4, py-0.4, 0.9, 0.9);
      }
    }
    ctx.globalAlpha = 1;

    // -------- RADIAL FILAMENTS (amp-reactive) --------
    fils.forEach((f, fi) => {
      const ampK = state.amp * state.activation;
      const pulse = (Math.sin(t * f.freq * animMult + f.phase) * 0.5 + 0.5);
      const lenR = R * (1.02 + f.len * (0.3 + pulse*0.25 + ampK*0.9));
      const ax = Math.cos(f.a + t*0.02), ay = Math.sin(f.a + t*0.02);
      const px1 = cx + ax * R * 0.97;
      const py1 = cy + ay * R * 0.97;
      const px2 = cx + ax * lenR;
      const py2 = cy + ay * lenR;
      const a = (0.15 + pulse*0.3 + ampK*0.5) * fade * (0.4 + state.activation*0.6);
      const grad = ctx.createLinearGradient(px1, py1, px2, py2);
      grad.addColorStop(0, `rgba(${aRgb.r},${aRgb.g},${aRgb.b},${a})`);
      grad.addColorStop(1, `rgba(${aRgb.r},${aRgb.g},${aRgb.b},0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = f.thick * (0.8 + ampK*1.2);
      ctx.beginPath(); ctx.moveTo(px1,py1); ctx.lineTo(px2,py2); ctx.stroke();
    });

    // -------- AMBIENT SPARKS --------
    sparks.forEach((s, si) => {
      s.a += s.speed * animMult;
      const x = Math.cos(s.a) * s.r;
      const y = Math.sin(s.a * 0.6 + s.phase) * 0.25;
      const z = Math.sin(s.a) * s.r;
      let xr = x*cY - z*sY, zr = x*sY + z*cY;
      let yr = y*cX - zr*sX, zr2 = y*sX + zr*cX;
      const persp = 600 / (600 - zr2 * baseR * 1.1);
      const px = cx + xr*baseR*persp;
      const py = cy + yr*baseR*persp;
      const depth = (zr2 + 1) / 2;
      ctx.globalAlpha = (0.25 + depth * 0.5) * fade;
      ctx.fillStyle = acc;
      ctx.beginPath(); ctx.arc(px, py, s.size * persp, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = (0.08 + depth*0.15) * fade;
      ctx.beginPath(); ctx.arc(px, py, s.size*persp*5, 0, Math.PI*2); ctx.fill();
    });

    ctx.globalAlpha = 1;
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // =========================================================
  // PUBLIC: HUD + button wiring
  // =========================================================
  const hudStatus = document.getElementById('hero-status');
  const btnHear = document.getElementById('hear-btn');
  const btnHearLabel = document.getElementById('hear-btn-label');

  function setStatus(label, mode){
    state.mode = mode;
    state.status = label;
    if (hudStatus) hudStatus.textContent = label;
    if (btnHearLabel){
      if (mode === 'idle') btnHearLabel.textContent = 'Hear it live';
      else if (mode === 'listening') btnHearLabel.textContent = 'Listening…  (tap to stop)';
      else if (mode === 'speaking') btnHearLabel.textContent = 'Halo is speaking…';
      else if (mode === 'thinking') btnHearLabel.textContent = 'Thinking…';
    }
    if (btnHear){
      btnHear.classList.toggle('hear-active', mode !== 'idle');
    }
  }

  async function activate(){
    // awaken sequence: thinking → listening
    setStatus('WAKING…', 'thinking');
    state.startedAt = performance.now();
    const ok = await startMic();
    if (!ok){
      // fall back to simulated conversation if mic denied
      simulatedLoop();
      return;
    }
    setTimeout(() => setStatus('LISTENING', 'listening'), 420);

    // After some listening time with amp, pretend to respond
    scheduleAutoResponse();
  }

  let responseTimer = null;
  function scheduleAutoResponse(){
    clearTimeout(responseTimer);
    responseTimer = setTimeout(() => {
      if (state.mode !== 'listening') return;
      setStatus('THINKING', 'thinking');
      setTimeout(() => {
        if (state.mode === 'idle') return;
        speakSynthT0 = performance.now();
        setStatus('SPEAKING', 'speaking');
        setTimeout(() => {
          if (state.mode === 'idle') return;
          setStatus('LISTENING', 'listening');
          scheduleAutoResponse();
        }, 3600 + Math.random()*1800);
      }, 900);
    }, 4500);
  }

  function simulatedLoop(){
    // no mic — cycle through states using synthetic audio
    setStatus('LISTENING', 'listening');
    const step = () => {
      if (state.mode === 'idle') return;
      setStatus('THINKING', 'thinking');
      setTimeout(()=>{
        if (state.mode === 'idle') return;
        speakSynthT0 = performance.now();
        setStatus('SPEAKING', 'speaking');
        setTimeout(()=>{
          if (state.mode === 'idle') return;
          setStatus('LISTENING', 'listening');
          setTimeout(step, 3200);
        }, 3600);
      }, 900);
    };
    setTimeout(step, 3500);
  }

  function deactivate(){
    clearTimeout(responseTimer);
    stopMic();
    setStatus('STANDBY', 'idle');
  }

  if (btnHear){
    btnHear.addEventListener('click', (e) => {
      e.preventDefault();
      if (state.mode === 'idle') activate();
      else deactivate();
    });
  }

  // expose for debugging
  window.__orb = { state, activate, deactivate };
})();
