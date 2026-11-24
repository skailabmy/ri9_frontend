/* RI9 · CHALLENGE LOBBY logic — ported from the prototype
   (references/index.html, #s-lobby block: prize podium + chase
   strip + setup bar + picker sheet). The prototype was a
   hash-navigated single document; here the lobby is its own
   page, so nav('home') becomes a real redirect to index.html.

   LIVE (top 3 + your standing): the podium and the your-rank /
   chase strips come from GET /api/v1/leaderboard/summary —
   challenge.ts fetches it and writes it into the zustand store
   (useAppStore.lbSummary); we repaint whenever it changes. No
   mock fallback: until it lands (or when the API fails) text
   renders as "—" / "Open seat" and numerals as 0. Still mock:
   the prize pool (`CHP`) and past winners (`PWIN`). */
import { useAppStore } from '../../store/app';

export function mount() {

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s);
  const replay = (el, c) => { if (reduce) return; el.classList.remove(c); void el.offsetWidth; el.classList.add(c) };

  /* ===================== SFX ENGINE (synthesised, no files) ===================== */
  const SFX = (() => { let ctx = null, out = null, on = true, nb = null; try { on = localStorage.getItem('sfx') !== '0' } catch (_) { }
    function init() { if (ctx) return ctx; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; out = ctx.createGain(); out.gain.value = .6; out.connect(comp); comp.connect(ctx.destination); return ctx }
    const unlock = () => { const c = init(); if (c && c.state === 'suspended') c.resume() };
    ['pointerdown', 'touchend', 'keydown'].forEach(ev => addEventListener(ev, unlock, { passive: true, capture: true }));
    const ok = () => on && ctx && ctx.state === 'running';
    function tone(f, o = {}) { if (!ok()) return; const { t = 0, d = .12, type = 'sine', v = .3, to = null, a = .004 } = o, t0 = ctx.currentTime + t, os = ctx.createOscillator(), g = ctx.createGain();
      os.type = type; os.frequency.setValueAtTime(f, t0); if (to) os.frequency.exponentialRampToValueAtTime(to, t0 + d);
      g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(.0001, t0 + d); os.connect(g); g.connect(out); os.start(t0); os.stop(t0 + d + .03) }
    function nz(o = {}) { if (!ok()) return; const { t = 0, d = .15, v = .2, f = 2000, to = null, q = 1, type = 'bandpass' } = o, t0 = ctx.currentTime + t;
      if (!nb) { nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const x = nb.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1 }
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = nb; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t0); if (to) fl.frequency.exponentialRampToValueAtTime(to, t0 + d);
      g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + d); s.connect(fl); fl.connect(g); g.connect(out); s.start(t0); s.stop(t0 + d + .03) }
    const P = {
      tap() { tone(1650, { d: .035, type: 'triangle', v: .1, to: 1100 }) },
      whoosh() { nz({ d: .24, v: .09, f: 500, to: 3200, q: .7 }) }, // screen-transition swoosh — same as reference
      pop() { tone(380, { d: .1, v: .28, to: 880 }) },
      tick() { tone(1400, { d: .025, type: 'square', v: .04 }) },
      coin() { tone(950, { d: .07, v: .2, to: 1500 }); tone(1900, { d: .2, v: .14, to: 2500, t: .05 }) }, // prize-pick chime — same as reference
      sparkle() { [880, 1320, 1760, 2640].forEach((f, i) => tone(f, { d: .14, v: .11, to: f * 1.25, t: i * .06, type: 'triangle' })) } // prize locked-in — same as reference
    };
    return { play(k, ...a) { try { P[k] && P[k](...a) } catch (_) { } }, get on() { return on }, set(v) { on = !!v; try { localStorage.setItem('sfx', on ? '1' : '0') } catch (_) { } } };
  })();
  window.SFX = SFX;
  const buzz = () => { SFX.play('tap'); try { navigator.vibrate && navigator.vibrate(10) } catch (e) { } };

  /* ---------- stage fit (390×820 scaled to viewport) ---------- */
  function fit() { const vp = $('#vp'), vw = vp.clientWidth, vh = vp.clientHeight;
    let s = Math.min(vw / 390, vh / 812, 1.5); const W = Math.min(vw / s, 520), H = vh / s;
    document.documentElement.style.setProperty('--s', s.toFixed(4)); document.documentElement.style.setProperty('--W', W.toFixed(1)); document.documentElement.style.setProperty('--H', H.toFixed(1));
    document.documentElement.style.setProperty('--ox', ((vw - W * s) / 2).toFixed(1) + 'px') }
  fit(); addEventListener('resize', fit); window.visualViewport && visualViewport.addEventListener('resize', fit);

  /* ---------- speed streaks on the arena backdrop ---------- */
  document.querySelectorAll('.emb').forEach(cv => {
    const x = cv.getContext('2d'); let W = 0, H = 0, P = [], last = 0;
    function size() { const d = Math.min(2, devicePixelRatio || 1); W = cv.offsetWidth; H = cv.offsetHeight; cv.width = W * d; cv.height = H * d; x.setTransform(d, 0, 0, d, 0, 0) }
    function spawn(init) { const lime = Math.random() < .28, len = 40 + Math.random() * 150;
      return { x: init ? Math.random() * (W + len) : W + len * Math.random(), y: Math.random() * H, len, v: 5 + Math.random() * 9 + (len / 40), w: lime ? 1.6 + Math.random() : 0.8 + Math.random() * 1.2, lime, a: lime ? .45 + Math.random() * .3 : .09 + Math.random() * .09 } }
    function draw(dt) { x.clearRect(0, 0, W, H); x.lineCap = 'round';
      P.forEach(p => { p.x -= p.v * dt; const g = x.createLinearGradient(p.x, 0, p.x + p.len, 0); const c = p.lime ? '154,206,24' : '27,28,25';
        g.addColorStop(0, `rgba(${c},${p.a})`); g.addColorStop(1, `rgba(${c},0)`); x.strokeStyle = g; x.lineWidth = p.w; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x + p.len, p.y); x.stroke() });
      P = P.filter(p => p.x + p.len > -10); while (P.length < 42) P.push(spawn(false)) }
    function f(t) { const dt = last ? Math.min(3, (t - last) / 16.7) : 1; last = t;
      if (!W || W !== cv.offsetWidth) { size(); P = Array.from({ length: 42 }, () => spawn(true)) }
      if (reduce) { if (!cv._drawn) { draw(0); cv._drawn = 1 } } else draw(dt);
      requestAnimationFrame(f) }
    addEventListener('resize', () => { W = 0 }); requestAnimationFrame(f);
  });

  /* ---------- toast (challenge.ts surfaces API failures through the
     store's showToast; the popup repaints on toastSeq ticks) ---------- */
  let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1700) }
  let lastToastSeq = useAppStore.getState().toastSeq;
  useAppStore.subscribe(s => { if (s.toastSeq !== lastToastSeq) { lastToastSeq = s.toastSeq; toast(s.toastMsg || '') } });

  /* ===================== MOCK DATA (swap for real endpoints) ===================== */
  /* entity map built with unicode escapes so the literal sequences
     survive any HTML round-trip of this source file */
  const esc = s => s.replace(/[&<>"']/g, c => ({ '\u0026': '\u0026amp;', '\u003c': '\u0026lt;', '\u003e': '\u0026gt;', '"': '\u0026quot;', "'": '\u0026#39;' }[c]));
  const ini = n => n.split(' ').filter(w => w.length > 1).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  /* seeded rng (mulberry32) — same as the reference so numbers match the prototype */
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

  const PEOPLE = [['Aisyah Rahman'], ['Tan Wei Jie'], ['Arjun Nair'], ['Nurul Huda'], ['Daniel Lim'], ['Siti Mariam'], ['Haziq Iskandar'], ['Ong Mei Ling'], ['Kavitha Raj'], ['Amir Hakim'], ['Lee Jia Xin'], ['Farah Aina'], ['Muhammad Danish'], ['Priya Devi']];
  const TINT = ['#e4f5b8', '#ffd9b8', '#cfe3ff', '#ffd0dc', '#ddd2ff', '#c7f1df', '#fff0a8', '#e9e6dc'];

  const SUBJ = [
    { name: 'Mathematics', ico: `<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M5.5 5.5l3 3M8.5 5.5l-3 3"/><rect x="13" y="3" width="8" height="8" rx="2"/><path d="M15 7h4"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M7 15v4M5 17h4"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M15 17h4"/>` },
    { name: 'Science', ico: `<path d="M9 3h6M10 3v5.5L5.5 17a2.5 2.5 0 0 0 2.3 3.5h8.4a2.5 2.5 0 0 0 2.3-3.5L14 8.5V3"/><path d="M7.5 14h9"/>` },
    { name: 'English', ico: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5M20 18v3H6.5"/>` },
    { name: 'History', ico: `<path d="M7 3h10M7 21h10M8 3c0 4 8 5 8 9s-8 5-8 9M16 3c0 4-8 5-8 9s8 5 8 9"/>` }
  ];
  /* ---------- academic years + chapters (ported verbatim from the
     reference's YEARS/CH_BY_YEAR — MOCK: real curriculum catalog
     endpoint replaces both) ---------- */
  const YEARS = [
    ...[1, 2, 3, 4, 5, 6].map(n => ({ id: 'kssr' + n, n, label: `KSSR Year ${n}`, short: `Year ${n}`, cur: 'KSSR · Malaysia' })),
    ...[4, 5, 6].map(n => ({ id: 'cam' + n, n, label: `Cambridge Primary Year ${n}`, short: `Cambridge Y${n}`, cur: 'Cambridge Primary' })),
    ...[4, 5, 6].map(n => ({ id: 'ib' + n, n, label: `IB Primary Years Programme Year ${n}`, short: `IB PYP Y${n}`, cur: 'IB Primary Years' }))
  ];
  const yr = () => YEARS.find(y => y.id === lob.year);
  const CH_BY_YEAR = {
    1: { 0: ['Numbers to 100', 'Addition within 100', 'Subtraction within 100', 'Money', 'Time', 'Shapes'], 1: ['Alphabet & Phonics', 'My Family', 'Animals', 'Colours & Shapes', 'Simple Sentences'], 2: ['Bunyi Huruf', 'Suku Kata', 'Kata Nama', 'Ayat Mudah', 'Membaca'], 3: ['My Senses', 'Living & Non-living', 'Plants Around Us', 'Animals Around Us', 'Materials'] },
    2: { 0: ['Numbers to 1000', 'Addition & Subtraction', 'Multiplication', 'Division', 'Fractions', 'Money', 'Time', 'Length & Mass'], 1: ['Nouns', 'Verbs', 'Adjectives', 'Singular & Plural', 'Reading Stories', 'Writing Sentences'], 2: ['Kata Kerja', 'Kata Adjektif', 'Kata Ganti Nama', 'Imbuhan Awalan', 'Pemahaman'], 3: ['Humans', 'Animals', 'Plants', 'Magnets', 'Absorption'] },
    3: { 0: ['Numbers to 10 000', 'Four Operations', 'Fractions', 'Decimals', 'Money', 'Time', 'Measurement', 'Shapes & Space'], 1: ['Present Tense', 'Past Tense', 'Prepositions', 'Conjunctions', 'Reading', 'Punctuation'], 2: ['Tatabahasa', 'Kosa Kata', 'Imbuhan', 'Kata Sendi', 'Ayat Majmuk', 'Pemahaman'], 3: ['Living Things Needs', 'Animal Groups', 'Plant Growth', 'Light & Shadow', 'Soil', 'Earth'] },
    4: { 0: ['Whole Numbers', 'Fractions', 'Decimals', 'Percentages', 'Money', 'Time', 'Measurement', 'Data Handling'], 1: ['Tenses', 'Vocabulary', 'Prepositions', 'Punctuation', 'Reading', 'Phrasal Verbs'], 2: ['Tatabahasa', 'Kosa Kata', 'Imbuhan', 'Peribahasa', 'Kata Sendi', 'Pemahaman'], 3: ['Living Things', 'Energy', 'Electricity', 'Light', 'Materials', 'Earth & Space'] },
    5: { 0: ['Numbers to 1 000 000', 'Fractions, Decimals & Percentages', 'Money', 'Time', 'Length, Mass & Volume', 'Space', 'Coordinates', 'Ratio', 'Data Handling'], 1: ['Reported Speech', 'Modal Verbs', 'Comparatives', 'Reading Comprehension', 'Idioms', 'Grammar Review'], 2: ['Simpulan Bahasa', 'Peribahasa', 'Ayat Aktif & Pasif', 'Penjodoh Bilangan', 'Karangan', 'Pemahaman'], 3: ['Microorganisms', 'Food Chains', 'Light Energy', 'Electricity Circuits', 'Heat', 'States of Matter', 'The Moon'] },
    6: { 0: ['Whole Numbers & Operations', 'Fractions', 'Decimals', 'Percentages', 'Money & Savings', 'Time & Duration', 'Measurement', 'Space & Geometry', 'Data & Probability'], 1: ['Tenses Mastery', 'Passive Voice', 'Direct & Indirect Speech', 'Literary Texts', 'Summary Writing', 'Exam Practice'], 2: ['Tatabahasa Lanjutan', 'Peribahasa', 'Pemahaman Puisi', 'Karangan Fakta', 'Ringkasan', 'Latihan UPSR'], 3: ['Interactions Among Living Things', 'Forces', 'Speed', 'Food Preservation', 'Waste Management', 'Eclipses', 'Constellations'] }
  };
  const CHAPTERS = {};
  function setYear(id) { lob.year = id; const n = YEARS.find(y => y.id === id).n; Object.keys(CH_BY_YEAR[n]).forEach(k => CHAPTERS[k] = CH_BY_YEAR[n][k]) }

  /* No mock leaderboard: the lobby renders only what the summary
     API returns — "—"/0 placeholders otherwise. */
  const lob = { subj: 0, ch: 0, period: 'today', year: 'kssr4' };
  setYear('kssr4');

  /* ---------- LIVE leaderboard — GET /api/v1/leaderboard/summary ----------
     challenge.ts fetches the summary (top-3 podium and the signed-in
     player's standing for the ongoing board) and writes it into the
     zustand store (useAppStore.lbSummary) — or `null` on failure,
     which renders "—"/0 placeholders (no mock fallback).
     Only top-3 + standing are wired; ranks 4–10 stay empty until
     the full weekly rankings endpoint lands (renderTop10). */
  let live = null; // normalized summary: { top: [seat|null ×3], me: {rank,my,cut,gap,pct} }
  let snapChase = false; // apply live data WITHOUT sliding the runner from the mock's old spot
  function normSummary(s) {
    if (!s || !Array.isArray(s.topThree)) return null;
    const top = [1, 2, 3].map(pos => { const r = s.topThree.find(x => x.position === pos);
      return r && r.username ? { n: r.username, c: TINT[pos % TINT.length], pts: r.points || 0 } : null });
    /* user_standing: the backend sends it whenever the request was
       authenticated — current_rank (null = unranked → shown as 0),
       current_points, top_10_threshold_points, points_to_reach_top_10.
       Null standing → zeros (no mock fallback). */
    const u = s.userStanding;
    const me = u ? {
      rank: u.currentRank != null ? u.currentRank : 0,
      my: u.currentPoints || 0,
      cut: u.top10ThresholdPoints || 0,
      gap: Math.max(0, u.pointsToReachTop10 || 0),
      pct: u.isTopTen || (u.pointsToReachTop10 || 0) === 0 ? 100
        : (u.currentPoints || 0) === 0 ? 0 // zero points → runner pinned at the start
        : u.top10ThresholdPoints ? Math.max(8, Math.min(78, (u.currentPoints || 0) / u.top10ThresholdPoints * 80)) : 8,
    } : { rank: 0, my: 0, cut: 0, gap: 0, pct: 0 };
    return { top, me };
  }
  /* bridge: challenge.ts writes GET /api/v1/leaderboard/summary into
     the store — repaint whenever lbSummary changes (and seed from
     whatever is already there if it landed before mount) */
  let lastSummary = useAppStore.getState().lbSummary;
  /* the header's LIVE · RESETS countdown target: the summary's
     end_date (board-window end from the endpoint) — null while
     no summary has landed, so the clock shows --:--:-- */
  let resetAt = lastSummary?.endDate ? new Date(lastSummary.endDate) : null;
  if (lastSummary) { live = normSummary(lastSummary); snapChase = true }
  useAppStore.subscribe(s => {
    if (s.lbSummary === lastSummary) return;
    lastSummary = s.lbSummary;
    live = normSummary(lastSummary);
    resetAt = lastSummary?.endDate ? new Date(lastSummary.endDate) : null;
    snapChase = true; // snap: no 1.2s slide from wherever the mock had left the runner
    renderLobby(true);
  });
  /* podium seats: live top-3, otherwise all-null ("—" / 0) seats */
  function podiumPeople() { return live ? live.top : [null, null, null] }

  /* ---------- prize catalog + art — MOCK: static pool until the prizes
     endpoint lands. Same catalog as the reference (PRIZES 1-3 podium
     prizes, CHP[4] = 4th-10th consolation pool). ---------- */
  const PA = {
    console: `<svg viewBox="0 0 64 64"><rect x="4" y="16" width="56" height="32" rx="12" fill="#2d2f2a"/><rect x="18" y="20" width="28" height="22" rx="3" fill="#7fd1ff"/><rect x="18" y="20" width="28" height="7" fill="#b3e6ff"/><circle cx="11" cy="28" r="3.4" fill="#ff5a4e"/><path d="M9 38h6M12 35v6" stroke="#c6f432" stroke-width="2.6" stroke-linecap="round"/><circle cx="53" cy="27" r="2.6" fill="#ffd25e"/><circle cx="53" cy="37" r="2.6" fill="#c6f432"/></svg>`,
    tablet: `<svg viewBox="0 0 64 64"><rect x="10" y="8" width="38" height="48" rx="5" fill="#2d2f2a"/><rect x="14" y="13" width="30" height="38" rx="2" fill="#fff"/><path d="M48 44l8 8M52 40l6 6-12-2z" fill="#ff8a3d" stroke="#1b1c19" stroke-width="2"/><path d="M20 22h14M20 28h18M20 34h10" stroke="#8f7cff" stroke-width="2.6" stroke-linecap="round"/></svg>`,
    watch: `<svg viewBox="0 0 64 64"><rect x="22" y="4" width="20" height="10" rx="4" fill="#2d2f2a"/><rect x="22" y="50" width="20" height="10" rx="4" fill="#2d2f2a"/><rect x="16" y="16" width="32" height="32" rx="10" fill="#2d2f2a"/><rect x="21" y="21" width="22" height="22" rx="7" fill="#c6f432"/><path d="M32 26v6l4 3" stroke="#1b1c19" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`,
    scooter: `<svg viewBox="0 0 64 64"><circle cx="14" cy="48" r="8" fill="none" stroke="#2d2f2a" stroke-width="4"/><circle cx="50" cy="48" r="8" fill="none" stroke="#2d2f2a" stroke-width="4"/><path d="M14 48h30l8-24h6M52 20l-6 28" fill="none" stroke="#c6f432" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="44" y="40" width="14" height="6" rx="3" fill="#ff5a4e"/></svg>`,
    camera: `<svg viewBox="0 0 64 64"><rect x="8" y="18" width="48" height="34" rx="7" fill="#2d2f2a"/><rect x="24" y="12" width="16" height="8" rx="3" fill="#2d2f2a"/><circle cx="32" cy="34" r="10" fill="#c6f432" stroke="#1b1c19" stroke-width="2.4"/><circle cx="32" cy="34" r="5" fill="#7fd1ff"/><circle cx="49" cy="26" r="2.6" fill="#ff5a4e"/><rect x="12" y="44" width="12" height="4" rx="2" fill="#ffd25e"/></svg>`,
    headset: `<svg viewBox="0 0 64 64"><path d="M12 36v-4a20 20 0 0 1 40 0v4" fill="none" stroke="#2d2f2a" stroke-width="5" stroke-linecap="round"/><rect x="8" y="34" width="12" height="18" rx="6" fill="#c6f432" stroke="#2d2f2a" stroke-width="2.4"/><rect x="44" y="34" width="12" height="18" rx="6" fill="#c6f432" stroke="#2d2f2a" stroke-width="2.4"/><path d="M50 52c0 6-8 8-14 8" fill="none" stroke="#2d2f2a" stroke-width="3" stroke-linecap="round"/></svg>`,
    earbuds: `<svg viewBox="0 0 64 64"><rect x="10" y="26" width="24" height="22" rx="8" fill="#fff" stroke="#2d2f2a" stroke-width="3"/><circle cx="22" cy="37" r="4" fill="#8f7cff"/><circle cx="44" cy="20" r="9" fill="#fff" stroke="#2d2f2a" stroke-width="3"/><path d="M44 29v20a5 5 0 0 1-10 0" fill="none" stroke="#2d2f2a" stroke-width="3"/></svg>`,
    speaker: `<svg viewBox="0 0 64 64"><rect x="20" y="14" width="24" height="40" rx="10" fill="#2d2f2a"/><ellipse cx="32" cy="46" rx="7" ry="4" fill="#c6f432"/><circle cx="32" cy="24" r="3" fill="#ff5a4e"/><circle cx="32" cy="33" r="3" fill="#ffd25e"/><path d="M50 22c3 5 3 11 0 16M54 18c5 8 5 16 0 24" fill="none" stroke="#8f7cff" stroke-width="2.6" stroke-linecap="round"/></svg>`,
    pad: `<svg viewBox="0 0 64 64"><path d="M14 22h36c7 0 10 6 10 13s-3 13-9 13c-4 0-6-3-9-6H22c-3 3-5 6-9 6-6 0-9-6-9-13s3-13 10-13z" fill="#2d2f2a"/><circle cx="18" cy="34" r="6" fill="none" stroke="#c6f432" stroke-width="3"/><circle cx="46" cy="30" r="2.8" fill="#ff5a4e"/><circle cx="52" cy="37" r="2.8" fill="#ffd25e"/></svg>`,
    blocks: `<svg viewBox="0 0 64 64"><rect x="10" y="42" width="18" height="14" rx="3" fill="#ff5a4e" stroke="#1b1c19" stroke-width="2.2"/><rect x="34" y="42" width="18" height="14" rx="3" fill="#7fd1ff" stroke="#1b1c19" stroke-width="2.2"/><rect x="22" y="24" width="18" height="14" rx="3" fill="#ffd25e" stroke="#1b1c19" stroke-width="2.2"/><rect x="22" y="6" width="18" height="14" rx="3" fill="#c6f432" stroke="#1b1c19" stroke-width="2.2"/></svg>`,
    credit: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#ffd25e" stroke="#1b1c19" stroke-width="3"/><circle cx="32" cy="32" r="19" fill="none" stroke="#c9971c" stroke-width="2.4" stroke-dasharray="4 5"/><text x="32" y="37.5" text-anchor="middle" font-family="Anton,Arial Narrow,sans-serif" font-size="13" fill="#1b1c19">RM30</text></svg>`,
    plush: `<svg viewBox="0 0 64 64"><circle cx="18" cy="14" r="8" fill="#c98d5a" stroke="#1b1c19" stroke-width="2.2"/><circle cx="46" cy="14" r="8" fill="#c98d5a" stroke="#1b1c19" stroke-width="2.2"/><circle cx="32" cy="28" r="18" fill="#c98d5a" stroke="#1b1c19" stroke-width="2.2"/><ellipse cx="32" cy="34" rx="9" ry="7" fill="#ffd9b8"/><circle cx="26" cy="25" r="2.2" fill="#1b1c19"/><circle cx="38" cy="25" r="2.2" fill="#1b1c19"/><ellipse cx="32" cy="32" rx="3" ry="2.2" fill="#1b1c19"/></svg>`,
    credit10: `<svg viewBox="0 0 64 64"><rect x="4" y="18" width="56" height="28" rx="8" fill="#2d2f2a"/><rect x="14" y="24" width="36" height="16" rx="3" fill="#c6f432"/><text x="32" y="36.5" text-anchor="middle" font-family="Anton,Arial Narrow,sans-serif" font-size="12" fill="#1b1c19">RM10</text><circle cx="10" cy="32" r="2.4" fill="#ffd25e"/><circle cx="54" cy="32" r="2.4" fill="#ffd25e"/></svg>`,
    stickers: `<svg viewBox="0 0 64 64"><path d="M32 6l6.6 13.4L53 21.5l-10.5 10.2 2.5 14.5L32 39.2 19 46.2l2.5-14.5L11 21.5l14.4-2.1z" fill="#ffd25e" stroke="#1b1c19" stroke-width="2.4" stroke-linejoin="round"/><circle cx="47" cy="46" r="10" fill="#8f7cff" stroke="#1b1c19" stroke-width="2.2"/><path d="M43.5 46l2.6 2.6 4.6-5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    bottle: `<svg viewBox="0 0 64 64"><path d="M27 4h10v6h-10z" fill="#2d2f2a"/><path d="M25 12h14c0 5 6 8 6 15v24a6 6 0 0 1-6 6H25a6 6 0 0 1-6-6V27c0-7 6-10 6-15z" fill="#7fd1ff" stroke="#2d2f2a" stroke-width="2.4"/><rect x="19" y="32" width="26" height="10" fill="#ffffff88"/><path d="M19 37h26" stroke="#2d2f2a" stroke-width="1.6"/></svg>`,
    snack: `<svg viewBox="0 0 64 64"><rect x="8" y="18" width="48" height="30" rx="6" fill="#ff5a4e" stroke="#1b1c19" stroke-width="2.4"/><path d="M8 26c8 5 40 5 48 0M8 40c8-5 40-5 48 0" stroke="#1b1c19" stroke-width="1.8" fill="none"/><circle cx="32" cy="33" r="7" fill="#ffd25e" stroke="#1b1c19" stroke-width="2"/></svg>`,
    books: `<svg viewBox="0 0 64 64"><path d="M32 12c-4-3-10-4-16-4v40c6 0 12 1 16 4 4-3 10-4 16-4V8c-6 0-12 1-16 4z" fill="#8f7cff" stroke="#1b1c19" stroke-width="2.4" stroke-linejoin="round"/><path d="M32 12v40" stroke="#1b1c19" stroke-width="2"/><text x="32" y="34" text-anchor="middle" font-family="Anton,Arial Narrow,sans-serif" font-size="11" fill="#fff">RM20</text></svg>`,
    art: `<svg viewBox="0 0 64 64"><path d="M12 52L44 20l-8-8L8 40v12z" fill="#ff8a3d" stroke="#1b1c19" stroke-width="2.4" stroke-linejoin="round"/><path d="M44 20l8-8-8-8-8 8" fill="#ff5a4e" stroke="#1b1c19" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 40v12h12" fill="#ffd25e" stroke="#1b1c19" stroke-width="2.4" stroke-linejoin="round"/></svg>`
  };
  /* same catalog tuples as the reference: [artKey, label, note, bg] */
  const PRIZES = {
    1: [['console', 'Handheld game console', 'Worth RM1,200', '#e8f4ff'], ['tablet', '10" drawing tablet', 'Worth RM900', '#fff6d6'], ['watch', 'Kids smartwatch', 'Worth RM650', '#efeaff'], ['scooter', 'Kick scooter', 'Worth RM500', '#ffe9e6'], ['camera', 'Instant photo camera', 'Worth RM450', '#ffe9f0'], ['headset', 'Pro gaming headset', 'Worth RM480', '#f1fad6']],
    2: [['earbuds', 'Wireless earbuds', 'Worth RM300', '#f3f5f0'], ['speaker', 'Smart speaker', 'Worth RM250', '#e8f4ff'], ['pad', 'Game controller', 'Worth RM280', '#f1fad6'], ['blocks', 'Building block set', 'Worth RM220', '#fff6d6'], ['headset', 'Gaming headset', 'Worth RM200', '#efeaff'], ['art', 'Pro art & sketch kit', 'Worth RM180', '#fff0e3']],
    3: [['credit', 'RM30 game credit', 'Digital code', '#f1fad6'], ['books', 'Book voucher bundle', 'Worth RM80', '#efeaff'], ['art', 'Deluxe art set', 'Worth RM90', '#fff0e3'], ['plush', 'Giant plush bear', 'Worth RM70', '#ffe9e6'], ['blocks', 'Mini building set', 'Worth RM60', '#fff6d6'], ['earbuds', 'Wired earphones', 'Worth RM50', '#f3f5f0']]
  };
  const CHP = { 1: PRIZES[1], 2: PRIZES[2], 3: PRIZES[3], 4: [['credit10', 'RM10 game credit', 'Digital code', '#f1fad6'], ['stickers', 'Mega sticker pack', '50+ stickers', '#fff6d6'], ['bottle', 'Sports water bottle', 'Worth RM35', '#e8f4ff'], ['snack', 'Snack party box', 'Worth RM30', '#ffe9e6'], ['books', 'RM20 book voucher', 'Digital voucher', '#efeaff'], ['art', 'Colour pencil set', 'Worth RM25', '#fff0e3']] };
  const PLACE2 = { 1: '1ST', 2: '2ND', 3: '3RD', 4: '4TH–10TH' };
  const MEDV = { 1: '--m1:#f4ffc4;--m2:#c6f432;--m3:#8fbf12;--mt:#2f4d05', 2: '--m1:#ffffff;--m2:#d3d8cc;--m3:#8d9585;--mt:#3c4236', 3: '--m1:#ffe2c4;--m2:#eaa874;--m3:#b9733a;--mt:#5a2f0f', 4: '--m1:#f4ffc4;--m2:#c6f432;--m3:#8fbf12;--mt:#2f4d05' };
  const PLUS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
  const crown = '<svg class="cr3" viewBox="0 0 40 28"><defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset=".55" stop-color="#f2c94c"/><stop offset="1" stop-color="#c9971c"/></linearGradient></defs><path d="M4 25 2 7l10 8L20 2l8 13 10-8-2 18z" fill="url(#gold)" stroke="#8a6410" stroke-width="1.6" stroke-linejoin="round"/><circle cx="20" cy="17" r="2.6" fill="#ff5a4e"/><circle cx="11" cy="19" r="1.6" fill="#8f7cff"/><circle cx="29" cy="19" r="1.6" fill="#8f7cff"/></svg>';
  /* the user's current prize picks (seat → catalog index). MOCK: in-memory
     only — every fresh load starts unpicked ("PICK PRIZE"), like a brand-new
     account. REPLACE with the profile's saved picks from the API. */
  let chPicks = { 1: null, 2: null, 3: null, 4: null };
  const savePicks = () => { /* TODO: PUT /api/challenge/prize-picks */ };

  function countUpAll(root, delay) { root.querySelectorAll('[data-count]').forEach(el => { const to = +el.dataset.count; if (reduce) { el.textContent = to.toLocaleString(); return } const t0 = performance.now() + (delay || 0); el.textContent = '0'; (function f(t) { const p = Math.max(0, Math.min(1, (t - t0) / 1000)), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e).toLocaleString(); if (p < 1) requestAnimationFrame(f) })(performance.now()) }) }

  /* ===================== RENDER: prize podium + 4-10 base ===================== */
  function renderPodiumPrizes(got) {
    const b = podiumPeople();
    const seat = k => { const p = b[k - 1], pk = chPicks[k], it = pk != null ? CHP[k][pk] : null;
      const top = p ? `${k === 1 ? crown : ''}<span class="fr"><span class="av3" style="background:${p.c}">${ini(p.n)}</span></span><span class="nm">${esc(p.n.split(' ')[0])}</span><span class="lpt" data-count="${p.pts}">${p.pts.toLocaleString()}</span>`
        : `<span class="open"><b>?</b></span><span class="nm">—</span><span class="lpt">0</span>`;
      return `<div class="ls r${k}" style="${MEDV[k]}"><div class="lsu">${top}</div>
        <button class="ped${got === k ? ' got' : ''}" data-chp="${k}" style="${MEDV[k]}" aria-label="${PLACE2[k]} place prize${it ? ': ' + esc(it[1]) : ', choose one'}"><span class="rk">${k}</span><span class="rays"></span>
          ${it ? `<span class="pa">${PA[it[0]]}</span><span class="pnm">${esc(it[1])}</span>` : `<span class="pa plus">${PLUS}</span><span class="pnm">PICK PRIZE</span>`}</button></div>` };
    $('#lpod').innerHTML = seat(2) + seat(1) + seat(3);
    const ci = chPicks[4], it = ci != null ? CHP[4][ci] : null, L = $('#lbase'); L.classList.toggle('got', got === 4);
    L.innerHTML = `<span class="lb-n"><b>4TH–10TH</b><small>PLACE PRIZE</small></span><span class="lb-p"><span class="art${it ? '' : ' plus'}">${it ? PA[it[0]] : PLUS}</span><b>${it ? esc(it[1]) : 'Pick prize'}</b></span>`;
  }

  /* ===================== RENDER: the chase strip ===================== */
  const UPS = '<svg viewBox="0 0 24 24"><path d="M6 14l6-6 6 6"/></svg><svg viewBox="0 0 24 24"><path d="M6 14l6-6 6 6"/></svg><svg viewBox="0 0 24 24"><path d="M6 14l6-6 6 6"/></svg>';
  const ICO_TROPHY = '<svg viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#ffd25e" stroke="#1b1c19" stroke-width="1.8"/><path d="M12 14v4M8 20h8" stroke="#1b1c19" stroke-width="2" stroke-linecap="round"/></svg>';
  /* the signed-in kid's display name: LIVE from the profile API —
     challenge.ts writes it into the zustand store (useAppStore.meName);
     the localStorage qdProfile read below is a prototype relic kept
     as fallback; 'Sean' is the prototype's demo name */
  const cap = n => { n = String(n || '').trim(); return n ? n[0].toUpperCase() + n.slice(1) : '' };
  let meNameLive = useAppStore.getState().meName || '';
  const meName = () => cap(meNameLive) || (() => { let p = {}; try { p = JSON.parse(localStorage.getItem('qdProfile') || 'null') || {} } catch (_) { } return cap(p.name) })() || 'Sean';
  /* bridge: a store.meName change (challenge.ts, profile API)
     repaints the your-rank bar even if the summary already landed */
  useAppStore.subscribe(s => {
    if ((s.meName || '') === meNameLive) return;
    meNameLive = s.meName || '';
    renderYou4(true);
  });
  /* stats for the signed-in player — LIVE from the summary's
     user_standing; zeros when no summary has landed (API failed
     or still loading) */
  function meStats() {
    return live ? live.me : { rank: 0, my: 0, cut: 0, gap: 0, pct: 0 } }
  function renderChase(anim) {
    const C = $('#chase');
    const s = meStats(), gap = s.gap, pct = s.pct;
    C.className = 'chase';
    const msg = gap > 0 ? `<span data-count="${gap}">${gap.toLocaleString()}</span> PTS TO GO`
      : s.rank > 0 && s.rank <= 10 ? 'IN THE TOP 10' : '0 PTS TO GO';
    C.innerHTML = `<div class="ch-top"><span class="ch-rk"><small>YOU</small><b>#${s.rank}</b></span>
        <span class="ch-msg"><b>${msg}</b><span>to reach the top 10 and win a prize</span></span><span class="ch-up">${UPS}</span></div>
      <div class="ch-trk"><span class="ln"></span><span class="fl" style="--x:0%"></span>
        <span class="goal"><small>TOP 10</small></span>
        <span class="run" style="--x:0%"><b>YOU</b></span></div>`;
    const go = () => { const fl = C.querySelector('.fl'), run = C.querySelector('.run');
      if (snapChase) { // snap: no 1.2s slide from wherever the mock had left the runner
        fl.style.transition = 'none'; run.style.transition = 'none' }
      fl.style.setProperty('--x', pct + '%'); run.style.setProperty('--x', pct + '%');
      if (snapChase) { snapChase = false; requestAnimationFrame(() => { fl.style.transition = ''; run.style.transition = '' }) } };
    if (anim) { countUpAll(C, 500); requestAnimationFrame(() => requestAnimationFrame(go)) } else go();
  }

  /* ===================== RENDER: top-10 list (ranks 4–10) ===================== */
  function renderTop10(anim) {
    const el = $('#alist');
    /* ranks 4–10 aren't in the summary endpoint yet — no mock rows;
       the empty state shows until the full rankings endpoint lands */
    el.innerHTML = `<div class="aempty">No ranks 4–10 yet<br>Play a challenge to fill the board</div>`;
    if (anim) replay(el, 'anim');
  }

  /* ===================== RENDER: your-rank bar ===================== */
  const ICO_FLAME = '<svg class="flame" viewBox="0 0 19 25" aria-hidden="true"><path d="M9.5 1c2.5 4.5 7 7.5 7 13a7 7 0 0 1-14 0c0-3.2 1.6-5.6 3-7.5.5 2 1.4 3.2 2.5 3.6C7.2 6.6 8 3.4 9.5 1z" fill="#ff7a3d" stroke="#d84a1a" stroke-width="1.1" stroke-linejoin="round"/></svg>';
  function renderYou4(anim) {
    const el = $('#you4');
    el.style.display = '';
    const s = meStats(), nm = meName();
    el.innerHTML = `<span class="n4">#${s.rank}</span>
      <span class="av4">${ini(nm)}</span>
      <span class="w4"><b>${esc(nm)}${ICO_FLAME}</b><small>${s.gap > 0 ? s.gap.toLocaleString() + ' PTS TO TOP 10' : s.rank > 0 && s.rank <= 10 ? 'IN THE TOP 10' : '0 PTS TO TOP 10'}</small></span>
      <span class="p4" data-count="${s.my}">${s.my.toLocaleString()}</span>`;
    if (anim) countUpAll(el, 700);
  }

  function renderLobby(anim) {
    renderPodiumPrizes();
    renderTop10(anim);
    renderYou4(anim);
    renderChase(anim);
    const pod = $('#lpod'); if (anim) { replay(pod, 'anim'); countUpAll(pod, 600) }
  }

  /* ===================== SETUP BAR (subject + chapter) ===================== */
  function renderFields() {
    const s = SUBJ[lob.subj], chs = CHAPTERS[lob.subj];
    $('#fSubjI').innerHTML = `<svg viewBox="0 0 24 24">${s.ico}</svg>`;
    $('#fSubjV').textContent = s.name;
    $('#fSubjL').textContent = `${yr().short.toUpperCase()} · SUBJECT`;
    $('#fChN').textContent = lob.ch + 1;
    $('#fChL').textContent = `CHAPTER ${lob.ch + 1} OF ${chs.length}`;
    $('#fChV').textContent = chs[lob.ch];
  }

  /* ===================== PICKER SHEET (subject / chapter / prize + academic year rail) ===================== */
  let pkMode = null; // 'subj' | 'ch' | prize seat 1..4
  const ck = '<span class="ck"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
  function openPicker(mode) {
    pkMode = mode; buzz();
    if (mode === 'subj') { $('#pkT').textContent = 'PICK A SUBJECT'; $('#pkS').textContent = 'STEP 1 · SUBJECT';
      $('#pkO').innerHTML = SUBJ.map((s, k) => `<button class="opt${k === lob.subj ? ' on' : ''}" data-v="${k}"><span class="oi"><svg viewBox="0 0 24 24">${s.ico}</svg></span><span>${s.name}<small class="osub">${CHAPTERS[k].length} chapters</small></span>${ck}</button>`).join('') }
    else if (mode === 'ch') { $('#pkT').textContent = 'PICK A CHAPTER'; $('#pkS').textContent = `STEP 2 · ${SUBJ[lob.subj].name.toUpperCase()}`;
      $('#pkO').innerHTML = CHAPTERS[lob.subj].map((c, i) => `<button class="opt${i === lob.ch ? ' on' : ''}" data-v="${i}"><span class="oi">${i + 1}</span><span>${esc(c)}</span>${ck}</button>`).join('') }
    closeYdd(); $('#pk').classList.add('open'); $('#pkBd').classList.add('open');
  }
  function closePicker() { $('#pk').classList.remove('open'); $('#pkBd').classList.remove('open'); closeYdd() }
  $('#pkBd').addEventListener('click', closePicker);
  $('#pkX').addEventListener('click', () => { buzz(); closePicker() });
  $('#pkO').addEventListener('click', e => { const o = e.target.closest('.opt'); if (!o) return; const v = +o.dataset.v; buzz();
    document.querySelectorAll('#pkO .opt').forEach(x => x.classList.toggle('on', x === o));
    if (pkMode === 'subj') { if (v !== lob.subj) { lob.subj = v; lob.ch = 0 } }
    else { lob.ch = v }
    // Reference flow: picking a subject chains straight into the chapter
    // step; picking a chapter closes and nudges the setup bar.
    setTimeout(() => { renderFields(); SFX.play('pop');
      if (pkMode === 'subj') { setTimeout(() => openPicker('ch'), 380) }
      else { closePicker(); renderLobby(true); replay($('#lbar'), 'nudge') } }, 260) });

  /* ---------- academic year rail + dropdown (ported from the reference) ---------- */
  function renderRail() { $('#ycur').textContent = yr().label; $('#ycurS').textContent = yr().cur.toUpperCase(); closeYdd();
    let g = ''; $('#ydd').innerHTML = YEARS.map(o => { const h = o.cur !== g ? `<div class="ydh">${esc(o.cur)}</div>` : ''; g = o.cur;
      return h + `<button class="yo${o.id === lob.year ? ' on' : ''}" data-y="${o.id}" role="option"><span>${esc(o.label)}</span><i><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i></button>` }).join('') }
  function openYdd() { buzz(); $('#pk').classList.add('ydd-open'); const c = $('#ydd .yo.on'); if (c) $('#ydd').scrollTop = c.offsetTop - 80 }
  function closeYdd() { $('#pk').classList.remove('ydd-open') }
  $('#ychg').addEventListener('click', () => { $('#pk').classList.contains('ydd-open') ? closeYdd() : openYdd() });
  $('#ydd').addEventListener('click', e => { const c = e.target.closest('.yo'); if (!c) return; const id = c.dataset.y; buzz();
    document.querySelectorAll('#ydd .yo').forEach(x => x.classList.toggle('on', x === c));
    const changed = id !== lob.year; if (changed) { setYear(id); lob.ch = 0; renderFields(); renderLobby(true) }
    setTimeout(() => { closeYdd(); renderRail(); replay($('#yrail'), 'bump2');
      // year change invalidates the chapter list — restart at the subject step
      if (changed && pkMode === 'ch') { setTimeout(() => { closePicker(); setTimeout(() => openPicker('subj'), 380) }, 200) } }, 200) });

  /* ---------- picker triggers ---------- */
  $('#fSubj').addEventListener('click', () => { renderRail(); openPicker('subj') });
  $('#fCh').addEventListener('click', () => { renderRail(); openPicker('ch') });
  /* prize seats open the dedicated #pzd dialog, same as the reference */
  $('#lpod').addEventListener('click', e => { const p = e.target.closest('.ped'); if (p) openPrize(+p.dataset.chp) });
  $('#lbase').addEventListener('click', () => openPrize(4));

  /* ---------- prize picker dialog (ported from the prototype #pzd) ---------- */
  let pzPlace = 1;
  function openPrize(p) {
    pzPlace = p; buzz();
    const d = $('#pzd'), ped = p === 4 ? $('#lbase') : $(`#lpod [data-chp="${p}"]`), cs = getComputedStyle(ped);
    ['--m1', '--m2', '--m3', '--mt'].forEach(v => d.style.setProperty(v, cs.getPropertyValue(v)));
    $('#pzS').innerHTML = `<i>${p === 4 ? '4+' : p}</i>${PLACE2[p]} PLACE`;
    $('#pzT').textContent = p === 4 ? 'CONSOLATION PRIZE' : 'PICK YOUR PRIZE';
    $('#pzP').textContent = p === 4 ? 'Finish anywhere from 4th to 10th today and this is yours.' : `Finish ${PLACE2[p].toLowerCase()} on today's board and this one is yours.`;
    $('#pzG').innerHTML = CHP[p].map((it, i) => `<button class="pt${chPicks[p] === i ? ' on' : ''}" data-i="${i}" style="--bgc:${it[3]};--d:${(i * .05).toFixed(2)}s"><span class="ck"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="art">${PA[it[0]]}</span><b>${esc(it[1])}</b><small>${esc(it[2])}</small></button>`).join('');
    $('#pzG').scrollTop = 0; d.classList.add('open'); $('#pzBd').classList.add('open');
  }
  function closePrize() { $('#pzd').classList.remove('open'); $('#pzBd').classList.remove('open') }
  $('#pzG').addEventListener('click', e => { const t = e.target.closest('.pt'); if (!t) return; const i = +t.dataset.i; buzz();
    document.querySelectorAll('#pzG .pt').forEach(x => x.classList.toggle('on', x === t)); SFX.play('coin');
    chPicks[pzPlace] = i; savePicks();
    setTimeout(() => { closePrize(); setTimeout(() => { renderPodiumPrizes(pzPlace); SFX.play('sparkle'); toast(`${PLACE2[pzPlace]} prize locked in: ${CHP[pzPlace][i][1]}`) }, 200) }, 280) });
  $('#pzBd').addEventListener('click', closePrize); $('#pzX').addEventListener('click', () => { buzz(); closePrize() });
  addEventListener('keydown', e => { if (e.key === 'Escape') closePrize() });

  /* ===================== TODAY / THIS WEEK segment ===================== */
  const segK = $('#segK'), segBtns = [...document.querySelectorAll('#seg button')];
  function moveSeg() { const b = document.querySelector('#seg button.on'); segK.style.width = b.offsetWidth + 'px'; segK.style.transform = `translateX(${b.offsetLeft}px)` }
  segBtns.forEach(b => b.addEventListener('click', () => { if (b.classList.contains('on')) return; buzz();
    segBtns.forEach(x => x.classList.toggle('on', x === b)); lob.period = b.dataset.p; moveSeg();
    // live: challenge.ts watches lbPeriod in the store and re-fetches
    // the summary for the new period; its arrival repaints the lobby.
    // Until then (or when the API fails) the placeholders stay up.
    useAppStore.getState().setLbPeriod(lob.period) }));
  moveSeg(); addEventListener('resize', moveSeg); document.fonts && document.fonts.ready.then(moveSeg);

  /* ===================== RESET COUNTDOWN (from the summary's end_date) ===================== */
  function tickReset() {
    if (!resetAt) { $('#resetT').textContent = '--:--:--'; return }
    let s = Math.max(0, Math.floor((resetAt - new Date()) / 1000));
    const p = n => String(n).padStart(2, '0');
    $('#resetT').textContent = `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` }
  tickReset(); setInterval(tickReset, 1000);

  /* ===================== PAST WINNERS (ported from the prototype's PWIN module) =====================
     MOCK: builds past Prize Quiz weeks + daily/weekly challenge
     leaderboards with the same seeded generator as the reference.
     REPLACE build() with: GET /api/history (quiz sessions + leaderboards). */
  const PWIN = (() => {
    const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      MONL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'],
      WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const me = () => { let p = {}; try { p = JSON.parse(localStorage.getItem('qdProfile') || 'null') || {} } catch (_) { }
      return { name: meName(), user: p.username || 'test4' } };
    const mon = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x };
    const isoWeek = d => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - n); return Math.ceil(((x - new Date(Date.UTC(x.getUTCFullYear(), 0, 1))) / DAY + 1) / 7) };
    const dd = d => `${d.getDate()} ${MON[d.getMonth()]}`;
    // the kid's mock wins: weeks-ago -> [place, prize index]
    const QWON = { 2: [1, 3], 3: [2, 0], 5: [3, 1], 8: [3, 0] };
    const QPLAY = { 1: 9, 4: 6, 6: 14, 7: 22, 9: null };   // other weeks: finishing rank, or null = didn't play
    function people(r, n) { return PEOPLE.map((p, i) => ({ n: p[0], c: TINT[i % TINT.length], k: r() })).sort((a, b) => a.k - b.k).slice(0, n) }
    function build() { const out = [], today = new Date(), thisMon = mon(today), M = me();
      // weekly Prize Quiz sessions
      for (let w = 1; w <= 9; w++) { const st = new Date(thisMon.getTime() - w * 7 * DAY), en = new Date(st.getTime() + 6 * DAY), wk = isoWeek(st), r = rng(wk * 131 + 7);
        const prizes = [1, 2, 3].map(k => { let idx = Math.floor(r() * PRIZES[k].length); if (QWON[w] && QWON[w][0] === k) idx = QWON[w][1]; return PRIZES[k][idx] });
        const rank = QWON[w] ? QWON[w][0] : QPLAY[w] === undefined ? Math.floor(8 + r() * 20) : QPLAY[w];
        const ppl = people(r, 10); let sc = 17 + Math.floor(r() * 3);
        const rows = ppl.map(p => { const o = { ...p, score: sc, sub: `${sc} correct · ${1 + Math.floor(r() * 2)}:${String(Math.floor(r() * 60)).padStart(2, '0')}` }; sc -= r() < .6 ? 1 : 0; return o });
        if (rank) { const meRow = { n: `${M.name} (you)`, c: '#e4f8a8', me: true }; if (rank <= 10) { const s = rows[rank - 1].score; rows.splice(rank - 1, 0, { ...meRow, score: s, sub: rows[rank - 1].sub }); rows.length = 10 } else { meRow.score = Math.max(4, rows[9].score - 2 - Math.floor(r() * 4)); meRow.sub = `${meRow.score} correct`; meRow.rank = rank; rows.push(meRow) } }
        out.push({ id: 'q' + wk, kind: 'quiz', when: st, title: `Prize Quiz · Week ${wk}`, date: `${dd(st)} – ${dd(en)}`, sub: '9 sudden-death rounds · best round counts', prizes, cons: null, rows, rank, won: rank && rank <= 3, prize: rank && rank <= 3 ? prizes[rank - 1] : null, unit: 'correct' }) }
      // daily challenge leaderboards (last 12 days) + weekly boards
      const LBRANK = [null, 2, 14, null, 6, 27, 9, null, 18, 33, 1, 12];
      for (let d = 1; d <= 12; d++) { const day = new Date(today.getTime() - d * DAY); day.setHours(0, 0, 0, 0); const r = rng(day.getDate() * 977 + day.getMonth() * 31 + 3), subj = Math.floor(r() * 4), chs = CHAPTERS[subj], ch = Math.floor(r() * chs.length);
        const prizes = [1, 2, 3].map(k => CHP[k][Math.floor(r() * CHP[k].length)]), cons = CHP[4][Math.floor(r() * CHP[4].length)];
        const rank = LBRANK[(d - 1) % LBRANK.length], ppl = people(r, 10); let pts = 3200 + Math.floor(r() * 400);
        const rows = ppl.map(p => { const o = { ...p, score: pts, sub: `${4 + Math.floor(r() * 3)}/6 · ${Math.floor(20 + r() * 40)}s` }; pts -= Math.round(90 + r() * 140); return o });
        if (rank) { const meRow = { n: `${M.name} (you)`, c: '#e4f8a8', me: true }; if (rank <= 10) { rows.splice(rank - 1, 0, { ...meRow, score: rows[rank - 1].score + Math.round(r() * 40), sub: rows[rank - 1].sub }); rows.length = 10 } else { meRow.score = Math.max(600, rows[9].score - 200 - Math.floor(r() * 600)); meRow.sub = ''; meRow.rank = rank; rows.push(meRow) } }
        out.push({ id: 'd' + day.toISOString().slice(0, 10), kind: 'lb', when: day, subj, title: `Daily Challenge · ${SUBJ[subj].name}`, date: `${WD[day.getDay()]} ${dd(day)}`, sub: `Chapter ${ch + 1} · ${chs[ch]}`, prizes, cons, rows, rank, won: rank && rank <= 10, prize: rank ? rank <= 3 ? prizes[rank - 1] : rank <= 10 ? cons : null : null, unit: 'pts' }) }
      for (let w = 1; w <= 3; w++) { const st = new Date(thisMon.getTime() - w * 7 * DAY), en = new Date(st.getTime() + 6 * DAY), wk = isoWeek(st), r = rng(wk * 53 + 11), subj = Math.floor(r() * 4);
        const prizes = [1, 2, 3].map(k => CHP[k][Math.floor(r() * CHP[k].length)]), cons = CHP[4][Math.floor(r() * CHP[4].length)], rank = [5, null, 17][w - 1], ppl = people(r, 10); let pts = 15200 + Math.floor(r() * 600);
        const rows = ppl.map(p => { const o = { ...p, score: pts, sub: `${5 + Math.floor(r() * 3)} days played` }; pts -= Math.round(380 + r() * 520); return o });
        if (rank) { const meRow = { n: `${M.name} (you)`, c: '#e4f8a8', me: true }; if (rank <= 10) { rows.splice(rank - 1, 0, { ...meRow, score: rows[rank - 1].score + 120, sub: '6 days played' }); rows.length = 10 } else { meRow.score = rows[9].score - 900; meRow.sub = '3 days played'; meRow.rank = rank; rows.push(meRow) } }
        out.push({ id: 'w' + wk, kind: 'wk', when: en, subj, title: `Weekly Leaderboard · ${SUBJ[subj].name}`, date: `${dd(st)} – ${dd(en)}`, sub: `Week ${wk} · all chapters`, prizes, cons, rows, rank, won: rank && rank <= 10, prize: rank ? rank <= 3 ? prizes[rank - 1] : rank <= 10 ? cons : null : null, unit: 'pts' }) }
      return out }
    let ALL = [], tab = 'quiz', filt = 'all', subjF = -1;
    const IC = { quiz: '<path d="M12 20.5s-8.5-4.8-8.5-11A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.5c0 6.2-8.5 11-8.5 11z"/>', lb: '<path d="M8 21V11H3v10zM15 21V4h-6v17zM21 21v-7h-6v7z"/>', wk: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' };
    const KL = { quiz: 'PRIZE QUIZ', lb: 'DAILY', wk: 'WEEKLY' };
    const placeTxt = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
    const inTab = s => tab === 'quiz' ? s.kind === 'quiz' : s.kind !== 'quiz';
    function list() { return ALL.filter(inTab).filter(s => filt === 'won' ? s.won : filt === 'played' ? !!s.rank : true).filter(s => subjF < 0 || s.subj === subjF).sort((a, b) => b.when - a.when) }
    function cardH(s, j) { const pod = [0, 1, 2].map(k => { const row = s.rows[k]; return `<div class="r${k + 1}${row.me ? ' pw-mine' : ''}"><span class="pw-md">${k + 1}</span><span class="pw-nm"><b>${esc(row.me ? 'You' : row.n.split(' ')[0])}</b><small>${esc(s.prizes[k][1])}</small></span></div>` }).join('');
      const meH = s.won ? `<span class="pw-ya">🏆</span><span>You finished <b>${placeTxt(s.rank)}</b> · won <b>${esc(s.prize[1])}</b></span>` : s.rank ? `<span class="pw-ya">YOU</span><span>You finished <b>${placeTxt(s.rank)}</b></span>` : `<span class="pw-ya">—</span><span>You didn't play this one</span>`;
      return `<button class="pw-c k-${s.kind}${s.won ? ' won' : ''}" data-id="${s.id}" style="--d:${(.04 + j * .04).toFixed(2)}s">${s.won ? '<span class="pw-rib">YOU WON</span>' : ''}
        <div class="pw-h"><span class="pw-k"><svg viewBox="0 0 24 24">${IC[s.kind]}</svg>${KL[s.kind]}</span><span class="pw-d">${esc(s.date)}</span></div>
        <b class="pw-t">${esc(s.title)}</b><span class="pw-s">${esc(s.sub)}</span><div class="pw-pod">${pod}</div>
        <div class="pw-me ${s.won ? 'won' : s.rank ? '' : 'no'}">${meH}<em>Full board<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></em></div></button>` }
    function render(anim) { const L = list(), T = ALL.filter(inTab), wins = T.filter(s => s.won), played = T.filter(s => s.rank), best = played.length ? Math.min(...played.map(s => s.rank)) : null;
      $('#pwSum').innerHTML = `<div><b>${wins.length}</b><small>TIMES YOU WON</small></div><div><b>${best ? '#' + best : '—'}</b><small>BEST FINISH</small></div><div><b>${played.length}/${T.length}</b><small>SESSIONS PLAYED</small></div>`;
      const subjChips = tab === 'quiz' ? '' : `<span class="sep"></span><button data-s="-1" class="${subjF < 0 ? 'on' : ''}">All subjects</button>${SUBJ.slice(0, 4).map((x, i) => `<button data-s="${i}" class="${subjF === i ? 'on' : ''}">${x.name.replace('Mathematics', 'Maths')}</button>`).join('')}`;
      $('#pwF').innerHTML = `<button data-f="all" class="${filt === 'all' ? 'on' : ''}">All <i>${T.length}</i></button><button data-f="won" class="${filt === 'won' ? 'on' : ''}">🏆 I won <i>${wins.length}</i></button><button data-f="played" class="${filt === 'played' ? 'on' : ''}">I played <i>${played.length}</i></button>${subjChips}`;
      const el = $('#pwList'); let j = 0, last = '';
      el.innerHTML = L.length ? L.map(s => { const g = `${MONL[s.when.getMonth()]} ${s.when.getFullYear()}`, h = g !== last ? `<div class="pw-g"><span>${g}</span><span>${L.filter(x => `${MONL[x.when.getMonth()]} ${x.when.getFullYear()}` === g).length} sessions</span></div>` : ''; last = g; return h + cardH(s, j++) }).join('')
        : `<div class="pw-empty"><b>${filt === 'won' ? 'No wins here yet' : 'Nothing to show'}</b>${filt === 'won' ? 'Finish in the prize spots and your wins will show up here.' : 'Try another filter.'}</div>`;
      if (anim) { replay(el, 'anim'); el.scrollTop = 0 } }
    function detail(id) { const s = ALL.find(x => x.id === id); if (!s) return; buzz();
      $('#pwdS').textContent = `${KL[s.kind]} · ${s.date.toUpperCase()}`; $('#pwdT').textContent = s.title; $('#pwdP').textContent = s.sub;
      const y = $('#pwdYou'); y.className = 'pwd-you' + (s.won ? ' won' : '');
      y.innerHTML = s.rank ? `<b>#${s.rank}</b><span><strong>${s.won ? `You won ${esc(s.prize[1])}! 🎉` : 'Your finish'}</strong>${s.won ? (s.kind === 'quiz' ? 'It\u2019s in My prizes.' : 'Prize sent to your parent\u2019s email.') : s.rank <= 15 ? `So close. ${s.kind === 'quiz' ? 'Top 3' : 'Top 10'} win prizes.` : 'Keep practising to climb.'}</span>` : `<b>—</b><span><strong>You didn't play</strong>Jump into the next one to win.</span>`;
      const pz = s.prizes.map((p, k) => `<div style="--bgc:${p[3]}">${PA[p[0]] || ''}<b>${esc(p[1])}</b><small>${['🥇 1ST', '🥈 2ND', '🥉 3RD'][k]}</small></div>`).join('');
      const rows = s.rows.map((r, k) => { const rk = r.rank || k + 1; return (r.rank ? '<div class="pwd-gap">···</div>' : '') + `<div class="pwd-r r${rk}${r.me ? ' pw-mine' : ''}"><span class="pw-rk">${rk}</span><span class="pw-av" style="--t:${r.c}">${r.me ? 'YOU' : ini(r.n)}</span><span class="pw-nm"><b>${esc(r.n)}</b><small>${esc(r.sub || '')}${rk <= 3 ? ' · ' + esc(s.prizes[rk - 1][1]) : s.cons && rk <= 10 ? ' · ' + esc(s.cons[1]) : ''}</small></span><span class="pw-sc">${r.score.toLocaleString()}<small>${s.unit.toUpperCase()}</small></span></div>` }).join('');
      $('#pwdB').innerHTML = `<div class="pwd-l">PRIZES</div><div class="pwd-pz">${pz}</div>${s.cons ? `<div class="pwd-con">${PA[s.cons[0]] || ''}<span>4th – 10th each won <b>${esc(s.cons[1])}</b></span></div>` : ''}<div class="pwd-l" style="margin-top:14px">FINAL BOARD</div><div class="pwd-rows">${rows}</div>`;
      $('#pwdF').innerHTML = `<button class="sec" data-a="close">Close</button>${s.won && s.kind === 'quiz' ? '<button class="pri" data-a="prizes">SEE MY PRIZE</button>' : ''}`;
      $('#pwdB').scrollTop = 0; $('#pwd').classList.add('open'); $('#pwdBd').classList.add('open'); SFX.play('pop') }
    function close() { $('#pwd').classList.remove('open'); $('#pwdBd').classList.remove('open') }
    const segBtns = [...document.querySelectorAll('#pwSeg button')], k = $('#pwK');
    const moveK = () => { const b = document.querySelector('#pwSeg button.on'); if (!b || !b.offsetWidth) return; k.style.width = b.offsetWidth + 'px'; k.style.transform = `translateX(${b.offsetLeft}px)` };
    segBtns.forEach(b => b.addEventListener('click', () => { if (b.classList.contains('on')) return; buzz(); segBtns.forEach(x => x.classList.toggle('on', x === b)); tab = b.dataset.t; filt = 'all'; subjF = -1; moveK(); render(true) }));
    $('#pwF').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; buzz(); if (b.dataset.f) filt = b.dataset.f; if (b.dataset.s != null) subjF = +b.dataset.s; render(true) });
    $('#pwList').addEventListener('click', e => { const c = e.target.closest('.pw-c'); if (c) detail(c.dataset.id) });
    $('#pwdF').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; buzz(); close(); if (b.dataset.a === 'prizes') toast('My prizes — next screen in the build') });
    ['#pwdX', '#pwdBd'].forEach(s => $(s).addEventListener('click', () => { buzz(); close() }));
    addEventListener('keydown', e => { if (e.key === 'Escape' && $('#pwd').classList.contains('open')) close() });
    $('#pwBack').addEventListener('click', () => { buzz(); close(); showLobby() });
    addEventListener('resize', moveK); document.fonts && document.fonts.ready.then(moveK);
    function open() { filt = 'all'; subjF = -1; ALL = build(); segBtns.forEach(x => x.classList.toggle('on', x.dataset.t === tab)); render(true); requestAnimationFrame(moveK) }
    function showPast(t) { tab = t || tab; buzz(); setTimeout(() => { SFX.play('whoosh');
      $('#s-lobby').classList.remove('play'); $('#s-lobby').classList.add('off');
      $('#s-past').classList.remove('off'); $('#s-past').classList.add('play'); open() }, 180) }
    function showLobby() { setTimeout(() => { SFX.play('whoosh');
      $('#s-past').classList.remove('play'); $('#s-past').classList.add('off');
      $('#s-lobby').classList.remove('off'); $('#s-lobby').classList.add('play') }, 180) }
    $('#lbPast').addEventListener('click', () => showPast('lb'));
    return { showPast };
  })();

  /* ===================== NAV + GO ===================== */
  // Back — real navigation to the home page, mirroring the prototype's
  // nav('home'): the whoosh must finish BEFORE location.href destroys
  // the AudioContext (~240ms sound, so wait 260ms).
  $('#lbBack').addEventListener('click', () => { buzz(); setTimeout(() => { SFX.play('whoosh'); setTimeout(() => location.href = 'index.html', 260) }, 180) });
  $('#lbInfo').addEventListener('click', () => { buzz(); toast('Beat challenges to score. Top 3 and ranks 4–10 win the prizes you pick!') });

  /* GO — start the drill. STUB: the drill screen isn't built yet,
     so surface the same "next screen" toast the home dock uses.
     REPLACE with: go('drill') once a drill page exists (challenge.ts routes). */
  $('#toDrill').addEventListener('click', () => { buzz(); replay($('#lbar'), 'nudge'); toast(`${SUBJ[lob.subj].name} · Ch ${lob.ch + 1} — drill screen next in the build`) });

  /* ---------- first paint ---------- */
  renderFields();
  renderLobby(true);
}
