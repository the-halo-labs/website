/* ===========================================================
   APP — nav, reveals, metrics, ROI, tweaks
   =========================================================== */
(() => {

  // ---------- NAV SCROLL ----------
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  // ---------- REVEAL ON SCROLL ----------
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(en => {
      if (en.isIntersecting){
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // ---------- STEP CARD MOUSE HIGHLIGHT ----------
  document.querySelectorAll('.step').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    });
  });

  // ---------- METRIC COUNT-UP ----------
  const counters = document.querySelectorAll('.metric-num');
  const cio = new IntersectionObserver((entries)=>{
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const target = parseFloat(el.dataset.count);
      const hasDec = !Number.isInteger(target);
      const dur = 1400;
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = target * eased;
        el.textContent = hasDec ? v.toFixed(1) : Math.round(v);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      cio.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => cio.observe(c));

  // ---------- LIVE CLOCK + COUNT ----------
  const timeEl = document.getElementById('live-time');
  const countEl = document.getElementById('live-count');
  function tickClock(){
    const d = new Date();
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2,'0');
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    if (timeEl) timeEl.innerHTML = `${h.toString().padStart(2,'0')}:${m}<span class="ampm">${ampm}</span>`;
  }
  tickClock(); setInterval(tickClock, 15000);
  // count grows slowly
  if (countEl){
    let n = 14;
    setInterval(()=>{ if (Math.random() > 0.4) { n++; countEl.textContent = n; } }, 3500);
  }

  // ---------- ROI ----------
  const roi = {
    calls: document.getElementById('roi-calls'),
    miss: document.getElementById('roi-miss'),
    value: document.getElementById('roi-value'),
    close: document.getElementById('roi-close'),
    callsV: document.getElementById('roi-calls-val'),
    missV: document.getElementById('roi-miss-val'),
    valueV: document.getElementById('roi-value-val'),
    closeV: document.getElementById('roi-close-val'),
    year: document.getElementById('roi-year'),
    month: document.getElementById('roi-month'),
    week: document.getElementById('roi-week'),
    saved: document.getElementById('roi-saved'),
  };
  let roiAnimTargets = { year:0, month:0, week:0, saved:0 };
  let roiAnimCurr   = { year:0, month:0, week:0, saved:0 };

  function fmt(n){ return Math.round(n).toLocaleString('en-US'); }

  function updateRoi(){
    const calls = +roi.calls.value;
    const miss = +roi.miss.value / 100;
    const value = +roi.value.value;
    const close = +roi.close.value / 100;
    roi.callsV.textContent = calls;
    roi.missV.textContent = roi.miss.value;
    roi.valueV.textContent = value;
    roi.closeV.textContent = roi.close.value;

    const missedPerDay = calls * miss;
    const recoveredPerDay = missedPerDay * 0.85; // halo catches 85%
    const newJobsPerDay = recoveredPerDay * close;
    const dailyRev = newJobsPerDay * value;
    const yearly = dailyRev * 365;
    const monthly = yearly / 12;
    const weekly = yearly / 52;
    const savedYr = recoveredPerDay * 365;

    roiAnimTargets = { year: yearly, month: monthly, week: weekly, saved: savedYr };
  }
  function tickRoi(){
    let changed = false;
    for (const k of ['year','month','week','saved']){
      const diff = roiAnimTargets[k] - roiAnimCurr[k];
      if (Math.abs(diff) > 0.5){
        roiAnimCurr[k] += diff * 0.14;
        changed = true;
      } else {
        roiAnimCurr[k] = roiAnimTargets[k];
      }
      roi[k].textContent = fmt(roiAnimCurr[k]);
    }
    requestAnimationFrame(tickRoi);
  }
  ['calls','miss','value','close'].forEach(k => roi[k].addEventListener('input', updateRoi));
  updateRoi();
  requestAnimationFrame(tickRoi);

  // ---------- TWEAKS ----------
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "accent": "#4ade80",
    "font": "instrument",
    "anim": "normal",
    "headline": "Never miss\n*another* call."
  }/*EDITMODE-END*/;

  const state = { ...TWEAK_DEFAULTS };

  function applyAccent(c){
    document.documentElement.style.setProperty('--accent', c);
  }
  function applyFont(f){
    document.body.classList.remove('font-instrument','font-grotesk','font-dmserif');
    document.body.classList.add('font-' + f);
  }
  function applyAnim(a){
    document.body.classList.remove('anim-calm','anim-normal','anim-max');
    document.body.classList.add('anim-' + a);
  }
  function applyHead(text){
    const el = document.getElementById('hero-headline');
    const lines = text.split('\n').slice(0,2);
    el.innerHTML = lines.map(ln => {
      const html = ln.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      return `<span class="line">${html}</span>`;
    }).join('');
  }
  function applyAll(){
    applyAccent(state.accent);
    applyFont(state.font);
    applyAnim(state.anim);
    applyHead(state.headline);
    markActives();
  }
  function markActives(){
    document.querySelectorAll('#sw-accent button').forEach(b => b.classList.toggle('active', b.dataset.val === state.accent));
    document.querySelectorAll('#sw-font button').forEach(b => b.classList.toggle('active', b.dataset.val === state.font));
    document.querySelectorAll('#sw-anim button').forEach(b => b.classList.toggle('active', b.dataset.val === state.anim));
    const ta = document.getElementById('sw-head'); if (ta && document.activeElement !== ta) ta.value = state.headline;
  }

  function setKey(k,v){
    state[k] = v;
    applyAll();
    try{
      window.parent.postMessage({type:'__edit_mode_set_keys', edits:{[k]:v}}, '*');
    }catch(e){}
  }

  document.querySelectorAll('#sw-accent button').forEach(b => b.addEventListener('click', () => setKey('accent', b.dataset.val)));
  document.querySelectorAll('#sw-font button').forEach(b => b.addEventListener('click', () => setKey('font', b.dataset.val)));
  document.querySelectorAll('#sw-anim button').forEach(b => b.addEventListener('click', () => setKey('anim', b.dataset.val)));
  document.getElementById('sw-head').addEventListener('input', (e) => setKey('headline', e.target.value));

  applyAll();

  // ---------- EDIT MODE PROTOCOL ----------
  const tweaksPanel = document.getElementById('tweaks');
  const closeBtn = document.getElementById('tweaks-close');

  window.addEventListener('message', (ev) => {
    const d = ev.data || {};
    if (d.type === '__activate_edit_mode'){ tweaksPanel.hidden = false; }
    if (d.type === '__deactivate_edit_mode'){ tweaksPanel.hidden = true; }
  });
  closeBtn.addEventListener('click', ()=>{
    tweaksPanel.hidden = true;
    try{ window.parent.postMessage({type:'__deactivate_edit_mode'}, '*'); }catch(e){}
  });
  try{ window.parent.postMessage({type:'__edit_mode_available'}, '*'); }catch(e){}
})();
