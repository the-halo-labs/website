/* ===========================================================
   LIVE DEMO — scripted calls + waveform
   =========================================================== */
(() => {
  // ---------- SCRIPTS ----------
  const SCRIPTS = {
    dental: {
      caller: { name: "Maria Rodriguez", phone: "+1 (415) 555-0182", initials: "MR" },
      lines: [
        {who:'halo', t: 400, text: "Thanks for calling Apex Dental, this is Halo. How can I help?"},
        {who:'caller', t: 2400, text: "Hi — I chipped a tooth this morning. Do you have anything today?"},
        {who:'halo', t: 3800, text: "Oh no, I'm sorry. Let's get you in quickly. Are you an existing patient?"},
        {who:'caller', t: 2600, text: "Yeah, under Maria Rodriguez."},
        {who:'action', t: 1200, text: "▸ looking up patient record · found · insurance: Delta PPO"},
        {who:'halo', t: 3200, text: "Found you, Maria. I have an opening at 2:15 pm with Dr. Kim, or 4:00 pm with Dr. Shah."},
        {who:'caller', t: 2400, text: "2:15 works, thank you!"},
        {who:'action', t: 1100, text: "▸ booking 2:15 PM · Dr. Kim · emergency chip repair"},
        {who:'halo', t: 3000, text: "Booked. I'll text you the confirmation and directions. See you at 2:15."},
        {who:'action', t: 900, text: "✓ sms sent · ✓ dentrix updated · ✓ doctor notified"},
      ]
    },
    hvac: {
      caller: { name: "Derek Larson", phone: "+1 (602) 555-0117", initials: "DL" },
      lines: [
        {who:'halo', t: 400, text: "Blueflame HVAC, this is Halo — what's going on?"},
        {who:'caller', t: 2400, text: "My AC just quit and it's 108 outside."},
        {who:'halo', t: 2600, text: "That's awful, I'll get someone out fast. What zip are you in?"},
        {who:'caller', t: 2000, text: "85016."},
        {who:'action', t: 1000, text: "▸ dispatch check · Miguel available · 45 min ETA"},
        {who:'halo', t: 3400, text: "Good news — Miguel can be there in about 45 minutes. Is that okay?"},
        {who:'caller', t: 1600, text: "Yes please."},
        {who:'action', t: 1100, text: "▸ creating job · ServiceTitan · emergency rate · pre-auth $95"},
        {who:'halo', t: 3200, text: "Booked. Miguel will text when he's 10 out. Stay cool — we'll fix it."},
        {who:'action', t: 900, text: "✓ job #4821 · ✓ tech dispatched · ✓ sms sent"},
      ]
    },
    law: {
      caller: { name: "Jordan Kim", phone: "+1 (312) 555-0198", initials: "JK" },
      lines: [
        {who:'halo', t: 400, text: "Meridian Law, thank you for calling. This is Halo."},
        {who:'caller', t: 2400, text: "I need a consultation — employment discrimination case."},
        {who:'halo', t: 2800, text: "Of course. A few quick intake questions — is that okay?"},
        {who:'caller', t: 1400, text: "Sure."},
        {who:'action', t: 1000, text: "▸ conflict check · no conflicts · intake started"},
        {who:'halo', t: 3200, text: "Can I take your name and the opposing party, if any?"},
        {who:'caller', t: 2400, text: "Jordan Kim. Company is Northwind Industries."},
        {who:'action', t: 1200, text: "▸ clio intake · matter draft created"},
        {who:'halo', t: 3400, text: "Ms. Rivera has a 20-minute consultation open tomorrow at 10am. Should I hold it?"},
        {who:'caller', t: 1800, text: "Please."},
        {who:'action', t: 900, text: "✓ consult booked · ✓ NDA emailed · ✓ matter opened"},
      ]
    },
    realestate: {
      caller: { name: "Priya Shah", phone: "+1 (408) 555-0144", initials: "PS" },
      lines: [
        {who:'halo', t: 400, text: "Keystone Realty, this is Halo. How can I help?"},
        {who:'caller', t: 2400, text: "I saw the listing on Elm — 3-bed? Can I see it this weekend?"},
        {who:'halo', t: 3000, text: "Yes — 412 Elm. Are you pre-approved or browsing?"},
        {who:'caller', t: 2000, text: "Pre-approved up to 1.2."},
        {who:'action', t: 1100, text: "▸ lead score: hot · agent: Jenna T. · calendar checked"},
        {who:'halo', t: 3200, text: "Great. Jenna has Saturday at 11 or 2. Which works?"},
        {who:'caller', t: 1400, text: "2 is perfect."},
        {who:'action', t: 1000, text: "▸ booking saturday 2pm · sending disclosure packet"},
        {who:'halo', t: 3200, text: "Booked. I'll text address, parking, and the disclosures now."},
        {who:'action', t: 900, text: "✓ fub updated · ✓ disclosures sent · ✓ agent notified"},
      ]
    },
    plumbing: {
      caller: { name: "Sam Ortiz", phone: "+1 (503) 555-0166", initials: "SO" },
      lines: [
        {who:'halo', t: 400, text: "Caldera Plumbing — this is Halo. What's happening?"},
        {who:'caller', t: 2400, text: "Water's coming up through the shower drain. It's bad."},
        {who:'halo', t: 2800, text: "Sounds like a main line backup. Can I ask — is it actively overflowing?"},
        {who:'caller', t: 1800, text: "It's rising, yeah."},
        {who:'action', t: 1000, text: "▸ tagged emergency · hydrojet truck on-call · Lee"},
        {who:'halo', t: 3200, text: "Turn off the main shutoff if you can — Lee's dispatching now. ETA 35 minutes."},
        {who:'caller', t: 1400, text: "Okay, thank you."},
        {who:'action', t: 1100, text: "▸ upfront quote: $295 diag + hydrojet $550"},
        {who:'halo', t: 3000, text: "Lee will text you the quote before any work starts. Hang in there."},
        {who:'action', t: 900, text: "✓ emergency job · ✓ truck rolling · ✓ quote sent"},
      ]
    }
  };

  // ---------- DOM ----------
  const panel = {
    name: document.getElementById('demo-caller'),
    meta: document.getElementById('demo-meta'),
    avatar: document.querySelector('.demo-avatar'),
    timer: document.getElementById('demo-timer'),
    status: document.getElementById('demo-status-txt'),
    transcript: document.getElementById('transcript'),
    toggle: document.getElementById('demo-toggle'),
    toggleLabel: document.getElementById('demo-toggle-label'),
    reset: document.getElementById('demo-reset'),
    inds: document.querySelectorAll('.demo-industries .ind'),
    playIco: document.querySelector('.demo-btn .play-ico'),
  };

  let current = 'dental';
  let playing = false;
  let lineIdx = 0;
  let timeoutId = null;
  let timerId = null;
  let tSeconds = 0;

  function fmtTime(s){
    const m = Math.floor(s/60).toString().padStart(2,'0');
    const sec = Math.floor(s%60).toString().padStart(2,'0');
    return `${m}:${sec}`;
  }
  function setIndustry(key){
    current = key;
    panel.inds.forEach(b => b.classList.toggle('active', b.dataset.ind === key));
    const sc = SCRIPTS[key];
    panel.name.textContent = sc.caller.name;
    panel.meta.textContent = `${sc.caller.phone} · inbound`;
    panel.avatar.textContent = sc.caller.initials;
    reset();
  }
  function reset(){
    stop();
    lineIdx = 0; tSeconds = 0;
    panel.timer.textContent = '00:00';
    panel.transcript.innerHTML = '';
    panel.toggleLabel.textContent = 'Play call';
    panel.playIco.textContent = '▶';
    setWaveActive(false);
  }
  function stop(){
    playing = false;
    clearTimeout(timeoutId);
    clearInterval(timerId);
    setWaveActive(false);
    panel.toggleLabel.textContent = lineIdx >= SCRIPTS[current].lines.length ? 'Replay' : 'Resume';
    panel.playIco.textContent = '▶';
  }
  function start(){
    if (lineIdx >= SCRIPTS[current].lines.length) { lineIdx = 0; tSeconds=0; panel.transcript.innerHTML=''; }
    playing = true;
    panel.toggleLabel.textContent = 'Pause';
    panel.playIco.textContent = '❚❚';
    timerId = setInterval(()=>{ tSeconds += 1; panel.timer.textContent = fmtTime(tSeconds); }, 1000);
    setWaveActive(true);
    next();
  }
  function next(){
    if (!playing) return;
    const script = SCRIPTS[current];
    if (lineIdx >= script.lines.length){ stop(); return; }
    const ln = script.lines[lineIdx++];
    addBubble(ln.who, ln.text);
    timeoutId = setTimeout(next, ln.t);
  }
  function addBubble(who, text){
    const el = document.createElement('div');
    if (who === 'action') {
      el.className = 'bubble bubble-action';
      el.textContent = text;
    } else {
      el.className = 'bubble ' + (who === 'halo' ? 'bubble-halo' : 'bubble-caller');
      el.innerHTML = `<span class="who">${who === 'halo' ? 'Halo' : SCRIPTS[current].caller.name.split(' ')[0]}</span>${text}`;
    }
    panel.transcript.appendChild(el);
    panel.transcript.scrollTop = panel.transcript.scrollHeight;
  }

  // buttons
  panel.toggle.addEventListener('click', () => {
    if (playing) stop(); else start();
  });
  panel.reset.addEventListener('click', reset);
  panel.inds.forEach(b => b.addEventListener('click', () => setIndustry(b.dataset.ind)));

  // auto-start when scrolled into view (only first time)
  let started = false;
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(en => {
      if (en.isIntersecting && !started){
        started = true;
        start();
      }
    });
  }, { threshold: 0.35 });
  io.observe(document.getElementById('demo'));

  // ---------- WAVE ----------
  const waveCanvas = document.getElementById('wave');
  const wctx = waveCanvas.getContext('2d');
  let wW, wH, wDPR;
  let waveActive = false;
  function setWaveActive(on){ waveActive = on; }
  function sizeW(){
    wDPR = Math.min(window.devicePixelRatio || 1, 2);
    const r = waveCanvas.getBoundingClientRect();
    wW = r.width; wH = r.height;
    waveCanvas.width = wW * wDPR; waveCanvas.height = wH * wDPR;
    wctx.setTransform(wDPR,0,0,wDPR,0,0);
  }
  sizeW(); window.addEventListener('resize', sizeW);

  function drawWave(now){
    wctx.clearRect(0,0,wW,wH);
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4ade80';
    const bars = Math.floor(wW / 4);
    const cx = wW/2, cy = wH/2;
    const t = now/1000;
    const envScale = waveActive ? 1 : 0.12;
    for (let i=0;i<bars;i++){
      const x = i*4;
      const dist = Math.abs(i - bars/2) / (bars/2); // 0 center, 1 edges
      const env = (1 - Math.pow(dist, 1.6));
      const wob = Math.sin(t*2.2 + i*0.22) * 0.5 + Math.sin(t*3.7 + i*0.11) * 0.5;
      const h = Math.max(1, env * (wH*0.45) * (0.5 + wob*0.5) * envScale);
      wctx.fillStyle = waveActive ? acc : '#3a3a3f';
      wctx.globalAlpha = 0.35 + env * 0.65;
      wctx.fillRect(x, cy - h/2, 2, h);
    }
    wctx.globalAlpha = 1;
    requestAnimationFrame(drawWave);
  }
  requestAnimationFrame(drawWave);
})();
