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
import { CLOUDFRONT_APP_URL } from '../../api/config';
import { selectBoardPrize } from '../../api/leaderboard';
import { fetchUserStreakDetails } from '../../api/auth';
import { fetchAgeRanges, fetchProfile, updateAgeRange } from '../../api/profile';
import {
  fetchSubjects,
  fetchSubjectCategories,
  fetchChallenges,
  fetchChallengeCategories,
  startChallengeAttempt,
  submitChallengeAnswer,
  completeChallengeAttempt,
  fetchChallengeReview,
  askBotQuestion,
} from '../../api/challenges';
import { formatMathAndText } from '../../utils/mathText';

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
      sparkle() { [880, 1320, 1760, 2640].forEach((f, i) => tone(f, { d: .14, v: .11, to: f * 1.25, t: i * .06, type: 'triangle' })) }, // prize locked-in — same as reference
      count() { tone(800, { d: .06, type: 'triangle', v: .2 }) },
      go() { tone(1200, { d: .2, type: 'triangle', v: .3, to: 1600 }) },
      ok() { tone(880, { d: .1, type: 'triangle', v: .25, to: 1320 }) },
      no() { tone(240, { d: .16, type: 'sawtooth', v: .2, to: 140 }) },
      win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, { d: .16, v: .15, t: i * .08, type: 'triangle' })) },
      lose() { [400, 350, 300, 240].forEach((f, i) => tone(f, { d: .2, v: .15, t: i * .08, type: 'sawtooth' })) }
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

  /* ===================== SUBJECTS, CHAPTERS & AGE RANGES STATE ===================== */
  let ageRangesList = [];
  let selectedAgeRangeId = null; // number | null
  let subjectsList = [];
  let selectedSubject = null; // { id, name, code, totalChapters, ... }
  let chaptersCache = {}; // subjectId -> ChallengeCategoryItem[]
  let selectedCategory = null; // { id, name, priorityIndex, isCompleted, isSelectable }
  let isLoadingAgeRanges = false;
  let isLoadingSubjects = false;
  let isLoadingChapters = false;
  let isUpdatingAgeRange = false;

  const lob = { period: 'today' };

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
  function updateLiveStatus() {
    const liveEl = $('#lbLive'), txtEl = $('#lbLiveTxt'), prefixEl = $('#lbResetPrefix');
    if (!liveEl) return;
    // An ongoing board exists if summary has an active endDate / startDate
    const hasOngoingBoard = Boolean(lastSummary && (lastSummary.endDate || lastSummary.startDate));
    if (hasOngoingBoard) {
      liveEl.classList.remove('offline');
      if (txtEl) txtEl.textContent = 'LIVE';
      if (prefixEl) prefixEl.textContent = 'RESETS';
    } else {
      liveEl.classList.add('offline');
      if (txtEl) txtEl.textContent = 'OFFLINE';
      if (prefixEl) prefixEl.textContent = 'NO BOARD';
      const resetEl = $('#resetT');
      if (resetEl) resetEl.textContent = '--:--:--';
    }
  }

  function parseResetDate(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d, 23, 59, 59, 999);
    }
    return new Date(dateStr);
  }

  let resetAt = parseResetDate(lastSummary?.endDate);
  if (lastSummary) { live = normSummary(lastSummary); snapChase = true }
  updateLiveStatus();
  useAppStore.subscribe(s => {
    if (s.lbSummary === lastSummary) return;
    lastSummary = s.lbSummary;
    live = normSummary(lastSummary);
    resetAt = parseResetDate(lastSummary?.endDate);
    snapChase = true; // snap: no 1.2s slide from wherever the mock had left the runner
    updateLiveStatus();
    renderLobby(true);
  });
  /* podium seats: live top-3, otherwise all-null ("—" / 0) seats */
  function podiumPeople() { return live ? live.top : [null, null, null] }

  const CLOUD_IMG_BASE = `${CLOUDFRONT_APP_URL}/products`;

  // Neutral SVG prize gift/box placeholder for failed or unavailable images
  const BLANK_PRIZE_PLACEHOLDER = `<svg viewBox="0 0 64 64" class="pz-img" style="display:block"><rect width="64" height="64" rx="8" fill="#e2e8f0"/><path d="M20 28h24v20H20z" fill="#cbd5e1"/><path d="M18 24h28v6H18z" fill="#94a3b8"/><path d="M30 24v24h4V24z" fill="#f8fafc"/><circle cx="28" cy="20" r="4" fill="none" stroke="#94a3b8" stroke-width="2.5"/><circle cx="36" cy="20" r="4" fill="none" stroke="#94a3b8" stroke-width="2.5"/></svg>`;

  window._onPrizeImgErrCh = function(img) {
    if (!img || img._handled) return;
    img._handled = true;
    const parent = img.parentNode;
    if (parent) {
      const span = document.createElement('span');
      span.innerHTML = BLANK_PRIZE_PLACEHOLDER;
      if (span.firstElementChild) {
        parent.replaceChild(span.firstElementChild, img);
      }
    }
  };

  function renderPrizeArt(key) {
    if (!key) return BLANK_PRIZE_PLACEHOLDER;
    let imgUrl = '';
    if (key.startsWith('http://') || key.startsWith('https://')) {
      imgUrl = key;
    } else if (key.startsWith('/')) {
      imgUrl = `${CLOUDFRONT_APP_URL}${key}`;
    } else if (/\.(png|jpe?g|webp|svg)$/i.test(key)) {
      // already has extension
      imgUrl = `${CLOUD_IMG_BASE}/${key}`;
    } else if (PA[key]) {
      // internal catalog key
      imgUrl = `${CLOUD_IMG_BASE}/${key}.png`;
    } else {
      // formatted prize filename or path without forced extension
      imgUrl = `${CLOUD_IMG_BASE}/${key}`;
    }
    return `<img src="${imgUrl}" alt="" class="pz-img" loading="lazy" onerror="window._onPrizeImgErrCh(this)"/>`;
  }

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
  let chPicks = { 1: null, 2: null, 3: null, 4: null };
  let currentOngoingBoard = useAppStore.getState().ongoingBoard || null;

  function syncOngoingPrizes(board) {
    if (!board) return;
    currentOngoingBoard = board;
    const bgColors = ['#e8f4ff', '#fff6d6', '#efeaff', '#ffe9e6', '#ffe9f0', '#f1fad6', '#f3f5f0', '#fff0e3'];
    
    // Populate selectable prizes per position from backend
    if (board.selectablePrizes) {
      for (const pos of [1, 2, 3, 4]) {
        const list = board.selectablePrizes[String(pos)];
        if (Array.isArray(list) && list.length > 0) {
          CHP[pos] = list.map((p, idx) => [
            p.productImage || 'console',
            p.prizeName,
            p.productDescription || '',
            bgColors[idx % bgColors.length],
            p.prizeId,
          ]);
        }
      }
    }

    // Match existing user selections
    if (board.myPrizeSelections) {
      for (const pos of [1, 2, 3, 4]) {
        const sel = board.myPrizeSelections[String(pos)];
        if (sel && sel.prizeId != null && CHP[pos]) {
          const foundIdx = CHP[pos].findIndex(it => it[4] === sel.prizeId);
          if (foundIdx !== -1) {
            chPicks[pos] = foundIdx;
          }
        }
      }
    }
  }

  if (currentOngoingBoard) syncOngoingPrizes(currentOngoingBoard);

  useAppStore.subscribe(s => {
    if (s.ongoingBoard !== currentOngoingBoard) {
      syncOngoingPrizes(s.ongoingBoard);
      renderPodiumPrizes();
    }
  });

  const savePicks = async (pos, item) => {
    if (!currentOngoingBoard || !item || !item[4]) return;
    try {
      await selectBoardPrize(currentOngoingBoard.id, pos, item[4]);
    } catch (err) {
      console.error('Failed to save prize selection:', err);
    }
  };

  function countUpAll(root, delay) { root.querySelectorAll('[data-count]').forEach(el => { const to = +el.dataset.count; if (reduce) { el.textContent = to.toLocaleString(); return } const t0 = performance.now() + (delay || 0); el.textContent = '0'; (function f(t) { const p = Math.max(0, Math.min(1, (t - t0) / 1000)), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e).toLocaleString(); if (p < 1) requestAnimationFrame(f) })(performance.now()) }) }

  /* ===================== RENDER: prize podium + 4-10 base ===================== */
  function renderPodiumPrizes(got) {
    const b = podiumPeople();
    const seat = k => { const p = b[k - 1], pk = chPicks[k], it = pk != null ? CHP[k][pk] : null;
      const top = p ? `${k === 1 ? crown : ''}<span class="fr"><span class="av3" style="background:${p.c}">${ini(p.n)}</span></span><span class="nm">${esc(p.n.split(' ')[0])}</span><span class="lpt" data-count="${p.pts}">${p.pts.toLocaleString()}</span>`
        : `<span class="open"><b>?</b></span><span class="nm">—</span><span class="lpt">0</span>`;
      return `<div class="ls r${k}" style="${MEDV[k]}"><div class="lsu">${top}</div>
        <button class="ped${got === k ? ' got' : ''}" data-chp="${k}" style="${MEDV[k]}" aria-label="${PLACE2[k]} place prize${it ? ': ' + esc(it[1]) : ', choose one'}"><span class="rk">${k}</span><span class="rays"></span>
          ${it ? `<span class="pa">${renderPrizeArt(it[0])}</span><span class="pnm">${esc(it[1])}</span>` : `<span class="pa plus">${PLUS}</span><span class="pnm">PICK PRIZE</span>`}</button></div>` };
    $('#lpod').innerHTML = seat(2) + seat(1) + seat(3);
    const ci = chPicks[4], it = ci != null ? CHP[4][ci] : null, L = $('#lbase'); L.classList.toggle('got', got === 4);
    L.innerHTML = `<span class="lb-n"><b>4TH–10TH</b><small>PLACE PRIZE</small></span><span class="lb-p"><span class="art${it ? '' : ' plus'}">${it ? renderPrizeArt(it[0]) : PLUS}</span><b>${it ? esc(it[1]) : 'Pick prize'}</b></span>`;
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

  const DEFAULT_SUBJ_ICONS = {
    mathematics: `<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M5.5 5.5l3 3M8.5 5.5l-3 3"/><rect x="13" y="3" width="8" height="8" rx="2"/><path d="M15 7h4"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M7 15v4M5 17h4"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M15 17h4"/><circle class="f" cx="17" cy="15" r=".9"/><circle class="f" cx="17" cy="19" r=".9"/>`,
    math: `<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M5.5 5.5l3 3M8.5 5.5l-3 3"/><rect x="13" y="3" width="8" height="8" rx="2"/><path d="M15 7h4"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M7 15v4M5 17h4"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M15 17h4"/><circle class="f" cx="17" cy="15" r=".9"/><circle class="f" cx="17" cy="19" r=".9"/>`,
    english: `<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8 13l2.5-6 2.5 6M8.8 11.2h3.4"/><path d="M14.5 7v6h1.8a1.5 1.5 0 0 0 0-3h-1.8 1.5a1.5 1.5 0 0 0 0-3z"/>`,
    'bahasa melayu': `<path d="M3 5h18v11h-9l-5 4v-4H3z"/><path d="M6.5 8v5h2a1.25 1.25 0 0 0 0-2.5h-2 1.6a1.25 1.25 0 0 0 0-2.5z"/><path d="M12 13V8l2.5 3L17 8v5"/>`,
    science: `<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 14h9"/><circle class="f" cx="10.5" cy="17" r="1"/><circle class="f" cx="14" cy="18.2" r=".8"/>`,
    'writing drill': `<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4M4 20l2-2"/>`,
    writing: `<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4M4 20l2-2"/>`,
    'technical writing': `<path d="M9 4h6M10 4v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V4"/><path d="M7.5 15h9"/>`
  };

  function getSubjectSvg(name) {
    const key = (name || '').toLowerCase().trim();
    return DEFAULT_SUBJ_ICONS[key] || `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>`;
  }

  /* ===================== SETUP BAR (subject + chapter) ===================== */
  function getSelectedAgeRange() {
    return ageRangesList.find(r => r.id === selectedAgeRangeId) || null;
  }

  function renderFields() {
    const ageRange = getSelectedAgeRange();
    const ageLabel = ageRange ? (ageRange.label || '').toUpperCase() : 'GRADE';

    if (selectedSubject) {
      $('#fSubjV').textContent = selectedSubject.name;
      $('#fSubjL').textContent = `${ageLabel} · SUBJECT`;
      const svgBody = getSubjectSvg(selectedSubject.name);
      $('#fSubjI').innerHTML = `<svg viewBox="0 0 24 24">${svgBody}</svg>`;
    } else {
      $('#fSubjV').textContent = 'Select Subject';
      $('#fSubjL').textContent = `${ageLabel} · SUBJECT`;
      $('#fSubjI').innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/></svg>`;
    }

    const totalCh = selectedSubject?.totalChapters ?? selectedSubject?.totalCategories;
    if (selectedCategory) {
      $('#fChN').textContent = selectedCategory.priorityIndex != null ? selectedCategory.priorityIndex : '1';
      $('#fChL').textContent = totalCh ? `CHAPTER ${selectedCategory.priorityIndex || 1} OF ${totalCh}` : 'CHAPTER';
      $('#fChV').textContent = selectedCategory.name;
    } else {
      $('#fChN').textContent = '—';
      $('#fChL').textContent = 'CHAPTER';
      $('#fChV').textContent = 'Select Chapter';
    }
  }

  /* ===================== ACADEMIC YEAR / AGE RANGE RAIL & DROPDOWN ===================== */
  function renderRail() {
    const r = getSelectedAgeRange();
    $('#ycur').textContent = r ? (r.label || 'Select Year') : 'Select Year';
    $('#ycurS').textContent = 'ACADEMIC YEAR';
    closeYdd();

    if (!ageRangesList.length) {
      $('#ydd').innerHTML = '<div style="padding:14px;color:#8a9478;text-align:center;font-size:12px">Loading grades...</div>';
      return;
    }

    // Deduplicate age ranges by id
    const seen = new Set();
    const items = ageRangesList.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    $('#ydd').innerHTML = items.map(o => {
      const isSelected = o.id === selectedAgeRangeId;
      return `<button class="yo${isSelected ? ' on' : ''}" data-y="${o.id}">
        <span>${esc(o.label || `Grade ${o.id}`)}</span>
        <i><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i>
      </button>`;
    }).join('');
  }

  function openYdd() {
    buzz();
    $('#pk').classList.add('ydd-open');
    const c = $('#ydd .yo.on');
    if (c) $('#ydd').scrollTop = c.offsetTop - 80;
  }

  function closeYdd() {
    $('#pk').classList.remove('ydd-open');
  }

  $('#ychg').addEventListener('click', () => {
    $('#pk').classList.contains('ydd-open') ? closeYdd() : openYdd();
  });

  $('#ydd').addEventListener('click', async e => {
    const c = e.target.closest('.yo');
    if (!c || isUpdatingAgeRange) return;
    const newId = +c.dataset.y;
    buzz();

    document.querySelectorAll('#ydd .yo').forEach(x => x.classList.toggle('on', x === c));
    const changed = newId !== selectedAgeRangeId;

    if (changed) {
      selectedAgeRangeId = newId;
      isUpdatingAgeRange = true;
      try {
        await updateAgeRange(newId);
        // Clear cached chapters when academic year changes
        chaptersCache = {};
        selectedCategory = null;
        renderFields();
      } catch (err) {
        console.error('Failed to update age range:', err);
        toast('Failed to update academic year');
      } finally {
        isUpdatingAgeRange = false;
      }
    }

    setTimeout(() => {
      closeYdd();
      const cur = getSelectedAgeRange();
      $('#ycur').textContent = cur ? (cur.label || 'Select Year') : 'Select Year';
      replay($('#yrail'), 'bump2');

      if (pkMode === 'ch') {
        setTimeout(() => {
          closePicker();
          setTimeout(() => openPicker('subj'), 380);
        }, 200);
        return;
      }
      if (changed) {
        swapPicker('subj');
      }
    }, 200);
  });

  function swapPicker(mode) {
    const pk = $('#pk');
    pk.classList.add('swap');
    setTimeout(() => {
      openPicker(mode);
      pk.classList.remove('swap');
      replay($('#pkO'), 'reIn');
    }, 160);
  }

  /* ===================== PICKER SHEET (subject / chapter) ===================== */
  let pkMode = null; // 'subj' | 'ch'
  const ck = '<span class="ck"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
  const lk = '<span class="lock-ic"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>';

  async function openPicker(mode) {
    pkMode = mode;
    buzz();
    closePicker();
    renderRail();
    $('#pk').classList.add('open');
    $('#pkBd').classList.add('open');

    if (mode === 'subj') {
      $('#pkT').textContent = 'PICK A SUBJECT';
      $('#pkS').textContent = 'STEP 1 · SUBJECT';
      $('#pkO').innerHTML = '<div style="text-align:center;padding:24px;color:#8a9478;font-weight:600">Loading subjects...</div>';

      try {
        isLoadingSubjects = true;
        subjectsList = await fetchSubjects();
        if (subjectsList.length === 0) {
          $('#pkO').innerHTML = '<div style="text-align:center;padding:24px;color:#8a9478;font-weight:600">No subjects available</div>';
          return;
        }

        $('#pkO').innerHTML = subjectsList.map((s) => {
          const isSelected = selectedSubject && selectedSubject.id === s.id;
          const chaptersCount = s.totalChapters ?? s.totalCategories;
          const subText = s.isLocked
            ? 'Locked'
            : (chaptersCount != null ? `${chaptersCount} chapters` : 'Available');

          const svgBody = getSubjectSvg(s.name);
          const iconHtml = `<svg viewBox="0 0 24 24">${svgBody}</svg>`;

          return `<button class="opt${isSelected ? ' on' : ''}${s.isLocked ? ' locked' : ''}" data-type="subj" data-id="${s.id}" data-locked="${s.isLocked ? '1' : '0'}">
            <span class="oi">${iconHtml}</span>
            <span>${esc(s.name)}<small class="osub" style="${s.isLocked ? 'color:#a65d07;' : ''}">${esc(subText)}</small></span>
            ${s.isLocked ? lk : ck}
          </button>`;
        }).join('');
      } catch (err) {
        console.error('Failed to load subjects:', err);
        $('#pkO').innerHTML = '<div style="text-align:center;padding:24px;color:#c23a2f;font-weight:600">Failed to load subjects</div>';
      } finally {
        isLoadingSubjects = false;
      }
    } else if (mode === 'ch') {
      if (!selectedSubject) {
        toast('Please select a subject first');
        setTimeout(() => openPicker('subj'), 200);
        return;
      }

      $('#pkT').textContent = 'PICK A CHAPTER';
      $('#pkS').textContent = `STEP 2 · ${selectedSubject.name.toUpperCase()}`;
      $('#pkO').innerHTML = '<div style="text-align:center;padding:24px;color:#8a9478;font-weight:600">Loading chapters...</div>';

      try {
        isLoadingChapters = true;
        let categories = chaptersCache[selectedSubject.id];

        if (!categories) {
          // Fetch categories directly from GET /api/v1/subjects/{subjectId}/categories
          try {
            const res = await fetchSubjectCategories(selectedSubject.id);
            categories = res.categories;
          } catch (e) {
            // Fallback to challenge categories if needed
            const challenges = await fetchChallenges(selectedSubject.id);
            const unlocked = challenges.filter(c => !c.isLocked);
            const challenge = unlocked.length > 0
              ? unlocked[Math.floor(Math.random() * unlocked.length)]
              : (challenges.length > 0 ? challenges[0] : null);

            if (challenge) {
              const res = await fetchChallengeCategories(challenge.id);
              categories = res.categories;
            }
          }

          if (categories) {
            chaptersCache[selectedSubject.id] = categories;
          }
        }

        if (!categories || categories.length === 0) {
          $('#pkO').innerHTML = '<div style="text-align:center;padding:24px;color:#8a9478;font-weight:600">No chapters available</div>';
          return;
        }

        $('#pkO').innerHTML = categories.map((c, i) => {
          const isSelected = selectedCategory && selectedCategory.id === c.id;
          const statusText = c.isCompleted
            ? '✓ Completed'
            : (c.completionPercentage && c.completionPercentage > 0
              ? `${Math.round(c.completionPercentage)}% completed`
              : 'Incomplete');
          return `<button class="opt${isSelected ? ' on' : ''}" data-type="ch" data-id="${c.id}">
            <span class="oi">${c.priorityIndex || (i + 1)}</span>
            <span>${esc(c.name)}<small class="osub" style="${c.isCompleted ? 'color:#4a7c13;' : ''}">${statusText}</small></span>
            ${ck}
          </button>`;
        }).join('');
      } catch (err) {
        console.error('Failed to load chapters:', err);
        $('#pkO').innerHTML = '<div style="text-align:center;padding:24px;color:#c23a2f;font-weight:600">Failed to load chapters</div>';
      } finally {
        isLoadingChapters = false;
      }
    }
  }

  function closePicker() {
    $('#pk').classList.remove('open');
    $('#pkBd').classList.remove('open');
    closeYdd();
  }

  $('#pkBd').addEventListener('click', closePicker);
  $('#pkX').addEventListener('click', () => { buzz(); closePicker() });

  $('#pkO').addEventListener('click', e => {
    const o = e.target.closest('.opt');
    if (!o) return;
    const type = o.dataset.type;
    const id = +o.dataset.id;
    const isLocked = o.dataset.locked === '1';
    buzz();

    if (isLocked) {
      toast('This subject is locked');
      return;
    }

    document.querySelectorAll('#pkO .opt').forEach(x => x.classList.toggle('on', x === o));

    if (type === 'subj') {
      const found = subjectsList.find(s => s.id === id);
      if (found && (!selectedSubject || selectedSubject.id !== found.id)) {
        selectedSubject = found;
        selectedCategory = null; // reset chapter when subject changes
      }
      setTimeout(() => {
        renderFields();
        SFX.play('pop');
        setTimeout(() => openPicker('ch'), 380);
      }, 260);
    } else if (type === 'ch') {
      const categories = chaptersCache[selectedSubject?.id] || [];
      const found = categories.find(c => c.id === id);
      if (found) {
        selectedCategory = found;
      }
      setTimeout(() => {
        renderFields();
        SFX.play('pop');
        closePicker();
        renderLobby(true);
        replay($('#lbar'), 'nudge');
      }, 260);
    }
  });

  /* ---------- picker triggers ---------- */
  $('#fSubj').addEventListener('click', () => { openPicker('subj') });
  $('#fCh').addEventListener('click', () => { openPicker('ch') });
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
    $('#pzG').innerHTML = CHP[p].map((it, i) => `<button class="pt${chPicks[p] === i ? ' on' : ''}" data-i="${i}" style="--bgc:${it[3]};--d:${(i * .05).toFixed(2)}s"><span class="ck"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="art">${renderPrizeArt(it[0])}</span><b>${esc(it[1])}</b><small>${esc(it[2])}</small></button>`).join('');
    $('#pzG').scrollTop = 0; d.classList.add('open'); $('#pzBd').classList.add('open');
  }
  function closePrize() { $('#pzd').classList.remove('open'); $('#pzBd').classList.remove('open') }
  $('#pzG').addEventListener('click', e => { const t = e.target.closest('.pt'); if (!t) return; const i = +t.dataset.i; buzz();
    document.querySelectorAll('#pzG .pt').forEach(x => x.classList.toggle('on', x === t)); SFX.play('coin');
    chPicks[pzPlace] = i;
    const selectedItem = CHP[pzPlace] ? CHP[pzPlace][i] : null;
    savePicks(pzPlace, selectedItem);
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
    const hasOngoingBoard = Boolean(lastSummary && (lastSummary.endDate || lastSummary.startDate));
    if (!hasOngoingBoard || !resetAt) {
      $('#resetT').textContent = '--:--:--';
      return;
    }
    let s = Math.max(0, Math.floor((resetAt - new Date()) / 1000));
    const p = n => String(n).padStart(2, '0');
    $('#resetT').textContent = `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  }
  tickReset(); setInterval(tickReset, 1000);

  /* ===================== PAST WINNERS (ported from the prototype's PWIN module) =====================
     Prize Quiz tab uses GET /api/v1/quiz-sessions/history via useAppStore.quizSessionsHistory.
     Leaderboards tab uses GET /api/v1/weekly-boards/history via useAppStore.weeklyBoardsHistory. */
  const PWIN = (() => {
    const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      MONL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'],
      WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const me = () => { let p = {}; try { p = JSON.parse(localStorage.getItem('qdProfile') || 'null') || {} } catch (_) { }
      return { name: meName(), user: p.username || 'test4' } };
    const dd = d => `${d.getDate()} ${MON[d.getMonth()]}`;

    function mapBackendQuizSessions(apiSessions) {
      const M = me();
      return (apiSessions || []).map(b => {
        const st = b.startDate ? new Date(b.startDate) : new Date();
        const en = b.endDate ? new Date(b.endDate) : st;
        const rows = (b.winners && b.winners.length ? b.winners : []).map((w, idx) => ({
          n: w.name || w.username || 'Player',
          c: TINT[idx % TINT.length],
          score: w.score || 0,
          sub: w.prizeName || 'Prize Winner',
          prizeImage: w.prizeImage || null,
          me: b.userWinningDetails ? (w.userId === b.userWinningDetails.userId || w.position === b.userWinningDetails.position) : false,
          rank: w.position || idx + 1,
        }));
        let prizes = [1, 2, 3].map(pos => {
          const p = (b.prizes || []).find(x => x.position === pos);
          if (p && (p.image || p.name)) return [p.image || null, p.name || 'Prize', '', '#e8f4ff'];
          const w = rows.find(r => r.rank === pos);
          if (w && (w.prizeImage || w.sub)) return [w.prizeImage, w.sub || 'Prize', '', '#e8f4ff'];
          return null;
        });
        if (prizes.every(p => p === null) && b.prizes && b.prizes.length > 0) {
          prizes = [0, 1, 2].map(idx => {
            const p = b.prizes[idx];
            if (p && (p.image || p.name)) return [p.image || null, p.name || 'Prize', '', '#e8f4ff'];
            return null;
          });
        }
        const consPrize = (b.prizes || []).find(x => x.position === 4) || b.prizes?.[3];
        const cons = consPrize && (consPrize.image || consPrize.name)
          ? [consPrize.image || null, consPrize.name || 'Prize', '', '#fff0e3']
          : rows[3] && rows[3].prizeImage
            ? [rows[3].prizeImage, rows[3].sub || 'Prize', '', '#fff0e3']
            : null;
        let rank = b.userWinningDetails ? b.userWinningDetails.position : b.userPlayed ? 12 : null;
        if (rank && !rows.some(r => r.me)) {
          rows.push({
            n: `${M.name} (you)`,
            c: '#e4f8a8',
            me: true,
            score: 0,
            sub: 'Completed rounds',
            rank,
          });
        }
        return {
          id: 'qs_' + b.id,
          kind: 'quiz',
          when: en,
          title: b.title || 'Prize Quiz',
          date: `${dd(st)} – ${dd(en)}`,
          sub: 'Prize Quiz · best round counts',
          prizes,
          cons,
          rows,
          rank,
          won: !!b.userWon,
          prize: b.userWon ? (rank && rank <= 3 ? prizes[rank - 1] : cons) : null,
          unit: 'correct',
        };
      });
    }

    function mapBackendBoards(apiBoards) {
      const M = me();
      return (apiBoards || []).map(b => {
        const st = b.startDate ? new Date(b.startDate) : new Date();
        const en = b.endDate ? new Date(b.endDate) : st;
        const rows = (b.winners && b.winners.length ? b.winners : []).map((w, idx) => ({
          n: w.name || w.username || 'Player',
          c: TINT[idx % TINT.length],
          score: w.score || 0,
          sub: w.prizeName || 'Top 10 Winner',
          prizeImage: w.prizeImage || null,
          me: b.userWinningDetails ? (w.userId === b.userWinningDetails.userId || w.position === b.userWinningDetails.position) : false,
          rank: w.position || idx + 1,
        }));
        let prizes = [1, 2, 3].map(pos => {
          const p = (b.prizes || []).find(x => x.position === pos);
          if (p && (p.image || p.name)) return [p.image || null, p.name || 'Prize', '', '#e8f4ff'];
          const w = rows.find(r => r.rank === pos);
          if (w && (w.prizeImage || w.sub)) return [w.prizeImage, w.sub || 'Prize', '', '#e8f4ff'];
          return null;
        });
        if (prizes.every(p => p === null) && b.prizes && b.prizes.length > 0) {
          prizes = [0, 1, 2].map(idx => {
            const p = b.prizes[idx];
            if (p && (p.image || p.name)) return [p.image || null, p.name || 'Prize', '', '#e8f4ff'];
            return null;
          });
        }
        const consPrize = (b.prizes || []).find(x => x.position === 4) || b.prizes?.[3];
        const cons = consPrize && (consPrize.image || consPrize.name)
          ? [consPrize.image || null, consPrize.name || 'Prize', '', '#fff0e3']
          : rows[3] && rows[3].prizeImage
            ? [rows[3].prizeImage, rows[3].sub || 'Prize', '', '#fff0e3']
            : null;
        let rank = b.userWinningDetails ? b.userWinningDetails.position : b.userPlayed ? 12 : null;
        if (rank && !rows.some(r => r.me)) {
          rows.push({
            n: `${M.name} (you)`,
            c: '#e4f8a8',
            me: true,
            score: 0,
            sub: 'Completed challenges',
            rank,
          });
        }
        return {
          id: 'wb_' + b.id,
          kind: 'wk',
          when: en,
          title: b.title || 'Weekly Leaderboard',
          date: `${dd(st)} – ${dd(en)}`,
          sub: 'Weekly Championship · all chapters',
          prizes,
          cons,
          rows,
          rank,
          won: !!b.userWon,
          prize: b.userWon ? (rank && rank <= 3 ? prizes[rank - 1] : cons) : null,
          unit: 'pts',
        };
      });
    }
    function build() {
      const apiQuiz = useAppStore.getState().quizSessionsHistory;
      const quizList = apiQuiz ? mapBackendQuizSessions(apiQuiz) : [];
      const apiLb = useAppStore.getState().weeklyBoardsHistory;
      // Leaderboards and Quiz tabs use real backend history — no mock data
      const lbList = apiLb ? mapBackendBoards(apiLb) : [];
      return [...quizList, ...lbList];
    }
    let ALL = [], tab = 'quiz', filt = 'all';
    const IC = { quiz: '<path d="M12 20.5s-8.5-4.8-8.5-11A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.5c0 6.2-8.5 11-8.5 11z"/>', lb: '<path d="M8 21V11H3v10zM15 21V4h-6v17zM21 21v-7h-6v7z"/>', wk: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' };
    const KL = { quiz: 'PRIZE QUIZ', lb: 'DAILY', wk: 'WEEKLY' };
    const placeTxt = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
    const inTab = s => tab === 'quiz' ? s.kind === 'quiz' : s.kind !== 'quiz';
    function list() { return ALL.filter(inTab).filter(s => filt === 'won' ? s.won : filt === 'played' ? !!s.rank : true).sort((a, b) => b.when - a.when) }
    function cardH(s, j) {
      const pod = [0, 1, 2].map(k => {
        const row = s.rows[k] || { n: '—', me: false };
        const pzLabel = s.prizes[k] ? s.prizes[k][1] : '';
        return `<div class="r${k + 1}${row.me ? ' pw-mine' : ''}"><span class="pw-md">${k + 1}</span><span class="pw-nm"><b>${esc(row.me ? 'You' : row.n.split(' ')[0])}</b>${pzLabel ? `<small>${esc(pzLabel)}</small>` : ''}</span></div>`;
      }).join('');
      const meH = s.won
        ? `<span class="pw-ya">🏆</span><span>You finished <b>${placeTxt(s.rank)}</b>${s.prize && s.prize[1] ? ` · won <b>${esc(s.prize[1])}</b>` : ''}</span>`
        : s.rank
          ? `<span class="pw-ya">YOU</span><span>You finished <b>${placeTxt(s.rank)}</b></span>`
          : `<span class="pw-ya">—</span><span>You didn't play this one</span>`;
      return `<button class="pw-c k-${s.kind}${s.won ? ' won' : ''}" data-id="${s.id}" style="--d:${(.04 + j * .04).toFixed(2)}s">${s.won ? '<span class="pw-rib">YOU WON</span>' : ''}
        <div class="pw-h"><span class="pw-k"><svg viewBox="0 0 24 24">${IC[s.kind] || IC.wk}</svg>${KL[s.kind] || KL.wk}</span><span class="pw-d">${esc(s.date)}</span></div>
        <b class="pw-t">${esc(s.title)}</b><span class="pw-s">${esc(s.sub)}</span><div class="pw-pod">${pod}</div>
        <div class="pw-me ${s.won ? 'won' : s.rank ? '' : 'no'}">${meH}<em>Full board<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></em></div></button>` }
    function render(anim) { const L = list(), T = ALL.filter(inTab), wins = T.filter(s => s.won), played = T.filter(s => s.rank), best = played.length ? Math.min(...played.map(s => s.rank)) : null;
      $('#pwSum').innerHTML = `<div><b>${wins.length}</b><small>TIMES YOU WON</small></div><div><b>${best ? '#' + best : '—'}</b><small>BEST FINISH</small></div><div><b>${played.length}/${T.length}</b><small>SESSIONS PLAYED</small></div>`;
      $('#pwF').innerHTML = `<button data-f="all" class="${filt === 'all' ? 'on' : ''}">All <i>${T.length}</i></button><button data-f="won" class="${filt === 'won' ? 'on' : ''}">🏆 I won <i>${wins.length}</i></button><button data-f="played" class="${filt === 'played' ? 'on' : ''}">I played <i>${played.length}</i></button>`;
      const el = $('#pwList'); let j = 0, last = '';
      el.innerHTML = L.length ? L.map(s => { const g = `${MONL[s.when.getMonth()]} ${s.when.getFullYear()}`, h = g !== last ? `<div class="pw-g"><span>${g}</span><span>${L.filter(x => `${MONL[x.when.getMonth()]} ${x.when.getFullYear()}` === g).length} sessions</span></div>` : ''; last = g; return h + cardH(s, j++) }).join('')
        : `<div class="pw-empty"><b>${filt === 'won' ? 'No wins here yet' : 'Nothing to show'}</b>${filt === 'won' ? 'Finish in the prize spots and your wins will show up here.' : 'Try another filter.'}</div>`;
      if (anim) { replay(el, 'anim'); el.scrollTop = 0 } }
    function detail(id) { const s = ALL.find(x => x.id === id); if (!s) return; buzz();
      $('#pwdS').textContent = `${KL[s.kind] || KL.wk} · ${s.date.toUpperCase()}`; $('#pwdT').textContent = s.title; $('#pwdP').textContent = s.sub;
      const y = $('#pwdYou'); y.className = 'pwd-you' + (s.won ? ' won' : '');
      y.innerHTML = s.rank ? `<b>#${s.rank}</b><span><strong>${s.won ? `You won ${esc(s.prize ? s.prize[1] : 'Prize')}! 🎉` : 'Your finish'}</strong>${s.won ? (s.kind === 'quiz' ? 'It\u2019s in My prizes.' : 'Prize sent to your parent\u2019s email.') : s.rank <= 15 ? `So close. ${s.kind === 'quiz' ? 'Top 3' : 'Top 10'} win prizes.` : 'Keep practising to climb.'}</span>` : `<b>—</b><span><strong>You didn't play</strong>Jump into the next one to win.</span>`;
      const pz = (s.prizes || []).filter(Boolean).map((p, k) => `<div style="--bgc:${p[3]}">${renderPrizeArt(p[0])}<b>${esc(p[1])}</b><small>${['🥇 1ST', '🥈 2ND', '🥉 3RD'][k]}</small></div>`).join('');
      const rows = (s.rows || []).map((r, k) => { const rk = r.rank || k + 1; return (r.rank && r.rank > 10 ? '<div class="pwd-gap">···</div>' : '') + `<div class="pwd-r r${rk}${r.me ? ' pw-mine' : ''}"><span class="pw-rk">${rk}</span><span class="pw-av" style="--t:${r.c}">${r.me ? 'YOU' : ini(r.n)}</span><span class="pw-nm"><b>${esc(r.n)}</b><small>${esc(r.sub || '')}${rk <= 3 && s.prizes && s.prizes[rk - 1] ? ' · ' + esc(s.prizes[rk - 1][1]) : s.cons && rk <= 10 ? ' · ' + esc(s.cons[1]) : ''}</small></span><span class="pw-sc">${(r.score || 0).toLocaleString()}<small>${s.unit.toUpperCase()}</small></span></div>` }).join('');
      $('#pwdB').innerHTML = `${pz ? `<div class="pwd-l">PRIZES</div><div class="pwd-pz">${pz}</div>` : ''}${s.cons ? `<div class="pwd-con">${renderPrizeArt(s.cons[0])}<span>4th – 10th each won <b>${esc(s.cons[1])}</b></span></div>` : ''}<div class="pwd-l" style="margin-top:14px">FINAL BOARD</div><div class="pwd-rows">${rows}</div>`;
      $('#pwdF').innerHTML = `<button class="sec" data-a="close">Close</button>${s.won && s.kind === 'quiz' ? '<button class="pri" data-a="prizes">SEE MY PRIZE</button>' : ''}`;
      $('#pwdB').scrollTop = 0; $('#pwd').classList.add('open'); $('#pwdBd').classList.add('open'); SFX.play('pop') }
    function close() { $('#pwd').classList.remove('open'); $('#pwdBd').classList.remove('open') }
    const segBtns = [...document.querySelectorAll('#pwSeg button')], k = $('#pwK');
    const moveK = () => { const b = document.querySelector('#pwSeg button.on'); if (!b || !b.offsetWidth) return; k.style.width = b.offsetWidth + 'px'; k.style.transform = `translateX(${b.offsetLeft}px)` };
    segBtns.forEach(b => b.addEventListener('click', () => {
      if (b.classList.contains('on')) return;
      buzz();
      segBtns.forEach(x => x.classList.toggle('on', x === b));
      tab = b.dataset.t;
      filt = 'all';
      moveK();
      render(true);
      useAppStore.getState().setPwTab(tab);
    }));
    $('#pwF').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      buzz();
      if (b.dataset.f) {
        filt = b.dataset.f;
        render(true);
        useAppStore.getState().setPwFilter(filt);
      }
    });
    $('#pwList').addEventListener('click', e => { const c = e.target.closest('.pw-c'); if (c) detail(c.dataset.id) });
    $('#pwdF').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; buzz(); close(); if (b.dataset.a === 'prizes') toast('My prizes — next screen in the build') });
    ['#pwdX', '#pwdBd'].forEach(s => $(s).addEventListener('click', () => { buzz(); close() }));
    addEventListener('keydown', e => { if (e.key === 'Escape' && $('#pwd').classList.contains('open')) close() });
    $('#pwBack').addEventListener('click', () => { buzz(); close(); showLobby() });
    addEventListener('resize', moveK); document.fonts && document.fonts.ready.then(moveK);
    function open(keepFilter = false) {
      if (!keepFilter) {
        filt = 'all';
      }
      ALL = build();
      segBtns.forEach(x => x.classList.toggle('on', x.dataset.t === tab));
      render(true);
      requestAnimationFrame(moveK);
      useAppStore.setState({ pwTab: tab, pwFilter: filt });
    }
    function showPast(t) { tab = t || tab; buzz(); setTimeout(() => { SFX.play('whoosh');
      $('#s-lobby').classList.remove('play'); $('#s-lobby').classList.add('off');
      $('#s-past').classList.remove('off'); $('#s-past').classList.add('play'); open(false) }, 180) }
    function showLobby() { setTimeout(() => { SFX.play('whoosh');
      $('#s-past').classList.remove('play'); $('#s-past').classList.add('off');
      $('#s-lobby').classList.remove('off'); $('#s-lobby').classList.add('play');
      useAppStore.getState().setPwTab(null); }, 180) }
    $('#lbPast').addEventListener('click', () => {
      buzz();
      setTimeout(() => {
        SFX.play('whoosh');
        setTimeout(() => { location.href = 'past.html?tab=lb'; }, 260);
      }, 180);
    });
    return { showPast, refresh: () => { if ($('#s-past').classList.contains('play')) open(true) } };
  })();

  useAppStore.subscribe((s, prev) => {
    if (
      s.weeklyBoardsHistory !== prev.weeklyBoardsHistory ||
      s.quizSessionsHistory !== prev.quizSessionsHistory
    ) {
      PWIN.refresh();
    }
  });

  /* =================== CHALLENGE TYPES SCREEN =================== */
  const TICO = {
    speed: '<circle cx="12" cy="13" r="8"/><path d="M10 2.5h4M12 2.5V5M18.5 6.5l1.2-1.2"/><g class="hand"><path d="M12 13V8.5"/></g>',
    sudden: '<g class="beat"><path d="M12 20.5s-8.5-4.8-8.5-11A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.5c0 6.2-8.5 11-8.5 11z"/><path d="M12.6 8.5 10.8 12l2.6 1.2-1.6 3.3"/></g>',
    attack: '<g class="flip"><path d="M6 3h12M6 21h12"/><path d="M7.5 3c0 5 9 6 9 9s-9 4-9 9M16.5 3c0 5-9 6-9 9s9 4 9 9"/></g>',
    perfect: '<g class="tgt"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></g><circle cx="12" cy="12" r="1.2"/>',
    warm: '<g class="wave"><path d="M12 3c2.5 3 5 5.5 5 9.5a5 5 0 0 1-10 0C7 8.5 9.5 6 12 3z"/><path d="M12 17a2.2 2.2 0 0 1-2.2-2.2"/></g>',
    blitz: '<g class="zap"><path d="M13.5 2 4.5 13.5h6.5L10 22l9.5-12H13z"/></g>',
    iron: '<g class="shld"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/></g><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>'
  };

  // Visual gradient themes matching prototype
  const THEMES = [
    {
      themeId: 'speed',
      acc: '#c6f432',
      accs: '#eefad0',
      accd: '#3f6c05',
      btn: ['#e9ff8f', '#c6f432', '#a4d61a', '#5f8a07', '#1b1c19', '#c6f43277'],
      defaultBadge: 'POPULAR'
    },
    {
      themeId: 'sudden',
      acc: '#ff6b5a',
      accs: '#ffe7e3',
      accd: '#c23a2f',
      btn: ['#ffa08a', '#ff5a4e', '#e0382c', '#8a1a12', '#ffffff', '#ff5a4e77'],
      defaultBadge: 'HOT'
    },
    {
      themeId: 'attack',
      acc: '#ffb436',
      accs: '#fff0d6',
      accd: '#a65d07',
      btn: ['#ffdc85', '#ffae2e', '#f08a12', '#9a4605', '#2a1406', '#ffae2e77'],
      defaultBadge: ''
    },
    {
      themeId: 'perfect',
      acc: '#a593ff',
      accs: '#eeeaff',
      accd: '#5b47d6',
      btn: ['#cfc3ff', '#8f7cff', '#6d52ef', '#3a2496', '#ffffff', '#8f7cff77'],
      defaultBadge: 'NEW'
    },
    {
      themeId: 'warm',
      acc: '#36d1b6',
      accs: '#ddf8f2',
      accd: '#0a7a66',
      btn: ['#a6f5e7', '#36d1b6', '#17a58c', '#0a5e50', '#062a24', '#36d1b677'],
      defaultBadge: ''
    },
    {
      themeId: 'blitz',
      acc: '#ff4fa8',
      accs: '#ffe3f1',
      accd: '#b0145f',
      btn: ['#ffb3dc', '#ff4fa8', '#e0288a', '#7d0f49', '#ffffff', '#ff4fa877'],
      defaultBadge: 'HOT'
    },
    {
      themeId: 'iron',
      acc: '#3d7cf2',
      accs: '#e2ecff',
      accd: '#1d45b0',
      btn: ['#b5d2ff', '#3d7cf2', '#2a5fd6', '#122c75', '#ffffff', '#3d7cf277'],
      defaultBadge: 'PRO'
    }
  ];

  let currentChallenges = [];
  let selT = 0;
  const PER = 4;
  let tPage = -1;

  function paintDots(p, nPages) {
    if (p === tPage) return;
    tPage = p;
    document.querySelectorAll('#mdots button').forEach((b, k) => {
      b.classList.toggle('on', k === p);
      b.setAttribute('aria-selected', k === p);
    });
  }

  function goPage(p, instant) {
    const g = $('#mgrid');
    const nPages = Math.max(1, Math.ceil(currentChallenges.length / PER));
    p = Math.max(0, Math.min(nPages - 1, p));
    if (g) {
      g.scrollTo({ left: p * g.clientWidth, behavior: instant ? 'auto' : 'smooth' });
    }
    paintDots(p, nPages);
  }

  function setupCarouselInteractions() {
    const g = $('#mgrid');
    if (!g || g.dataset.carouselInit) return;
    g.dataset.carouselInit = 'true';

    g.addEventListener('scroll', () => {
      if (g.clientWidth && currentChallenges.length) {
        const nPages = Math.max(1, Math.ceil(currentChallenges.length / PER));
        paintDots(Math.round(g.scrollLeft / g.clientWidth), nPages);
      }
    }, { passive: true });

    const dots = $('#mdots');
    if (dots) {
      dots.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b) {
          buzz();
          goPage(+b.dataset.p);
        }
      });
    }

    // Pointer drag-to-scroll for desktop / touch preview
    let x0 = null, l0 = 0, moved = false;
    g.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      x0 = e.clientX;
      l0 = g.scrollLeft;
      moved = false;
    });
    addEventListener('pointermove', e => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 6) {
        moved = true;
        g.style.scrollSnapType = 'none';
        g.style.scrollBehavior = 'auto';
        g.scrollLeft = l0 - dx;
      }
    });
    addEventListener('pointerup', e => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      x0 = null;
      g.style.scrollSnapType = '';
      g.style.scrollBehavior = '';
      if (moved && g.clientWidth) {
        const cur = Math.round(l0 / g.clientWidth);
        goPage(Math.abs(dx) > g.clientWidth * 0.18 ? cur + (dx < 0 ? 1 : -1) : cur);
      }
    });
    g.addEventListener('click', e => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    }, true);
  }

  function buildChallengeModel(raw, idx) {
    const ct = raw.challengeType;
    const slug = (ct?.slug || '').toLowerCase();

    // Pick matching theme by slug or fallback to index cycling
    let theme = THEMES.find(th => th.themeId === slug);
    if (!theme) {
      theme = THEMES[idx % THEMES.length];
    }

    // Map difficulty: easy -> 1, medium -> 2, hard -> 3
    const diffMap = { easy: 1, medium: 2, hard: 3 };
    const diff = diffMap[raw.difficultyLevel?.toLowerCase()] || (idx % 3 + 1);

    const questionsCount = ct?.questionsCount || 6;
    const timeLimit = ct?.timeLimitSeconds || (diff === 1 ? 60 : diff === 2 ? 120 : 30);
    const timeStr = timeLimit ? `${timeLimit / 60 | 0}:${String(timeLimit % 60).padStart(2, '0')}` : 'No limit';
    const reqCorrect = ct?.requiredCorrectAnswers || (ct?.minAccuracyPercentage ? `${Math.round(questionsCount * Number(ct.minAccuracyPercentage) / 100)}/${questionsCount}` : (ct?.requiresPerfectScore ? `${questionsCount}/${questionsCount}` : `${Math.max(1, questionsCount - 2)}/${questionsCount}`));

    const badge = raw.isLocked ? 'LOCKED' : (theme.defaultBadge || (diff === 3 ? 'HARD' : ''));
    const name = raw.title || ct?.name || 'Challenge';
    const tag = ct?.description || `Score points & conquer the leaderboard.`;

    const stats = [
      [String(questionsCount), 'questions'],
      [String(reqCorrect), 'to pass'],
      [timeStr, 'time limit'],
      ['+' + raw.dumoPoints, 'points']
    ];

    return {
      raw,
      id: raw.id,
      themeId: theme.themeId,
      name,
      tag,
      badge,
      diff,
      dumoPoints: raw.dumoPoints,
      isLocked: raw.isLocked,
      hasQuestions: raw.hasQuestions,
      acc: theme.acc,
      accs: theme.accs,
      accd: theme.accd,
      btn: theme.btn,
      best: '—',
      stats
    };
  }

  function challengeCardHtml(t, i) {
    return `<button class="mc${t.isLocked ? ' locked' : ''}" data-i="${i}" data-t="${t.themeId}" aria-pressed="false">
      <span class="wm3"><svg viewBox="0 0 24 24">${TICO[t.themeId] || TICO.speed}</svg></span>
      <span class="top">
        <span class="mi"><svg viewBox="0 0 24 24">${t.isLocked ? '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>' : (TICO[t.themeId] || TICO.speed)}</svg></span>
        <span class="cn"><i></i>+${t.dumoPoints}</span>
      </span>
      <span>
        ${t.badge ? `<span class="bdg${t.badge === 'HOT' ? ' hot' : (t.isLocked ? ' locked-bdg' : '')}">${t.badge}</span>` : ''}
        <span class="nm5">${esc(t.name.toUpperCase())}</span>
        <span class="tg5">${esc(t.tag)}</span>
        <span class="df">${[1, 2, 3].map(k => `<i class="${k <= t.diff ? 'on' : ''}"></i>`).join('')}</span>
      </span>
    </button>`;
  }

  function renderTypesGrid() {
    setupCarouselInteractions();
    const dots = $('#mdots');

    if (!currentChallenges.length) {
      $('#mgrid').innerHTML = `<div style="flex:0 0 100%;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ffffff99;gap:10px;padding:40px 10px;text-align:center">
        <svg viewBox="0 0 24 24" style="width:36px;height:36px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <span>No challenges available for this subject</span>
      </div>`;
      if (dots) dots.hidden = true;
      $('#mstats').innerHTML = '';
      $('#mgo').style.pointerEvents = 'none';
      $('#mgo').style.opacity = '0.5';
      return;
    }

    $('#mgo').style.pointerEvents = '';
    $('#mgo').style.opacity = '';

    const nPages = Math.max(1, Math.ceil(currentChallenges.length / PER));

    // Render paginated groups matching references/index.html
    $('#mgrid').innerHTML = Array.from({ length: nPages }, (_, p) =>
      `<div class="mpg" role="group" aria-label="Page ${p + 1} of ${nPages}">${Array.from({ length: PER }, (_, k) => {
        const i = p * PER + k;
        return currentChallenges[i] ? challengeCardHtml(currentChallenges[i], i) : '<span class="mc empty" aria-hidden="true"></span>';
      }).join('')}</div>`
    ).join('');

    if (dots) {
      dots.innerHTML = Array.from({ length: nPages }, (_, p) =>
        `<button role="tab" aria-label="Page ${p + 1}" data-p="${p}"></button>`
      ).join('');
      dots.hidden = nPages < 2;
    }

    tPage = -1;
    paintDots(0, nPages);
  }

  function selectType(i, first) {
    if (!currentChallenges.length) return;
    selT = i;
    const t = currentChallenges[i];
    $('#mgrid').classList.add('has');
    document.querySelectorAll('#mgrid .mc[data-i]').forEach(c => {
      const k = +c.dataset.i;
      c.classList.toggle('sel', k === i);
      c.setAttribute('aria-pressed', k === i);
    });
    const p = $('#mpanel');
    p.style.setProperty('--acc', t.acc);
    p.style.setProperty('--accs', t.accs);
    p.style.setProperty('--accd', t.accd);
    $('#mstats').innerHTML = t.stats.map(s => `<div><b>${s[0]}</b><small>${s[1]}</small></div>`).join('');
    $('#mbest').textContent = t.best;
    $('#mgoT').textContent = (t.isLocked ? 'LOCKED' : 'START ' + t.name.toUpperCase());
    const g = $('#mgo'), [c1, c2, c3, e, tx, gl] = t.btn;
    g.style.cssText = `--c1:${c1};--c2:${c2};--c3:${c3};--edge:${e};--tx:${tx};--glow:${gl}`;
    if (t.isLocked) {
      g.style.opacity = '0.7';
    } else {
      g.style.opacity = '1';
    }
    if (!first) {
      replay(p, 'swap');
      buzz();
    }
  }

  $('#mgrid').addEventListener('click', e => {
    const c = e.target.closest('.mc');
    if (!c) return;
    const i = +c.dataset.i;
    if (i === selT) {
      launchType(currentChallenges[i]);
      return;
    }
    selectType(i);
  });

  $('#mgo').addEventListener('click', () => {
    if (!currentChallenges.length) return;
    launchType(currentChallenges[selT]);
  });

  async function openTypes() {
    buzz();
    const sName = selectedSubject ? selectedSubject.name : 'Mathematics';
    const cName = selectedCategory ? selectedCategory.name : 'All Chapters';
    const cIdx = selectedCategory?.priorityIndex || 1;

    $('#tchip').innerHTML = `<i><svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/></svg></i><span>${esc(sName)} · Ch ${cIdx} ${esc(cName)}</span>`;

    // Render loading indicator in mgrid
    $('#mgrid').innerHTML = `<div style="flex:0 0 100%;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ffffffb3;gap:10px;padding:50px 10px">
      <div class="pk-spin" style="width:32px;height:32px;border:3px solid #ffffff33;border-top-color:#c6f432;border-radius:50%;animation:spin 0.8s linear infinite"></div>
      <span style="font-size:13px;font-weight:600">Loading challenges...</span>
    </div>`;
    const dots = $('#mdots');
    if (dots) dots.hidden = true;

    setTimeout(() => {
      SFX.play('whoosh');
      $('#s-lobby').classList.remove('play');
      $('#s-lobby').classList.add('off');
      $('#s-types').classList.remove('off');
      $('#s-types').classList.add('play');
    }, 180);

    // Fetch challenges from endpoint GET /api/v1/challenges?subject_id={subjectId}
    try {
      const subjectId = selectedSubject ? selectedSubject.id : 1;
      const rawList = await fetchChallenges(subjectId);
      currentChallenges = rawList.map((c, idx) => buildChallengeModel(c, idx));
      renderTypesGrid();
      if (currentChallenges.length) {
        selectType(0, true);
        goPage(0, true);
        replay($('#mgrid'), 'anim');
      }
    } catch (err) {
      console.error('Failed to load challenges:', err);
      toast('Failed to load challenges from server');
      $('#mgrid').innerHTML = `<div style="flex:0 0 100%;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ff6b5a;gap:10px;padding:40px 10px;text-align:center">
        <span>Failed to load challenges</span>
      </div>`;
      if (dots) dots.hidden = true;
    }
  }

  function closeTypes() {
    setTimeout(() => {
      SFX.play('whoosh');
      $('#s-types').classList.remove('play');
      $('#s-types').classList.add('off');
      $('#s-lobby').classList.remove('off');
      $('#s-lobby').classList.add('play');
    }, 180);
  }

  $('#typesBack').addEventListener('click', () => { buzz(); closeTypes() });

  /* ===================== DRILL ENGINE (LIVE QUESTIONS & API) ===================== */
  const fmtS = ms => {
    const t = Math.max(0, ms) / 1000, m = t / 60 | 0, s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  };
  const fmtL = s => `${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`;

  const D = {
    t: null,
    attemptId: 0,
    qs: [],
    i: 0,
    ok: 0,
    res: [],
    ms: 0,
    run: false,
    t0: 0,
    qStart: 0,
    raf: 0,
  };

  let countTimers = [];

  function drillTick(now) {
    if (!D.run) return;
    const ms = D.ms + (now - D.t0);
    const lim = (D.t?.raw?.challengeType?.timeLimitSeconds || 60) * 1000;
    $('#dTime').textContent = fmtS(ms);
    const sTime = $('#sTime');
    if (sTime) sTime.textContent = fmtS(ms);
    $('#dTime').classList.toggle('warn', ms > lim * 0.8);
    const f = Math.max(0, 1 - ms / lim);
    $('#tbarI').style.transform = `scaleX(${f})`;
    $('#tbar').classList.toggle('low', f < 0.2);
    D.raf = requestAnimationFrame(drillTick);
  }

  function pauseDrill() {
    if (!D.run) return;
    D.ms += performance.now() - D.t0;
    D.run = false;
    cancelAnimationFrame(D.raf);
  }

  function resumeDrill() {
    D.t0 = performance.now();
    D.qStart = performance.now();
    D.run = true;
    D.raf = requestAnimationFrame(drillTick);
  }

  function openStim() {
    const q = D.qs[D.i];
    if (!q || !q.stimulus) return;
    buzz();
    const S = q.stimulus;
    const stimEl = $('#stim');
    if (!stimEl) return;
    $('#sKind').textContent = (S.stimulusType || 'READ THIS').toUpperCase();
    $('#sTitle').textContent = S.stimulusName || 'Passage';
    $('#sH').textContent = S.stimulusName || 'Passage';

    const sImg = $('#sImg');
    if (S.stimulusImageUrl) {
      sImg.innerHTML = `<img src="${esc(S.stimulusImageUrl)}" alt="Passage Illustration" />`;
      sImg.style.display = 'grid';
    } else {
      sImg.innerHTML = '';
      sImg.style.display = 'none';
    }

    const sTxt = $('#sTxt');
    const textContent = S.stimulusText || '';
    sTxt.innerHTML = textContent ? formatMathAndText(textContent) : '';

    const sQ = $('#sQ');
    if (sQ) sQ.innerHTML = `<b>Q${D.i + 1}.</b> ${formatMathAndText(q.questionText || '')}`;

    const sb = stimEl.querySelector('.sb');
    if (sb) sb.scrollTop = 0;
    stimEl.classList.add('open');
  }

  function closeStim() {
    const stimEl = $('#stim');
    if (stimEl) stimEl.classList.remove('open');
  }

  $('#qbox').addEventListener('click', e => {
    if (e.target.closest('#rmBtn')) openStim();
  });
  const sClose = $('#sClose');
  if (sClose) sClose.addEventListener('click', () => { buzz(); closeStim() });
  const sBack = $('#sBack');
  if (sBack) sBack.addEventListener('click', () => { buzz(); closeStim() });

  function renderQ() {
    if (!D.qs || !D.qs.length) return;
    const q = D.qs[D.i];
    const totalN = D.qs.length;
    const qb = $('#qbox');
    const hasStim = Boolean(q.stimulus);
    qb.className = 'qbox' + (q.questionImageUrl ? ' has-img' : '') + (hasStim ? ' has-stim' : '');

    const bk = '<svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>';
    const stimBtn = hasStim
      ? `<button class="rm" id="rmBtn" type="button"><i>${bk}</i>Read passage<em>${esc(q.stimulus.stimulusName || 'View')}</em><span class="rmp"></span></button>`
      : '';

    qb.innerHTML = `<small>QUESTION ${D.i + 1} OF ${totalN} · ${esc(D.t?.name?.toUpperCase() || 'CHALLENGE')}${hasStim ? ' · ' + esc((q.stimulus.stimulusType || 'READING').toUpperCase()) : ''}</small>
      <p>${formatMathAndText(q.questionText || '')}</p>
      ${q.questionImageUrl ? `<div class="qimg"><img src="${esc(q.questionImageUrl)}" alt="Question Illustration" /></div>` : ''}
      ${stimBtn}`;

    const segs = $('#segs');
    if (segs.children.length !== totalN) {
      segs.innerHTML = Array.from({ length: totalN }, () => '<i></i>').join('');
    }
    segs.querySelectorAll('i').forEach((s, k) => {
      s.className = k < D.i ? (D.res[k] ? 'ok' : 'no') : (k === D.i ? 'cur' : '');
    });

    const ck = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    const xx = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>';
    const options = q.options || [];

    $('#ans').innerHTML = options.map((o, k) => `<button class="an" data-id="${o.id}">
      <span class="lt">${'ABCD'[k] || (k + 1)}</span>
      <span class="v">${formatMathAndText(o.optionText)}</span>
      <span class="mk">${ck}</span>
    </button>`).join('');

    const b = $('#qbox'), a = $('#ans');
    replay(b, 'inq');
    replay(a, 'inq');
    a.classList.remove('lock');
  }

  $('#ans').addEventListener('click', async e => {
    const btn = e.target.closest('.an');
    if (!btn || !D.run) return;
    pauseDrill();

    const optionId = Number(btn.dataset.id);
    const q = D.qs[D.i];
    const selectedOption = (q.options || []).find(o => o.id === optionId);
    D.pick[D.i] = selectedOption ? selectedOption.optionText : '';
    const timeTaken = Math.max(1, Math.round((performance.now() - D.qStart) / 1000));

    $('#ans').classList.add('lock');

    // Call POST /api/v1/challenges/attempts/{id}/answer with groupedQuestionId if present
    let good = false;
    let correctOptId = null;
    try {
      const ansRes = await submitChallengeAnswer(D.attemptId, {
        questionId: q.parentQuestionId || q.id,
        groupedQuestionId: q.groupedQuestionId ?? null,
        selectedOptionId: optionId,
        timeTakenSeconds: timeTaken,
      });
      good = ansRes.isCorrect;
      correctOptId = ansRes.correctOptionId;
      if (correctOptId) {
        const correctOpt = (q.options || []).find(o => o.id === correctOptId);
        if (correctOpt) q.correctOptionText = correctOpt.optionText;
      }
    } catch (err) {
      console.error('Answer submission error:', err);
      // Fallback
      good = false;
    }

    D.res[D.i] = good;
    if (good) D.ok++;

    SFX.play(good ? 'ok' : 'no');

    document.querySelectorAll('#ans .an').forEach(x => {
      const oId = Number(x.dataset.id);
      if (x === btn) {
        x.classList.add(good ? 'ok' : 'no');
      } else if (correctOptId && oId === correctOptId) {
        x.classList.add('ok');
      } else {
        x.classList.add('dim');
      }
    });

    $('#dOk').textContent = D.ok;
    const f = $('#flash');
    f.className = 'flash';
    void f.offsetWidth;
    f.className = 'flash ' + (good ? 'ok' : 'no');
    if (good) replay($('#plus1'), 'go');
    try { navigator.vibrate && navigator.vibrate(good ? 12 : [30, 40, 30]) } catch (_) { }

    const segsI = $('#segs').querySelectorAll('i');
    if (segsI[D.i]) segsI[D.i].className = good ? 'ok' : 'no';

    setTimeout(async () => {
      D.i++;
      if (D.i >= D.qs.length) {
        // Complete the attempt first so backend sets status='completed'
        if (D.attemptId && !D.completed) {
          try {
            D.completedResult = await completeChallengeAttempt(D.attemptId);
            D.completed = true;
          } catch (err) {
            console.error('Error completing challenge attempt before review:', err);
          }
        }
        RV.open(true);
        return;
      }
      $('#qbox').classList.add('outq');
      setTimeout(() => {
        renderQ();
        resumeDrill();
      }, 200);
    }, good ? 520 : 900);
  });

  async function finishDrill() {
    const t = D.t;
    const ms = D.ms;
    const ct = t?.raw?.challengeType;
    const totalQ = D.qs.length || 6;
    const timeLimit = ct?.timeLimitSeconds || 60;
    const timeOk = ms <= timeLimit * 1000;

    // Call POST /api/v1/challenges/attempts/{id}/complete
    let isPassed = false;
    let coinsEarned = t.dumoPoints;
    try {
      const compRes = D.completedResult || await completeChallengeAttempt(D.attemptId);
      isPassed = compRes.isPassed;
      if (compRes.coinsEarned != null) {
        coinsEarned = compRes.coinsEarned;
      }
    } catch (err) {
      console.error('Complete challenge attempt error:', err);
      isPassed = D.ok >= Math.ceil(totalQ * 0.5);
    }

    const win = isPassed;
    const r = $('#res');
    const c = win ? ['#c6f432', '#6f9a0b', '#1b1c19'] : ['#ff6b5a', '#a3241a', '#fff'];
    r.style.setProperty('--rc', c[0]);
    r.style.setProperty('--rcd', c[1]);
    r.style.setProperty('--rtx', c[2]);

    $('#resIco').innerHTML = win
      ? '<svg viewBox="0 0 48 48"><path d="M14 8h20v10a10 10 0 0 1-20 0z" fill="#fff" stroke="#1b1c19" stroke-width="3" stroke-linejoin="round"/><path d="M14 11H7c0 6 3 9 8 10M34 11h7c0 6-3 9-8 10" fill="none" stroke="#1b1c19" stroke-width="3" stroke-linecap="round"/><path d="M21 28h6v7h-6zM15 36h18v5H15z" fill="#1b1c19"/></svg>'
      : '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="#fff"/><path d="M17 20h.1M31 20h.1" stroke="#1b1c19" stroke-width="5" stroke-linecap="round"/><path d="M17 32c4-4 10-4 14 0" fill="none" stroke="#1b1c19" stroke-width="3.2" stroke-linecap="round"/></svg>';

    $('#resT').innerHTML = win ? 'CHALLENGE <span>BEATEN!</span>' : 'SO <span>CLOSE!</span>';
    $('#resSub').textContent = win
      ? `You completed ${t.name}. Coins awarded!`
      : `Keep practicing! You answered ${D.ok}/${totalQ} correctly.`;

    $('#resEarn').style.display = win ? '' : 'none';
    $('#resPts').textContent = '+' + coinsEarned;

    const st = ok => ok
      ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>';

    $('#ckA').className = 'ck2 ' + (win ? 'pass' : 'fail');
    $('#ckA .st').innerHTML = st(win);
    $('#ckAv').textContent = `${D.ok}/${totalQ} · ${Math.round(D.ok / totalQ * 100)}%`;
    $('#ckAn').textContent = `Target: ${t.stats?.[1]?.[0] || 'Pass'}`;

    $('#ckT').className = 'ck2 ' + (timeOk ? 'pass' : 'fail');
    $('#ckT .st').innerHTML = st(timeOk);
    $('#ckTv').textContent = fmtS(ms);
    $('#ckTn').textContent = `Limit ${fmtL(timeLimit)}`;

    $('#resDots').innerHTML = D.res.map(x => `<i class="${x ? 'ok' : 'no'}"></i>`).join('');
    $('#resAgain .lbl').textContent = win ? 'PLAY AGAIN' : 'TRY AGAIN';

    r.classList.add('show');
    SFX.play(win ? 'win' : 'lose');

    // Trigger Streak celebration modal if applicable
    if (win) {
      setTimeout(() => {
        STK.afterChallenge();
      }, reduce ? 300 : 1300);
    }
  }

  function quitDrill() {
    pauseDrill();
    closeStim();
    STK.close(false);
    buzz();
    $('#res').classList.remove('show');
    $('#s-drill').classList.remove('play');
    $('#s-drill').classList.add('off');
    $('#s-types').classList.remove('off');
    $('#s-types').classList.add('play');
  }

  $('#dQuit').addEventListener('click', quitDrill);
  $('#resBack').addEventListener('click', quitDrill);
  $('#resAgain').addEventListener('click', () => {
    buzz();
    $('#res').classList.remove('show');
    if (D.t) launchType(D.t);
  });
  $('#resRev').addEventListener('click', () => {
    buzz();
    RV.open(false);
  });

  /* =================== REVIEW · EXPLANATION · ASK BOT =================== */
  const RV = (() => {
    const CK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    const XX = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>';
    const CHV = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';

    let reviewData = null;
    let xi = 0;
    let ctx = null;
    let busy = false;
    let post = false;

    async function loadReview(attemptId) {
      if (!attemptId) return null;
      try {
        const res = await fetchChallengeReview(attemptId);
        reviewData = res;
        return res;
      } catch (err) {
        console.warn('Could not load server challenge review, using attempt state:', err);
        return null;
      }
    }

    async function open(isPost) {
      post = isPost;
      const n = D.qs.length || 6;
      $('#rvS').textContent = isPost ? `ALL ${n} ANSWERED` : (D.t && D.t.name ? D.t.name.toUpperCase() : 'CHALLENGE');
      $('#rvSc').innerHTML = `${D.ok}<em>/${n}</em>`;
      $('#rvTm').textContent = fmtS(D.ms);
      $('#rvBar').innerHTML = D.res.map(r => `<i class="${r ? 'ok' : 'no'}"></i>`).join('');
      $('#rvX').hidden = isPost;
      $('#rvGoT').textContent = isPost ? 'SEE RESULTS' : 'BACK TO RESULTS';

      // Show skeleton / current state while fetching server review if available
      paintReviewList();
      $('#rvL').scrollTop = 0;
      $('#rv').classList.add('open');
      SFX.play('pop');

      if (D.attemptId) {
        const remote = await loadReview(D.attemptId);
        if (remote && remote.questions && remote.questions.length) {
          paintReviewList();
        }
      }
    }

    function paintReviewList() {
      const items = (reviewData && reviewData.questions && reviewData.questions.length)
        ? reviewData.questions.map((rq, idx) => {
          const ok = rq.userAnswer ? rq.userAnswer.isCorrect : Boolean(D.res[idx]);
          const userText = rq.userAnswer ? rq.userAnswer.selectedOptionText : (D.pick[idx] || null);
          const correctText = rq.correctAnswer ? rq.correctAnswer.optionText : (rq.options.find(o => o.isCorrect)?.optionText || D.qs[idx]?.correctOptionText || '');
          return {
            qText: rq.questionText || D.qs[idx]?.questionText || '',
            ok,
            userText,
            correctText,
            explanationText: rq.explanationText,
            options: rq.options,
            rawReview: rq,
          };
        })
        : D.qs.map((q, idx) => {
          const ok = Boolean(D.res[idx]);
          const userText = D.pick[idx] || null;
          const correctText = q.correctOptionText || '';
          return {
            qText: q.questionText || '',
            ok,
            userText,
            correctText,
            explanationText: null,
            options: (q.options || []).map(o => ({ id: o.id, optionText: o.optionText, isCorrect: o.optionText === correctText })),
            rawReview: null,
          };
        });

      $('#rvL').innerHTML = items.map((it, i) => {
        const ok = it.ok;
        const y = it.userText;
        return `<button class="rvi ${ok ? 'ok' : 'no'}" data-i="${i}">
          <span class="n">${i + 1}<i>${ok ? CK : XX}</i></span>
          <span class="m">
            <small>QUESTION ${i + 1} · ${ok ? 'CORRECT' : 'WRONG'}</small>
            <b>${formatMathAndText(it.qText)}</b>
            <span class="a">
              ${y != null ? `<span class="y">${ok ? '✓ ' : ''}${formatMathAndText(y)}</span>` : '<span class="y">No answer</span>'}
              ${ok ? '' : (it.correctText ? `<span class="c">✓ ${formatMathAndText(it.correctText)}</span>` : '')}
            </span>
          </span>
          ${CHV}
        </button>`;
      }).join('');
    }

    function close() {
      $('#rv').classList.remove('open');
    }

    function openX(i) {
      xi = i;
      const n = D.qs.length || 6;
      let qText = '';
      let ok = Boolean(D.res[i]);
      let userText = D.pick[i] || null;
      let correctText = '';
      let explanation = '';
      let opts = [];
      let stimulus = D.qs[i]?.stimulus || null;
      let imgUrl = D.qs[i]?.questionImageUrl || null;

      if (reviewData && reviewData.questions && reviewData.questions[i]) {
        const rq = reviewData.questions[i];
        qText = rq.questionText;
        imgUrl = rq.questionImageUrl || imgUrl;
        ok = rq.userAnswer ? rq.userAnswer.isCorrect : ok;
        userText = rq.userAnswer ? rq.userAnswer.selectedOptionText : userText;
        correctText = rq.correctAnswer ? rq.correctAnswer.optionText : (rq.options.find(o => o.isCorrect)?.optionText || '');
        explanation = rq.explanationText || '';
        opts = rq.options.map((o, k) => {
          const selId = rq.userAnswer ? rq.userAnswer.selectedOptionId : null;
          const isMine = selId != null ? o.id === selId : o.optionText === userText;
          const isCorrect = o.isCorrect
            || (rq.correctAnswer && rq.correctAnswer.optionId != null && o.id === rq.correctAnswer.optionId)
            || (correctText && o.optionText === correctText)
            || (ok && isMine);
          return {
            letter: 'ABCD'[k] || String(k + 1),
            text: o.optionText,
            isCorrect,
            isMine,
          };
        });
      } else {
        const q = D.qs[i];
        qText = q?.questionText || '';
        correctText = q?.correctOptionText || '';
        opts = (q?.options || []).map((o, k) => {
          const isCorrect = o.optionText === correctText;
          const isMine = o.optionText === userText;
          return {
            letter: 'ABCD'[k] || String(k + 1),
            text: o.optionText,
            isCorrect,
            isMine,
          };
        });
      }

      if (!explanation) {
        explanation = '';
      }

      $('#xpN').textContent = `Question ${i + 1} of ${n}`;
      const P = $('#xpP');
      P.className = 'xpst ' + (ok ? 'ok' : 'no');
      P.innerHTML = (ok ? CK : XX) + (ok ? 'CORRECT' : 'WRONG');

      const optsHtml = opts.map(o => {
        const cls = o.isCorrect ? 'c' : (o.isMine ? 'y' : 'dim');
        const badge = o.isCorrect && o.isMine ? '<em>YOUR ANSWER</em>' : (o.isCorrect ? '<em>CORRECT</em>' : (o.isMine ? '<em>YOUR ANSWER</em>' : ''));
        return `<div class="${cls}">
          <span class="lt">${o.letter}</span>
          <span class="v">${formatMathAndText(o.text)}</span>
          ${badge}
        </div>`;
      }).join('');

      const stimHtml = stimulus ? `<details><summary>${esc((stimulus.stimulusType || 'PASSAGE').toUpperCase())} · ${esc(stimulus.stimulusName || 'Reading')}</summary><p>${formatMathAndText(stimulus.stimulusText || '')}</p></details>` : '';
      const imgHtml = imgUrl ? `<div class="qimg"><img src="${esc(imgUrl)}" style="max-height:160px;border-radius:12px" alt="Question Image"/></div>` : '';

      const whyHtml = explanation
        ? `<div class="xpw">
            <h4><svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>WHY?</h4>
            <p>${formatMathAndText(explanation)}</p>
            ${ok ? '' : `<p class="yr">You picked <b>${esc(userText || 'nothing')}</b>. The right answer is <b>${esc(correctText || 'shown above')}</b>.</p>`}
          </div>`
        : '';

      $('#xpB').innerHTML = `<div class="xpq">${formatMathAndText(qText)}${imgHtml}${stimHtml}</div>
        <div class="xpo">${optsHtml}</div>
        ${whyHtml}`;

      $('#xpPrev').disabled = i === 0;
      $('#xpNext').disabled = i === n - 1;
      $('#xpB').scrollTop = 0;
      const x = $('#xp');
      if (x.classList.contains('open')) replay(x, 'open');
      x.classList.add('open');
    }

    function closeX() {
      $('#xp').classList.remove('open');
    }

    /* ---- AI Study Bot Modal ---- */
    const bubble = (who, html) => {
      const m = document.createElement('div');
      m.className = 'bm ' + who;
      m.innerHTML = html;
      $('#botL').appendChild(m);
      $('#botL').scrollTop = 1e6;
      return m;
    };

    function openBot() {
      const q = D.qs[xi];
      const rq = reviewData?.questions?.[xi];
      const qId = rq?.questionId || q?.parentQuestionId || q?.id;
      const qTextStr = rq?.questionText || q?.questionText || '';
      const ok = rq?.userAnswer ? rq.userAnswer.isCorrect : Boolean(D.res[xi]);

      ctx = {
        qId,
        qText: qTextStr,
        i: xi,
        ok,
        explanation: rq?.explanationText || '',
        correctText: rq?.correctAnswer?.optionText || q?.correctOptionText || '',
      };

      $('#botL').innerHTML = '';
      $('#botIn').value = '';
      autoGrow();

      $('#botQn').textContent = `QUESTION ${xi + 1} · ${ok ? 'CORRECT' : 'WRONG'}`;
      $('#botQt').textContent = qTextStr.replace(/\$[^$]+\$/g, '').trim();
      $('#botQ').classList.remove('used');
      $('#botPush').innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>Push to message';

      $('#botCh').innerHTML = [
        `Why is it the correct answer?`,
        'Explain step by step',
        'Give me a hint',
        'Give me a similar question'
      ].map(t => `<button type="button">${esc(t)}</button>`).join('');

      bubble('b', `Hi! I'm <b>RI9 Buddy</b>. I can help with question ${xi + 1}.<br>Tap <b>Push to message</b> to drop the question into your message, add what's confusing you, then send.`);
      $('#bot').classList.add('open');
      SFX.play('pop');
    }

    function closeBot() {
      $('#bot').classList.remove('open');
      $('#botIn').blur();
    }

    function autoGrow() {
      const t = $('#botIn');
      t.style.height = 'auto';
      t.style.height = Math.min(120, t.scrollHeight) + 'px';
      $('#botSend').disabled = !t.value.trim() || busy;
    }

    function insert(txt, sep) {
      const t = $('#botIn');
      const v = t.value;
      t.value = v ? (v.replace(/\s+$/, '') + (sep || '\n') + txt) : txt;
      autoGrow();
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
      t.scrollTop = 1e6;
      replay(t, 'tapulse');
    }

    async function send() {
      const t = $('#botIn');
      const v = t.value.trim();
      if (!v || busy) return;
      buzz();
      busy = true;
      bubble('u', esc(v));
      t.value = '';
      autoGrow();

      const ty = bubble('b typing', '<i></i><i></i><i></i>');
      try {
        const response = await askBotQuestion({
          questionText: v,
          relatedQuestionId: ctx.qId || null,
        });
        ty.remove();
        if (response.responseText) {
          bubble('b', formatMathAndText(response.responseText));
          SFX.play('pop');
        } else {
          bubble('b', 'Sorry, I could not generate a response right now. Please try again.');
        }
      } catch (err) {
        console.error('Bot API call error:', err);
        ty.remove();
        const errMessage = err?.message || 'Failed to generate response. Please try again.';
        bubble('b', esc(errMessage));
      } finally {
        busy = false;
        autoGrow();
      }
    }

    $('#rvL').addEventListener('click', ev => {
      const b = ev.target.closest('.rvi');
      if (b) {
        buzz();
        openX(+b.dataset.i);
      }
    });
    $('#rvGo').addEventListener('click', () => {
      buzz();
      close();
      if (post) {
        post = false;
        setTimeout(finishDrill, reduce ? 0 : 200);
      }
    });
    $('#rvX').addEventListener('click', () => {
      buzz();
      close();
    });
    $('#xpX').addEventListener('click', () => {
      buzz();
      closeX();
    });
    $('#xpPrev').addEventListener('click', () => {
      if (xi > 0) {
        buzz();
        openX(xi - 1);
      }
    });
    $('#xpNext').addEventListener('click', () => {
      if (xi < (D.qs.length || 6) - 1) {
        buzz();
        openX(xi + 1);
      }
    });
    $('#xpAsk').addEventListener('click', () => {
      buzz();
      openBot();
    });
    $('#botX').addEventListener('click', () => {
      buzz();
      closeBot();
    });
    $('#botPush').addEventListener('click', () => {
      buzz();
      insert(ctx.qText + '\n');
      $('#botQ').classList.add('used');
      $('#botPush').innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>Push again';
    });
    $('#botCh').addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (b) {
        buzz();
        insert(b.textContent, ' ');
      }
    });
    $('#botIn').addEventListener('input', autoGrow);
    $('#botIn').addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault();
        send();
      }
    });
    $('#botSend').addEventListener('click', send);

    addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      if ($('#bot').classList.contains('open')) closeBot();
      else if ($('#xp').classList.contains('open')) closeX();
      else if ($('#rv').classList.contains('open') && !post) close();
    });

    return { open, closeAll() { post = false; closeBot(); closeX(); close(); } };
  })();

  function countdownThen(cb) {
    const launchEl = $('#launch');
    const cntEl = $('#cnt');
    countTimers.forEach(clearTimeout);
    countTimers = [];

    launchEl.hidden = false;
    const seq = reduce ? ['GO!'] : ['3', '2', '1', 'GO!'];

    seq.forEach((v, i) => countTimers.push(setTimeout(() => {
      cntEl.textContent = v;
      cntEl.classList.remove('pop');
      void cntEl.offsetWidth;
      cntEl.classList.add('pop');
      SFX.play(v === 'GO!' ? 'go' : 'count');
      try { navigator.vibrate && navigator.vibrate(10) } catch (_) { }
    }, i * 480)));

    countTimers.push(setTimeout(() => {
      launchEl.hidden = true;
      cb();
    }, seq.length * 480 + 120));
  }

  function launchType(t) {
    buzz();
    if (t.isLocked) {
      toast('This challenge is locked');
      return;
    }

    // 1. Show countdown overlay first
    countdownThen(async () => {
      const cntEl = $('#cnt');
      const loadEl = $('#launchLoad');
      const launchEl = $('#launch');

      // Keep countdown overlay visible and show spinner while waiting for questions
      launchEl.hidden = false;
      cntEl.style.display = 'none';
      loadEl.style.display = 'block';

      // 2. When countdown hits zero, call POST /api/v2/challenges/{id}/start?category_id={categoryId}
      try {
        const catId = selectedCategory ? selectedCategory.id : null;
        const startRes = await startChallengeAttempt(t.id, catId);
        const questions = startRes.questions;

        launchEl.hidden = true;
        cntEl.style.display = '';
        loadEl.style.display = 'none';

        if (!questions || !questions.length) {
          toast('No questions returned for this challenge');
          return;
        }

        // Initialize Drill state
        D.t = t;
        D.attemptId = startRes.attempt.id;
        D.qs = questions;
        D.i = 0;
        D.ok = 0;
        D.res = [];
        D.pick = [];
        D.ms = 0;
        D.run = false;
        RV.closeAll();

        // Apply theme styling to #s-drill
        const s = $('#s-drill');
        const [c1, c2, c3, e, tx] = t.btn;
        s.style.setProperty('--ac', c2);
        s.style.setProperty('--acd', e);
        s.style.setProperty('--acs', t.accs);
        s.style.setProperty('--tx', tx);

        $('#dNameT').textContent = t.name.toUpperCase();
        $('#dIco').innerHTML = TICO[t.themeId] || TICO.speed;
        $('#dPts').textContent = '+' + t.dumoPoints;

        const timeLimit = t.raw?.challengeType?.timeLimitSeconds || 60;
        $('#dLim').textContent = 'LIMIT ' + fmtL(timeLimit);
        $('#dNeed').textContent = `TARGET ${t.stats?.[1]?.[0] || 'PASS'}`;
        $('#dOk').textContent = '0';
        $('#dTot').textContent = `/${questions.length}`;
        $('#dTime').textContent = '0:00.0';
        $('#dTime').classList.remove('warn');
        $('#tbarI').style.transform = 'scaleX(1)';
        $('#tbar').classList.remove('low');
        $('#res').classList.remove('show');

        // Transition screens: #s-types -> #s-drill
        SFX.play('whoosh');
        $('#s-types').classList.remove('play');
        $('#s-types').classList.add('off');
        $('#s-drill').classList.remove('off');
        $('#s-drill').classList.add('play');

        renderQ();
        resumeDrill();
      } catch (err) {
        console.error('Failed to start challenge attempt:', err);
        launchEl.hidden = true;
        cntEl.style.display = '';
        loadEl.style.display = 'none';
        toast(err?.message || 'Failed to start challenge');
      }
    });
  }

  /* ===================== STREAK CELEBRATION (STK) ===================== */
  const STK = (() => {
    const ds = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const td = () => ds(Date.now());
    const sk = $('#sk');
    const CELEBRATION_DATE_KEY = 'last_shown_streak_celebration_date';

    const MS = [3, 7, 14, 30, 50, 100, 365];
    const flameSm = on => `<svg viewBox="0 0 19 25"><path d="M9.5 0.5c1.4 4.6 7.8 7.4 7.8 14.3a7.8 7.8 0 0 1-15.6 0c0-4.2 2.6-6.1 3.5-9.6 1.3 2.1 1.4 3.9 2.6 4.6.7-3.4.6-6.4 1.7-9.3z" fill="${on ? '#fff' : '#ffffff26'}"/>${on ? '<path d="M9.6 11.8c.9 2.8 4.3 3.7 4.3 7.2a4.3 4.3 0 0 1-8.6 0c0-2.2 1.9-3.6 2.1-5.6.8.8 1.2 1.6 1.4 2.4.6-1.3.7-2.6.8-4z" fill="#ffb420"/>' : ''}</svg>`;
    let rollT = 0;

    function open(r, from = 'challenge') {
      if (!sk) return;
      const view = !r;
      const n = view ? (r?.currentStreak ?? 0) : r.currentStreak;
      const prev = view ? n : r.prev;
      sk.classList.toggle('cold', view && n === 0);

      const roll = $('#skRoll');
      clearTimeout(rollT);
      if (roll) {
        roll.style.transition = 'none';
        roll.style.transform = 'none';
        roll.innerHTML = (prev !== n ? [prev, n] : [n]).map(v => `<span>${v}</span>`).join('');
        void roll.offsetWidth;
        roll.style.transition = '';
        if (prev !== n) {
          rollT = setTimeout(() => {
            roll.style.transform = 'translateY(-86px)';
            SFX.play('pop');
          }, reduce ? 0 : 950);
        }
      }

      const skLbl = $('#skLbl');
      if (skLbl) skLbl.innerHTML = n === 1 ? 'DAY <span>STREAK!</span>' : n === 0 ? 'NO STREAK <span>YET</span>' : 'DAY <span>STREAK!</span>';

      const hit = MS.includes(n) && !view;
      const skK = $('#skK');
      if (skK) skK.innerHTML = `<i></i>${view ? 'YOUR STREAK' : hit ? 'MILESTONE UNLOCKED' : r?.reset ? 'NEW STREAK STARTED' : 'STREAK UPDATED'}`;

      const skSub = $('#skSub');
      if (skSub) {
        skSub.innerHTML = view
          ? (n ? `You're on a <b>${n} day</b> streak! Keep it alive tomorrow.` : 'Finish a challenge today to light your first flame.')
          : r?.reset ? `Your old streak ended, but day <b>1</b> starts now. Come back tomorrow to make it <b>2</b>.`
          : n === 1 ? `First challenge done! Come back tomorrow to make it <b>2 days</b> in a row.`
          : `That's <b>${n} days</b> in a row. Come back tomorrow to make it <b>${n + 1}</b>.`;
      }

      // 7-day week tracker using real backend week_activity if available
      const now = new Date(), dow = (now.getDay() + 6) % 7;
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const weekAct = r?.weekActivity || {};

      const skDays = $('#skDays');
      if (skDays) {
        skDays.innerHTML = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => {
          const dayName = dayNames[i];
          const on = Boolean(weekAct[dayName]);
          const isT = i === dow;
          const cls = (on ? ' on' : '') + (isT ? ' today' : '') + (!on && i < dow ? ' miss' : '');
          return `<div class="sk-d${cls}"><span class="b">${flameSm(on)}</span><small>${l}</small></div>`;
        }).join('');
      }

      const skBest = $('#skBest');
      if (skBest) skBest.textContent = `STREAK ${n} DAYS`;

      const nx = MS.find(m => m > n) || n + 1, pv = [0, ...MS].filter(m => m <= n).pop() || 0, left = nx - n;
      const skMd = $('#skMd'); if (skMd) skMd.textContent = nx;
      const skMsT = $('#skMsT'); if (skMsT) skMsT.textContent = hit ? `${n}-day flame unlocked!` : `${left} day${left > 1 ? 's' : ''} to your ${nx}-day flame`;
      const skMsS = $('#skMsS'); if (skMsS) skMsS.textContent = hit ? `Next up: ${nx} days in a row` : `Keep it going ${left > 1 ? 'every day' : 'one more day'}`;

      const bar = $('#skBar');
      if (bar) {
        bar.style.setProperty('--p', Math.round((n - pv) / (nx - pv) * 100) + '%');
        bar.style.setProperty('--p0', Math.round(Math.max(0, prev - pv) / (nx - pv) * 100) + '%');
      }

      const coins = Math.min(50, n * 5);
      const skBonus = $('#skBonus'); if (skBonus) skBonus.hidden = view;
      const skBonusT = $('#skBonusT'); if (skBonusT) skBonusT.textContent = `+${coins} streak coins`;

      const skBackL = $('#skBackL'); if (skBackL) skBackL.textContent = from === 'challenge' ? 'BACK TO CHALLENGE' : 'KEEP GOING';
      const skHome = $('#skHome'); if (skHome) skHome.hidden = from !== 'challenge';

      const skEmb = $('#skEmb');
      if (skEmb) {
        skEmb.innerHTML = reduce ? '' : Array.from({ length: 18 }, () =>
          `<i style="left:${(20 + Math.random() * 60).toFixed(1)}%;--x:${(Math.random() * 120 - 60).toFixed(0)}px;--t:${(3 + Math.random() * 3).toFixed(2)}s;--dl:${(Math.random() * 4).toFixed(2)}s"></i>`
        ).join('');
      }

      sk.classList.remove('play');
      void sk.offsetWidth;
      sk.classList.add('open', 'play');

      if (!view) {
        setTimeout(() => SFX.play('win'), 250);
        setTimeout(() => SFX.play('sparkle'), 1300);
      }
      try { navigator.vibrate && navigator.vibrate(view ? 10 : [15, 60, 15, 60, 30]); } catch (_) { }
    }

    function close(toHome = false) {
      if (!sk || !sk.classList.contains('open')) return;
      sk.classList.remove('open');
      clearTimeout(rollT);
      if (toHome) {
        setTimeout(() => {
          SFX.play('whoosh');
          setTimeout(() => location.href = 'index.html', 260);
        }, 180);
      }
    }

    $('#skX')?.addEventListener('click', () => { buzz(); close(false); });
    $('#skBack')?.addEventListener('click', () => { buzz(); close(false); });
    $('#skHome')?.addEventListener('click', () => { buzz(); close(true); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && sk?.classList.contains('open')) close(false); });

    return {
      async afterChallenge() {
        try {
          // Fetch live streak from backend: GET /api/v1/user/streak
          const details = await fetchUserStreakDetails();
          const todayStr = td();
          let lastCelebrated = null;
          try { lastCelebrated = localStorage.getItem(CELEBRATION_DATE_KEY); } catch (_) { }

          const increased = Boolean(details.streakIncreasedToday);
          const reset = Boolean(details.streakResetToday);

          // Only celebrate once per day when streak increased or reset
          if (lastCelebrated !== todayStr && (increased || reset || details.currentStreak > 0)) {
            try { localStorage.setItem(CELEBRATION_DATE_KEY, todayStr); } catch (_) { }
            const prev = Math.max(0, details.currentStreak - (increased ? 1 : 0));
            open({
              currentStreak: details.currentStreak,
              prev,
              reset,
              weekActivity: details.weekActivity,
            }, 'challenge');
          }
        } catch (err) {
          console.error('Failed to check user streak:', err);
        }
      },
      open: () => open(null, 'home'),
      close,
    };
  })();

  /* ===================== NAV + GO ===================== */
  // Back — real navigation to the home page, mirroring the prototype's
  // nav('home'): the whoosh must finish BEFORE location.href destroys
  // the AudioContext (~240ms sound, so wait 260ms).
  $('#lbBack').addEventListener('click', () => { buzz(); setTimeout(() => { SFX.play('whoosh'); setTimeout(() => location.href = 'index.html', 260) }, 180) });
  $('#lbInfo').addEventListener('click', () => { buzz(); toast('Beat challenges to score. Top 3 and ranks 4–10 win the prizes you pick!') });

  /* GO — open challenge types screen */
  $('#toDrill').addEventListener('click', () => {
    buzz();
    replay($('#lbar'), 'nudge');
    if (!selectedSubject) {
      toast('Please select a subject first');
      openPicker('subj');
      return;
    }
    if (!selectedCategory) {
      toast('Please select a chapter first');
      openPicker('ch');
      return;
    }
    openTypes();
  });

  /* ---------- first paint & initial data load ---------- */
  async function initInitialData() {
    try {
      isLoadingAgeRanges = true;
      const [ranges, prof] = await Promise.all([
        fetchAgeRanges().catch(() => []),
        fetchProfile().catch(() => null),
      ]);
      ageRangesList = ranges || [];
      if (prof) {
        if (prof.ageRangeId != null) {
          selectedAgeRangeId = prof.ageRangeId;
        }
        const name = prof.fullname || prof.username || '';
        if (name) {
          useAppStore.getState().setMeName(name);
        }
      }
      if (ageRangesList.length > 0 && selectedAgeRangeId == null) {
        selectedAgeRangeId = ageRangesList[0].id;
      }
      renderFields();
      renderRail();
    } catch (e) {
      console.error('Error initializing age ranges / profile:', e);
    } finally {
      isLoadingAgeRanges = false;
    }

    try {
      subjectsList = await fetchSubjects();
      if (subjectsList.length > 0 && !selectedSubject) {
        selectedSubject = subjectsList[0];
        renderFields();
      }
    } catch (e) {
      console.error('Error fetching initial subjects:', e);
    }
  }

  renderFields();
  renderLobby(true);
  void initInitialData();

  /* Deep-link: support navigating directly to Past Winners (e.g. challenge.html#past or challenge.html#past-quiz) */
  const hash = location.hash.replace(/^#/, '');
  if (hash === 'past' || hash === 'past-quiz' || hash === 'past-lb') {
    const tab = hash === 'past-quiz' ? 'quiz' : 'lb';
    PWIN.showPast(tab);
  }
}
