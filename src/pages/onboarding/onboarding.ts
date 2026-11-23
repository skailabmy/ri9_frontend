/* ============================================================
   RI9 · ONBOARDING / WALKTHROUGH — first-run 4-step tutorial.
   Ported from the prototype (references/index.html, WT block):
   four swipeable steps that replay real dashboard components
   (dock, pills, drill question, prize delivery) inside a
   "screen window", each with a looping animation scene.

   Flow (replaces the prototype's cookie-gated overlay):
     1. onboarding.html's inline head script redirects home
        immediately if the walkthrough was already completed
     2. otherwise this module builds + opens the walkthrough
     3. finishing (or skipping) marks the storage key and
        navigates to the kid home page (index.html)

   Storage: localStorage key `ri9_walkthrough` = 'done' with a
   document.cookie fallback — plain localStorage persists in the
   Capacitor WebView on both iOS (WKWebView) and Android
   (WebView), surviving app restarts. The inline head script of
   onboarding.html and the gate in home.ts both read the same
   key. Add ?walkthrough to the URL to force a replay.
   ============================================================ */

/* ---------- stage fit (390×820 scaled to viewport) ---------- */
(function fitModule(): void {
  const root = document.documentElement;
  const fit = (): void => {
    const vp = document.getElementById('vp');
    if (!vp) return;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const s = Math.min(vw / 390, vh / 812, 1.5);
    const W = Math.min(vw / s, 520), H = vh / s;
    root.style.setProperty('--s', s.toFixed(4));
    root.style.setProperty('--W', W.toFixed(1));
    root.style.setProperty('--H', H.toFixed(1));
    root.style.setProperty('--ox', ((vw - W * s) / 2).toFixed(1) + 'px');
  };
  fit();
  addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
})();

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <E extends Element = HTMLElement>(s: string): E | null => document.querySelector<E>(s);
const $$ = <E extends Element = HTMLElement>(s: string): E[] => [...document.querySelectorAll<E>(s)];
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/* ===================== SFX ENGINE (synthesised, no files) =====================
   Same engine as home.behavior.js so the walkthrough sounds identical. */
const SFX = (() => {
  let ctx: AudioContext | null = null, out: GainNode | null = null, on = true, nb: AudioBuffer | null = null;
  try { on = localStorage.getItem('sfx') !== '0' } catch { /* private mode */ }
  function init(): AudioContext | null {
    if (ctx) return ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    out = ctx.createGain(); out.gain.value = .6; out.connect(comp); comp.connect(ctx.destination);
    return ctx;
  }
  const unlock = (): void => { const c = init(); if (c && c.state === 'suspended') c.resume(); };
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => addEventListener(ev, unlock, { passive: true, capture: true }));
  const ok = (): boolean => on && !!ctx && ctx.state === 'running';
  function tone(f: number, o: { t?: number; d?: number; type?: OscillatorType; v?: number; to?: number | null; a?: number } = {}): void {
    if (!ok()) return;
    const { t = 0, d = .12, type = 'sine', v = .3, to = null, a = .004 } = o;
    const t0 = ctx!.currentTime + t, os = ctx!.createOscillator(), g = ctx!.createGain();
    os.type = type; os.frequency.setValueAtTime(f, t0);
    if (to) os.frequency.exponentialRampToValueAtTime(to, t0 + d);
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
    os.connect(g); g.connect(out!); os.start(t0); os.stop(t0 + d + .03);
  }
  function nz(o: { t?: number; d?: number; v?: number; f?: number; to?: number | null; q?: number; type?: BiquadFilterType } = {}): void {
    if (!ok()) return;
    const { t = 0, d = .15, v = .2, f = 2000, to = null, q = 1, type = 'bandpass' } = o;
    const t0 = ctx!.currentTime + t;
    if (!nb) { nb = ctx!.createBuffer(1, ctx!.sampleRate, ctx!.sampleRate); const x = nb.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; }
    const s = ctx!.createBufferSource(), fl = ctx!.createBiquadFilter(), g = ctx!.createGain();
    s.buffer = nb; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t0);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t0 + d);
    g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
    s.connect(fl); fl.connect(g); g.connect(out!); s.start(t0); s.stop(t0 + d + .03);
  }
  const SC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
  const P: Record<string, (...a: unknown[]) => void> = {
    tap() { tone(1650, { d: .035, type: 'triangle', v: .1, to: 1100 }) },
    whoosh() { nz({ d: .24, v: .09, f: 500, to: 3200, q: .7 }) },
    pop() { tone(380, { d: .1, v: .28, to: 880 }) },
    ok(n = 0) {
      const b = SC[Math.min(Number(n), SC.length - 1)];
      tone(b, { d: .11, type: 'triangle', v: .26 }); tone(b * 1.5, { t: .06, d: .24, type: 'triangle', v: .22 }); tone(b * 3, { t: .06, d: .3, v: .06 });
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { t: i * .085, d: .2, type: 'triangle', v: .24 }));
      tone(1046.5, { t: .34, d: .7, v: .2 }); tone(1567.98, { t: .34, d: .7, v: .1 }); tone(2093, { t: .4, d: .6, v: .05 });
      nz({ t: .34, d: .7, v: .05, f: 7000, type: 'highpass' });
    },
    sparkle() { [2093, 2637, 3136, 2637, 3520, 4186].forEach((f, i) => tone(f, { t: i * .045, d: .14, v: .06 })) },
    tick() { tone(1400, { d: .025, type: 'square', v: .04 }) },
    coin() { tone(1980, { d: .07, type: 'triangle', v: .16, to: 2640 }); tone(2640, { t: .05, d: .16, type: 'triangle', v: .12 }) },
    unlock() { tone(523.25, { d: .08, type: 'triangle', v: .2 }); tone(783.99, { t: .07, d: .08, type: 'triangle', v: .2 }); tone(1046.5, { t: .14, d: .3, type: 'triangle', v: .2 }); nz({ t: .1, d: .3, v: .05, f: 6000, type: 'highpass' }) },
  };
  return {
    play(k: string, ...a: unknown[]) { try { P[k] && P[k](...a) } catch { /* audio never blocks UI */ } },
    get on(): boolean { return on },
    set(v: boolean): void {
      on = !!v;
      try { localStorage.setItem('sfx', on ? '1' : '0') } catch { /* ignore */ }
      if (on) { unlock(); setTimeout(() => P.unlock(), 30); }
    },
  };
})();
const buzz = (): void => { SFX.play('tap'); try { navigator.vibrate && navigator.vibrate(10) } catch { /* ignore */ } };

/* ===================== FIRST-RUN STORAGE =====================
   localStorage is the source of truth (persists per-app in the
   Capacitor WebView on iOS + Android). A cookie mirrors it as a
   fallback for storage-restricted contexts, same as the prototype. */
const CK = 'ri9_walkthrough';
function wtSeen(): boolean {
  try { if (localStorage.getItem(CK) === 'done') return true } catch { /* ignore */ }
  try { return document.cookie.split('; ').some(c => c.startsWith(CK + '=')) } catch { return false }
}
function wtMark(): void {
  try { localStorage.setItem(CK, 'done') } catch { /* ignore */ }
  try { document.cookie = `${CK}=done; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax` } catch { /* ignore */ }
}
/** Finish/skip → go to the kid home page. */
function goHome(): void { location.href = 'index.html'; }

/* ===================== CONFETTI (standalone) ===================== */
function confetti(): void {
  if (reduce) return;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;z-index:999;pointer-events:none';
  cv.width = innerWidth; cv.height = innerHeight;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) { cv.remove(); return; }
  const cols = ['#c6f432', '#ffd25e', '#7fd1ff', '#ff7ad9', '#ff5a4e', '#fff'];
  const ps = Array.from({ length: 130 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .35,
    v: 2.2 + Math.random() * 4.2, w: 5 + Math.random() * 7,
    r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3,
    c: cols[Math.floor(Math.random() * cols.length)],
  }));
  let frames = 0;
  (function f(): void {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => {
      p.y += p.v; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.w / 2, p.w, p.w * .6);
      ctx.restore();
    });
    if (++frames < 190) requestAnimationFrame(f); else cv.remove();
  })();
}

/* ===================== WALKTHROUGH ===================== */
(function buildWalkthrough(): void {
  const stage = $('#stage');
  if (!stage) return;
  const force = /[?&#]walkthrough\b/.test(location.search + location.hash);

  /* --- live copies of real dashboard pieces (from the hidden template) --- */
  const strip = (n: Element): Element => {
    n.removeAttribute('id');
    n.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
    n.querySelectorAll('[data-mode],[data-page]').forEach(x => { x.removeAttribute('data-mode'); x.removeAttribute('data-page'); });
    n.classList.remove('in');
    n.setAttribute('aria-hidden', 'true');
    (n as unknown as HTMLElement).tabIndex = -1;
    n.querySelectorAll('button').forEach(b => ((b as unknown as HTMLElement).tabIndex = -1));
    return n;
  };
  const src = $('#wt-src');
  const dockC = (): string => {
    const base = src?.querySelector('.dock');
    if (!base) return '';
    const d = strip(base.cloneNode(true) as HTMLElement);
    d.querySelectorAll('.dnav,svg.shape,.shine').forEach(x => x.remove());
    return d.outerHTML;
  };
  const pillC = (sel: string): string => {
    const base = src?.querySelector(sel);
    return base ? strip(base.cloneNode(true) as HTMLElement).outerHTML : '';
  };

  const hand = '<svg viewBox="0 0 24 24"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10l.5-.1V8a1.5 1.5 0 0 1 3 0v2.2a1.5 1.5 0 0 1 3 .3V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4.2 15a1.6 1.6 0 0 1 2.5-2l1.3 1.4V11z" fill="#fff" stroke="#1b1c19" stroke-width="1.3" stroke-linejoin="round"/></svg><i></i>';
  const bolt = '<svg viewBox="0 0 24 24"><path d="M13.5 2 4.5 13.5h6.5L10 22l9.5-12H13z" fill="#1b1c19"/></svg>';
  const ck = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', xx = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>';

  const QS = [
    { s: 'MATHEMATICS · FRACTIONS', q: 'What is ¾ as a decimal?', o: ['0.34', '0.75', '7.4', '3.4'], c: 1 },
    { s: 'ENGLISH · TENSES', q: 'Past tense of “run”?', o: ['runned', 'running', 'ran', 'runs'], c: 2 },
  ];
  const anH = (q: typeof QS[number]): string =>
    q.o.map((o, k) => `<div class="an"><span class="lt">${'ABCD'[k]}</span><span class="v">${o}</span><span class="mk">${k === q.c ? ck : xx}</span></div>`).join('');
  const PZ: [string, string, string, string][] = [
    ['scooter', 'Kick scooter', 'Worth RM500', '#ffe9e6'],
    ['console', 'Game console', 'Worth RM1,200', '#e8f4ff'],
    ['earbuds', 'Wireless earbuds', 'Worth RM300', '#f3f5f0'],
  ];
  const PA: Record<string, string> = {
    console: '<svg viewBox="0 0 64 64"><rect x="4" y="16" width="56" height="32" rx="12" fill="#2d2f2a"/><rect x="18" y="20" width="28" height="22" rx="3" fill="#7fd1ff"/><rect x="18" y="20" width="28" height="7" fill="#b3e6ff"/><circle cx="11" cy="28" r="3.4" fill="#ff5a4e"/><path d="M9 38h6M12 35v6" stroke="#c6f432" stroke-width="2.6" stroke-linecap="round"/><circle cx="53" cy="27" r="2.6" fill="#ffd25e"/><circle cx="53" cy="37" r="2.6" fill="#c6f432"/><circle cx="49" cy="32" r="2.6" fill="#8f7cff"/><circle cx="57" cy="32" r="2.6" fill="#ff7ad9"/></svg>',
    scooter: '<svg viewBox="0 0 64 64"><path d="M44 8h8M48 8l-6 40" stroke="#2d2f2a" stroke-width="4" stroke-linecap="round"/><path d="M14 48h32" stroke="#ff5a4e" stroke-width="6" stroke-linecap="round"/><circle cx="14" cy="52" r="7" fill="#2d2f2a"/><circle cx="14" cy="52" r="2.6" fill="#c6f432"/><circle cx="46" cy="52" r="7" fill="#2d2f2a"/><circle cx="46" cy="52" r="2.6" fill="#c6f432"/></svg>',
    earbuds: '<svg viewBox="0 0 64 64"><rect x="8" y="26" width="48" height="30" rx="14" fill="#fff" stroke="#d9dfcf" stroke-width="2"/><path d="M8 38h48" stroke="#d9dfcf" stroke-width="2"/><circle cx="32" cy="46" r="2" fill="#c6f432"/><path d="M20 6a7 7 0 0 1 7 7v8a3 3 0 0 1-6 0v-4a7 7 0 0 1-1-11z" fill="#fff" stroke="#2d2f2a" stroke-width="2"/><path d="M44 6a7 7 0 0 0-7 7v8a3 3 0 0 0 6 0v-4a7 7 0 0 0 1-11z" fill="#fff" stroke="#2d2f2a" stroke-width="2"/></svg>',
  };

  const STEPS = [
    {
      h: 'PICK A <span>CHALLENGE</span> OR QUIZ',
      p: 'On your dashboard, tap <b>⚡ Challenge</b> to race the clock, or <b>❤️ Quiz</b> to play rounds for prizes.',
      s: `<div class="wt-win" id="wtW1"><div class="wt-hint">YOUR DASHBOARD</div>${dockC()}<div class="wt-bub" id="wtB1"></div><div class="wt-tap" id="wtT1">${hand}</div></div>`,
    },
    {
      h: 'ANSWER <span>FAST</span>',
      p: 'Read the question and tap the right answer before time runs out. <b>Right + fast = more points.</b>',
      s: `<div class="wt-win" id="wtW2"><div class="wt-hud"><span class="sg" id="wtSg">${[0, 1, 2, 3, 4, 5].map(() => '<i></i>').join('')}</span><span class="tm" id="wtTm">0:00.0</span></div><div class="wt-tb"><i id="wtTb"></i></div>
         <div class="qbox" id="wtQ"><small></small><p></p></div><div class="ans" id="wtA"></div><span class="wt-pl" id="wtPl">+1</span><div class="wt-tap" id="wtT2">${hand}</div></div>`,
    },
    {
      h: 'COLLECT POINTS & <span>STREAKS</span>',
      p: 'Every win earns <b>points and coins</b>. Play every day to grow your <b>🔥 streak</b>.',
      s: `<div class="wt-win" id="wtW3">${pillC('.streak')}${pillC('.wallet')}<span class="wt-st" id="wtSt">STREAK +1</span>
         <div class="wt-res"><span class="ic">${bolt}</span><h4>CHALLENGE <span>BEATEN!</span></h4><span class="wt-big"><b id="wtPts">+0</b><small>POINTS</small></span></div>
         ${[0, 1, 2, 3, 4].map(() => '<i class="wt-coin"></i>').join('')}</div>`,
    },
    {
      h: 'WIN <span>REAL PRIZES</span>',
      p: 'Pick the prize you want. Finish on top and <b>we ship it to your door!</b>',
      s: `<div class="wt-win" id="wtW4"><div class="wt-ph"><i>1</i>1ST PLACE · PICK YOUR PRIZE</div><div class="wt-pg">${PZ.map(it => `<div class="pt" style="--bgc:${it[3]}"><span class="ck">${ck}</span><span class="art">${PA[it[0]] || ''}</span><b>${it[1]}</b><small>${it[2]}</small></div>`).join('')}</div>
         <div class="pc5 ps-ship moving off" id="wtPc" style="--bgc:#ffe9e6;--m1:#fff3a8;--m2:#f2c94c;--mt:#5c3d00"><span class="chip5"><i></i>ON THE WAY</span>
           <div class="top5"><span class="art5">${PA.scooter || ''}</span><span class="tx5"><span class="md5"><i>1</i>1ST PLACE</span><b>Kick scooter</b><small>Prize Quiz · Week 47</small></span></div>
           <div class="trk" id="wtTrk" style="--tp:0"><span class="fill"></span>${['Won', 'Packing', 'On the way', 'Delivered'].map(l => `<div class="stp"><span class="dot"></span><small>${l}</small><em></em></div>`).join('')}</div></div><div class="wt-tap" id="wtT4">${hand}</div></div>`,
    },
  ];

  const el = document.createElement('div');
  el.className = 'wt'; el.id = 'wt';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'How to play and win');
  el.innerHTML = `<span class="wt-rays"></span><span class="wt-speed"></span>
    <div class="wt-top"><div class="wt-prog">${STEPS.map(() => '<i><b></b></i>').join('')}</div><button class="wt-skip" id="wtSkip">Skip</button></div>
    <div class="wt-track" id="wtTrack">${STEPS.map((s, k) => `<section class="wt-s wt-s${k + 1}" aria-hidden="true"><div class="wt-scene">${s.s}</div><div class="wt-txt"><div class="wt-n"><i>${k + 1}</i>STEP ${k + 1} OF ${STEPS.length}</div><h2 class="wt-h">${s.h}</h2><p class="wt-p">${s.p}</p></div></section>`).join('')}</div>
    <div class="wt-bot"><button class="wt-back" id="wtBack" aria-label="Previous step"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><button class="wt-next" id="wtNext"></button></div>`;
  /* Append to <body> (NOT #stage): #stage lives inside .viewport, which is
     inset by the iOS safe areas — the overlay would stop at the notch /
     home-indicator edges. At body level .wt is position:fixed and covers
     the full screen; safe-area padding is handled inside .wt-top/.wt-bot. */
  document.body.appendChild(el);

  const track = $('#wtTrack')!, slides = $$('.wt-s'), bars = $$('.wt-prog i');
  let i = 0;

  /* ---- scene players (loop while the step is on screen) ---- */
  let sT: number[] = [], ckT: ReturnType<typeof setInterval> | undefined;
  const later = (ms: number, f: () => void): void => { sT.push(setTimeout(f, ms) as unknown as number) };
  function stopScene(): void {
    sT.forEach(clearTimeout); sT = []; if (ckT !== undefined) clearInterval(ckT);
    el.querySelectorAll('.wt-tap').forEach(x => x.classList.remove('show', 'press'));
    el.querySelectorAll('.wt-bub').forEach(x => x.classList.remove('show'));
  }
  function pos(win: HTMLElement, t: Element): { x: number; y: number } {
    const w = win.getBoundingClientRect(), r = t.getBoundingClientRect();
    const k = w.width / win.offsetWidth || 1;
    return { x: (r.left - w.left + r.width / 2) / k, y: (r.top - w.top + r.height / 2) / k };
  }
  function tapAt(tap: HTMLElement, win: HTMLElement, target: Element, cb?: () => void): void {
    const p = pos(win, target);
    tap.style.left = p.x + 'px'; tap.style.top = p.y + 'px'; tap.classList.add('show');
    later(560, () => { tap.classList.remove('press'); void tap.offsetWidth; tap.classList.add('press'); SFX.play('tap'); cb && cb(); });
  }
  function countTo(node: HTMLElement, from: number, to: number, ms: number, fmt: (v: number) => string): void {
    const t0 = performance.now();
    (function f(t: number): void {
      const p = Math.min(1, (t - t0) / ms), v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      node.textContent = fmt(v);
      if (p < 1 && el.classList.contains('open')) requestAnimationFrame(f);
    })(t0);
  }
  function s1(): void {
    const w = $('#wtW1'), t = $('#wtT1'), b = $('#wtB1');
    if (!w || !t || !b) return;
    const d = w.querySelector('.dock'), q = w.querySelector('.sidem.l'), h = w.querySelector('.hero');
    if (!d || !q || !h) return;
    const step = (n: Element, txt: string, next: () => void): void => {
      tapAt(t, w, n, () => {
        d.classList.add('wt-dim');
        [q, h].forEach(x => x.classList.toggle('hot', x === n));
        const p = pos(w, n);
        b.style.left = Math.max(90, Math.min(w.offsetWidth - 90, p.x)) + 'px';
        b.style.top = (p.y - (n === h ? 58 : 44)) + 'px';
        b.innerHTML = txt; b.classList.add('show');
      });
      later(2500, () => { b.classList.remove('show'); n.classList.remove('hot'); d.classList.remove('wt-dim'); later(350, next); });
    };
    const loop = (): void => step(q, '<b>QUIZ</b> · play rounds, win prizes', () => step(h, '<b>CHALLENGE</b> · 6 questions vs the clock', loop));
    later(450, loop);
  }
  function s2(): void {
    const w = $('#wtW2'), t = $('#wtT2');
    if (!w || !t) return;
    const sg = [...w.querySelectorAll<HTMLElement>('#wtSg i')];
    let qi = 0;
    const round = (): void => {
      const q = QS[qi % QS.length], n = qi % 6, Q = $('#wtQ');
      if (Q) {
        const sm = Q.querySelector('small'), p = Q.querySelector('p');
        if (sm) sm.textContent = `QUESTION ${n + 1} OF 6 · ${q.s}`;
        if (p) p.textContent = q.q;
        Q.classList.remove('inq'); void Q.offsetWidth; Q.classList.add('inq');
      }
      const A = $('#wtA'); if (A) A.innerHTML = anH(q);
      sg.forEach((s, k) => { s.className = k < n ? 'ok' : k === n ? 'cur' : '' });
      const tb = $('#wtTb'); if (tb) { tb.classList.remove('run'); void tb.offsetWidth; tb.classList.add('run'); }
      const t0 = performance.now(), base = qi * 2.1, tm = $('#wtTm');
      clearInterval(ckT);
      ckT = setInterval(() => {
        if (tm) tm.textContent = '0:' + String((base + (performance.now() - t0) / 1000).toFixed(1)).padStart(4, '0');
      }, 100);
      later(1500, () => {
        const an = [...$('#wtA')!.children];
        tapAt(t, w, an[q.c], () => {
          clearInterval(ckT);
          an.forEach((a, k) => a.classList.add(k === q.c ? 'ok' : 'dim'));
          SFX.play('ok', n);
          const pl = $('#wtPl'); if (pl) { pl.classList.remove('go'); void pl.offsetWidth; pl.classList.add('go'); }
          sg[n].className = 'ok';
        });
      });
      later(3500, () => { t.classList.remove('show'); qi++; round(); });
    };
    round();
  }
  function s3(): void {
    const w = $('#wtW3');
    if (!w) return;
    const st = w.querySelector<HTMLElement>('.streak'), wl = w.querySelector<HTMLElement>('.wallet');
    if (!st || !wl) return;
    const sb = st.querySelector<HTMLElement>('b'), bal = wl.querySelector<HTMLElement>('.bal'), fl = st.querySelector<HTMLElement>('.flame-wrap'),
      coins = [...w.querySelectorAll<HTMLElement>('.wt-coin')], pts = $('#wtPts'), res = w.querySelector<HTMLElement>('.wt-res');
    let streak = 1, money = 1250;
    if (bal) bal.classList.add('on');
    const loop = (): void => {
      if (sb) sb.textContent = String(streak);
      if (bal) bal.textContent = money.toLocaleString();
      if (pts) pts.textContent = '+0';
      if (res) { res.classList.remove('pop'); void res.offsetWidth; res.classList.add('pop'); }
      later(450, () => { if (pts) countTo(pts, 0, 40, 700, v => '+' + v); SFX.play('tick'); });
      later(1250, () => {
        if (!pts) return;
        const a = pos(w, pts), z = pos(w, wl.querySelector('.coin')!);
        SFX.play('coin');
        coins.forEach((c, k) => {
          c.style.transition = 'none'; c.style.left = (a.x + (k - 2) * 10) + 'px'; c.style.top = a.y + 'px';
          c.style.opacity = '1'; c.style.transform = 'scale(.6)'; void c.offsetWidth;
          c.style.transition = `left .65s cubic-bezier(.5,0,.6,1) ${k * .07}s,top .65s cubic-bezier(.3,-.5,.6,1) ${k * .07}s,transform .65s ${k * .07}s,opacity .15s ${.6 + k * .07}s`;
          c.style.left = z.x + 'px'; c.style.top = z.y + 'px'; c.style.transform = 'scale(1)'; c.style.opacity = '0';
        });
      });
      later(1950, () => {
        if (bal) countTo(bal, money, money + 40, 600, v => v.toLocaleString());
        money += 40;
        wl.classList.remove('bump'); void wl.offsetWidth; wl.classList.add('bump'); SFX.play('coin');
      });
      later(2800, () => {
        streak = streak >= 9 ? 1 : streak + 1;
        if (sb) sb.textContent = String(streak);
        [sb, fl, st].forEach(x => x && x.classList.remove('roll', 'big', 'bump'));
        void st.offsetWidth;
        if (sb) sb.classList.add('roll');
        if (fl) fl.classList.add('big');
        st.classList.add('bump');
        const tg = $('#wtSt'); if (tg) { tg.classList.remove('go'); void tg.offsetWidth; tg.classList.add('go'); }
        SFX.play('pop');
      });
      later(4900, loop);
    };
    loop();
  }
  function s4(): void {
    const w = $('#wtW4'), t = $('#wtT4'), pc = $('#wtPc'), trk = $('#wtTrk');
    if (!w || !t || !pc || !trk) return;
    const pts = [...w.querySelectorAll<HTMLElement>('.pt')], stps = [...trk.querySelectorAll<HTMLElement>('.stp')];
    const setStep = (n: number): void => {
      stps.forEach((s, k) => {
        s.className = 'stp ' + (k < n ? 'done' : k === n ? 'now' : '');
        s.querySelector('.dot')!.innerHTML = k < n ? ck : '';
      });
      trk.style.setProperty('--tp', String(Math.max(0, n) / 3));
    };
    const loop = (): void => {
      pts.forEach(p => p.classList.remove('on')); pc.classList.add('off'); setStep(-1);
      later(600, () => tapAt(t, w, pts[0], () => { pts[0].classList.add('on'); SFX.play('coin'); }));
      later(1900, () => { t.classList.remove('show'); pc.classList.remove('off'); SFX.play('whoosh'); });
      later(2400, () => setStep(0)); later(3000, () => setStep(1));
      later(3600, () => { setStep(2); SFX.play('pop'); });
      later(6000, loop);
    };
    loop();
  }
  const SCENES = [s1, s2, s3, s4];
  function runScene(n: number): void { stopScene(); if (el.classList.contains('open')) SCENES[n]() }

  function go(n: number, silent?: boolean): void {
    i = clamp(n, 0, STEPS.length - 1);
    track.style.transform = `translateX(${-i * 100}%)`;
    slides.forEach((s, k) => {
      const on = k === i;
      s.setAttribute('aria-hidden', String(!on));
      s.inert = !on;
      if (on) { s.classList.remove('on'); void s.offsetWidth; s.classList.add('on'); } else s.classList.remove('on');
    });
    bars.forEach((b, k) => b.classList.toggle('done', k <= i));
    const back = $('#wtBack'); if (back) back.toggleAttribute('disabled', i === 0);
    const last = i === STEPS.length - 1, nx = $('#wtNext');
    if (nx) {
      nx.classList.toggle('last', last);
      nx.innerHTML = last
        ? `<span>LET'S GO!</span>${bolt.replace('#1b1c19', 'currentColor')}`
        : '<span>NEXT</span><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
      nx.setAttribute('aria-label', last ? 'Finish and start playing' : 'Next step');
    }
    runScene(i);
    if (!silent) { SFX.play('whoosh'); buzz(); }
  }
  function open(): void {
    el.classList.add('open');
    go(0, true);
    setTimeout(() => $('#wtNext')?.focus({ preventScroll: true }), 400);
  }
  /** finish=true → celebrate; always mark + head home. */
  function close(fin: boolean): void {
    wtMark();
    stopScene();
    if (fin) { SFX.play('win'); confetti(); setTimeout(goHome, 1000); }
    else setTimeout(goHome, 120);
    el.classList.remove('open');
  }
  $('#wtNext')?.addEventListener('click', () => { if (i < STEPS.length - 1) go(i + 1); else close(true); });
  $('#wtBack')?.addEventListener('click', () => go(i - 1));
  $('#wtSkip')?.addEventListener('click', () => { buzz(); close(false); });
  addEventListener('keydown', e => {
    if (!el.classList.contains('open')) return;
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'Escape') close(false);
  });
  // swipe
  let sx: number | null = null, sy = 0, dx = 0, mv = false;
  track.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; dx = 0; mv = false; });
  track.addEventListener('pointermove', e => {
    if (sx === null) return;
    dx = e.clientX - sx;
    if (!mv) {
      if (Math.abs(dx) < 10) return;
      if (Math.abs(e.clientY - sy) > Math.abs(dx)) { sx = null; return }
      mv = true; track.classList.add('drag');
      try { track.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    }
    const w = track.offsetWidth || 390;
    track.style.transform = `translateX(calc(${-i * 100}% + ${dx / (track.getBoundingClientRect().width / w)}px))`;
  });
  const up = (): void => {
    if (sx === null) return;
    sx = null; track.classList.remove('drag');
    if (mv && Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); else go(i, true);
  };
  track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);

  /* open unless already completed (the head script usually bailed earlier) */
  if (force || !wtSeen()) open(); else goHome();
})();
