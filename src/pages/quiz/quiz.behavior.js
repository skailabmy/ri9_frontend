import { useAppStore } from '../../store/app';
import {
  selectQuizPrize,
  fetchQuizSessionSubjects,
  startQuizSessionAttempt,
  submitQuizAttemptAnswer,
  completeQuizAttempt,
  fetchQuizSessionAttempts,
} from '../../api/leaderboard';
import { CLOUDFRONT_APP_URL } from '../../api/config';
import { fetchAgeRanges, fetchProfile, updateAgeRange } from '../../api/profile';
import { formatMathAndText } from '../../utils/mathText';

export function mount() {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const replay = (el, c) => { if (!el) return; el.classList.remove(c); void el.offsetWidth; el.classList.add(c) };

  /* ---------- sound FX (Web Audio synthesizer) ---------- */
  const SFX = (() => {
    let ctx = null, on = true;
    try { const s = localStorage.getItem('sfx'); if (s !== null) on = s === '1'; } catch (_) { }
    const getCtx = () => { if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) ctx = new C(); } if (ctx && ctx.state === 'suspended') ctx.resume(); return ctx; };
    const tone = (f, opt = {}) => {
      if (!on) return; const c = getCtx(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain(), now = c.currentTime + (opt.t || 0);
      o.type = opt.type || 'sine'; o.frequency.setValueAtTime(f, now);
      if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.to), now + (opt.d || .1));
      g.gain.setValueAtTime(opt.v || .18, now); g.gain.exponentialRampToValueAtTime(.0001, now + (opt.d || .1));
      o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + (opt.d || .1));
    };
    const nz = (opt = {}) => {
      if (!on) return; const c = getCtx(); if (!c) return;
      const b = c.createBuffer(1, c.sampleRate * (opt.d || .2), c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(); s.buffer = b;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(opt.f || 1e3, c.currentTime);
      if (opt.to) f.frequency.exponentialRampToValueAtTime(opt.to, c.currentTime + (opt.d || .2));
      f.Q.value = opt.q || 1; const g = c.createGain(); g.gain.setValueAtTime(opt.v || .1, c.currentTime);
      g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + (opt.d || .2));
      s.connect(f); f.connect(g); g.connect(c.destination); s.start();
    };
    const P = {
      tap() { tone(1650, { d: .035, type: 'triangle', v: .1, to: 1100 }); },
      whoosh() { nz({ d: .24, v: .09, f: 500, to: 3200, q: .7 }); },
      pop() { tone(380, { d: .1, v: .28, to: 880 }); },
      coin() { tone(950, { d: .07, v: .2, to: 1500 }); tone(1900, { d: .2, v: .14, to: 2500, t: .05 }); },
      sparkle() { [880, 1320, 1760, 2640].forEach((f, i) => tone(f, { d: .14, v: .11, to: f * 1.25, t: i * .06, type: 'triangle' })); },
      count() { tone(800, { d: .06, type: 'triangle', v: .2 }); },
      go() { tone(1200, { d: .2, type: 'triangle', v: .3, to: 1600 }); },
      ok() { tone(880, { d: .1, type: 'triangle', v: .25, to: 1320 }); },
      no() { tone(240, { d: .16, type: 'sawtooth', v: .2, to: 140 }); },
      win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, { d: .16, v: .15, t: i * .08, type: 'triangle' })); },
      lose() { [400, 350, 300, 240].forEach((f, i) => tone(f, { d: .2, v: .15, t: i * .08, type: 'sawtooth' })); }
    };
    return { play(k, ...a) { try { P[k] && P[k](...a); } catch (_) { } }, get on() { return on; }, set(v) { on = !!v; try { localStorage.setItem('sfx', on ? '1' : '0'); } catch (_) { } } };
  })();
  window.SFX = SFX;
  const buzz = () => { SFX.play('tap'); try { navigator.vibrate && navigator.vibrate(10); } catch (_) { } };

  /* ---------- stage fit (390×820 scaled to viewport) ---------- */
  function fit() {
    const vp = $('#vp'); if (!vp) return;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    let s = Math.min(vw / 390, vh / 812, 1.5); const W = Math.min(vw / s, 520), H = vh / s;
    document.documentElement.style.setProperty('--s', s.toFixed(4));
    document.documentElement.style.setProperty('--W', W.toFixed(1));
    document.documentElement.style.setProperty('--H', H.toFixed(1));
    document.documentElement.style.setProperty('--ox', ((vw - W * s) / 2).toFixed(1) + 'px');
  }
  fit(); addEventListener('resize', fit); window.visualViewport && visualViewport.addEventListener('resize', fit);

  /* ---------- speed streaks on the arena backdrop ---------- */
  document.querySelectorAll('.emb').forEach(cv => {
    const x = cv.getContext('2d'); let W = 0, H = 0, P = [], last = 0;
    function size() { const d = Math.min(2, devicePixelRatio || 1); W = cv.offsetWidth; H = cv.offsetHeight; cv.width = W * d; cv.height = H * d; x.setTransform(d, 0, 0, d, 0, 0); }
    function spawn(init) {
      const lime = Math.random() < .28, len = 40 + Math.random() * 150;
      return { x: init ? Math.random() * (W + len) : W + len * Math.random(), y: Math.random() * H, len, v: 5 + Math.random() * 9 + (len / 40), w: lime ? 1.6 + Math.random() : 0.8 + Math.random() * 1.2, lime, a: lime ? .45 + Math.random() * .3 : .09 + Math.random() * .09 };
    }
    function draw(dt) {
      x.clearRect(0, 0, W, H); x.lineCap = 'round';
      P.forEach(p => {
        p.x -= p.v * dt; const g = x.createLinearGradient(p.x, 0, p.x + p.len, 0); const c = p.lime ? '154,206,24' : '27,28,25';
        g.addColorStop(0, `rgba(${c},${p.a})`); g.addColorStop(1, `rgba(${c},0)`); x.strokeStyle = g; x.lineWidth = p.w; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x + p.len, p.y); x.stroke();
      });
      P = P.filter(p => p.x + p.len > -10); while (P.length < 42) P.push(spawn(false));
    }
    function f(t) {
      const dt = last ? Math.min(3, (t - last) / 16.7) : 1; last = t;
      if (!W || W !== cv.offsetWidth) { size(); P = Array.from({ length: 42 }, () => spawn(true)); }
      if (reduce) { if (!cv._drawn) { draw(0); cv._drawn = 1; } } else draw(dt);
      requestAnimationFrame(f);
    }
    addEventListener('resize', () => { W = 0; }); requestAnimationFrame(f);
  });

  /* ---------- toast ---------- */
  let tt; function toast(m) { const t = $('#toast'); if (!t) return; t.textContent = m; t.classList.add('open'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('open'), 1700); }
  let lastToastSeq = useAppStore.getState().toastSeq;
  useAppStore.subscribe(s => { if (s.toastSeq !== lastToastSeq) { lastToastSeq = s.toastSeq; toast(s.toastMsg || ''); } });

  /* ---------- Prize Art SVG icons (PA) ---------- */
  const CLOUD_IMG_BASE = `${CLOUDFRONT_APP_URL}/products`;

  // Neutral SVG prize gift/box placeholder for failed or unavailable images
  const BLANK_PRIZE_PLACEHOLDER = `<svg viewBox="0 0 64 64" class="pz-img" style="display:block"><rect width="64" height="64" rx="8" fill="#e2e8f0"/><path d="M20 28h24v20H20z" fill="#cbd5e1"/><path d="M18 24h28v6H18z" fill="#94a3b8"/><path d="M30 24v24h4V24z" fill="#f8fafc"/><circle cx="28" cy="20" r="4" fill="none" stroke="#94a3b8" stroke-width="2.5"/><circle cx="36" cy="20" r="4" fill="none" stroke="#94a3b8" stroke-width="2.5"/></svg>`;

  window._onPrizeImgErrQuiz = function(img) {
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
      imgUrl = `${CLOUD_IMG_BASE}/${key}`;
    } else if (PA[key]) {
      imgUrl = `${CLOUD_IMG_BASE}/${key}.png`;
    } else {
      imgUrl = `${CLOUD_IMG_BASE}/${key}`;
    }
    return `<img src="${imgUrl}" alt="" class="pz-img" loading="lazy" onerror="window._onPrizeImgErrQuiz(this)"/>`;
  }

  const PA = {
    console: '<svg viewBox="0 0 64 64"><rect x="6" y="14" width="52" height="36" rx="10" fill="#2d2f2a"/><rect x="14" y="20" width="36" height="24" rx="4" fill="#7fd1ff"/><circle cx="10" cy="28" r="2.5" fill="#c6f432"/><path d="M10 35v6M7 38h6" stroke="#c6f432" stroke-width="2" stroke-linecap="round"/><circle cx="53" cy="30" r="2" fill="#ff5a4e"/><circle cx="55" cy="35" r="2" fill="#ffd25e"/><circle cx="51" cy="35" r="2" fill="#7fd1ff"/><circle cx="53" cy="40" r="2" fill="#c6f432"/></svg>',
    tablet: '<svg viewBox="0 0 64 64"><rect x="10" y="6" width="44" height="52" rx="6" fill="#2d2f2a"/><rect x="14" y="10" width="36" height="42" rx="3" fill="#ffd25e"/><circle cx="32" cy="55" r="1.8" fill="#fff"/><path d="M48 12l6-6" stroke="#c6f432" stroke-width="3" stroke-linecap="round"/></svg>',
    watch: '<svg viewBox="0 0 64 64"><rect x="22" y="4" width="20" height="56" rx="5" fill="#8f7cff"/><rect x="14" y="14" width="36" height="36" rx="10" fill="#2d2f2a"/><rect x="18" y="18" width="28" height="28" rx="7" fill="#c6f432"/><text x="32" y="36" font-family="Anton,Impact,sans-serif" font-size="14" text-anchor="middle" fill="#1b1c19">09:41</text></svg>',
    scooter: '<svg viewBox="0 0 64 64"><path d="M14 50h36M18 50l12-32h-8" fill="none" stroke="#2d2f2a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="50" r="6" fill="#ff5a4e"/><circle cx="50" cy="50" r="6" fill="#ff5a4e"/><circle cx="14" cy="50" r="2.5" fill="#fff"/><circle cx="50" cy="50" r="2.5" fill="#fff"/><rect x="20" y="14" width="16" height="4" rx="2" fill="#c6f432"/></svg>',
    camera: '<svg viewBox="0 0 64 64"><rect x="6" y="16" width="52" height="38" rx="9" fill="#ff8fb1"/><rect x="6" y="16" width="52" height="10" rx="5" fill="#ffc2d4"/><circle cx="32" cy="38" r="12" fill="#2d2f2a"/><circle cx="32" cy="38" r="7" fill="#7fd1ff"/><circle cx="29" cy="35" r="2.2" fill="#fff"/><rect x="44" y="20" width="8" height="4" rx="2" fill="#fff"/><rect x="14" y="10" width="12" height="8" rx="2" fill="#2d2f2a"/></svg>',
    headset: '<svg viewBox="0 0 64 64"><path d="M10 38V30a22 22 0 0 1 44 0v8" fill="none" stroke="#2d2f2a" stroke-width="6" stroke-linecap="round"/><rect x="4" y="32" width="16" height="24" rx="7" fill="#2d2f2a"/><rect x="44" y="32" width="16" height="24" rx="7" fill="#2d2f2a"/><rect x="8" y="37" width="8" height="14" rx="4" fill="#c6f432"/><rect x="48" y="37" width="8" height="14" rx="4" fill="#c6f432"/><path d="M12 56c0 4 6 5 12 5" fill="none" stroke="#2d2f2a" stroke-width="3" stroke-linecap="round"/></svg>',
    earbuds: '<svg viewBox="0 0 64 64"><rect x="10" y="18" width="44" height="32" rx="12" fill="#ffffff" stroke="#2d2f2a" stroke-width="3"/><ellipse cx="24" cy="30" rx="4" ry="7" fill="#2d2f2a"/><ellipse cx="40" cy="30" rx="4" ry="7" fill="#2d2f2a"/><circle cx="32" cy="42" r="2" fill="#c6f432"/></svg>',
    speaker: '<svg viewBox="0 0 64 64"><rect x="16" y="10" width="32" height="44" rx="16" fill="#2d2f2a"/><circle cx="32" cy="24" r="7" fill="#7fd1ff"/><circle cx="32" cy="40" r="10" fill="#c6f432"/><circle cx="32" cy="40" r="5" fill="#2d2f2a"/></svg>',
    pad: '<svg viewBox="0 0 64 64"><rect x="8" y="18" width="48" height="32" rx="14" fill="#2d2f2a"/><circle cx="20" cy="32" r="6" fill="#c6f432"/><circle cx="44" cy="32" r="6" fill="#c6f432"/><circle cx="20" cy="32" r="2.5" fill="#2d2f2a"/><circle cx="44" cy="32" r="2.5" fill="#2d2f2a"/><path d="M32 26v12" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    blocks: '<svg viewBox="0 0 64 64"><rect x="8" y="24" width="48" height="28" rx="4" fill="#ff5a4e"/><circle cx="18" cy="18" r="4" fill="#ff5a4e"/><circle cx="32" cy="18" r="4" fill="#ff5a4e"/><circle cx="46" cy="18" r="4" fill="#ff5a4e"/></svg>',
    art: '<svg viewBox="0 0 64 64"><path d="M32 6C16 6 4 17 4 30c0 10 8 14 14 12 5-2 8 2 6 7-2 6 3 9 8 9 16 0 28-12 28-27S48 6 32 6z" fill="#ffe2b0"/><circle cx="18" cy="26" r="5" fill="#ff5a4e"/><circle cx="30" cy="16" r="5" fill="#ffd25e"/><circle cx="44" cy="20" r="5" fill="#7fd1ff"/><circle cx="48" cy="34" r="5" fill="#8f7cff"/><circle cx="40" cy="46" r="5" fill="#c6f432"/></svg>',
    credit: '<svg viewBox="0 0 64 64"><rect x="4" y="14" width="56" height="36" rx="7" fill="#7fd1ff"/><rect x="4" y="22" width="56" height="7" fill="#1b1c19"/><text x="32" y="44" font-family="Anton,Impact,sans-serif" font-size="14" text-anchor="middle" fill="#1b1c19">RM30</text></svg>',
    books: '<svg viewBox="0 0 64 64"><path d="M10 48c6-3 14-3 22 0 8-3 16-3 22 0V16c-6-3-14-3-22 0-8-3-16-3-22 0z" fill="#fff" stroke="#2d2f2a" stroke-width="3"/><path d="M32 16v32" stroke="#2d2f2a" stroke-width="3"/><rect x="6" y="18" width="52" height="32" rx="3" fill="none" stroke="#c6f432" stroke-width="2"/></svg>',
    plush: '<svg viewBox="0 0 64 64"><circle cx="16" cy="16" r="9" fill="#e6a86a"/><circle cx="48" cy="16" r="9" fill="#e6a86a"/><circle cx="32" cy="34" r="22" fill="#e6a86a"/><circle cx="24" cy="30" r="3" fill="#1b1c19"/><circle cx="40" cy="30" r="3" fill="#1b1c19"/></svg>'
  };

  /* Prizes list per rank — loaded dynamically from the ongoing quiz session */
  const PRIZES = { 1: [], 2: [], 3: [] };
  const PLACE = { 1: '1ST', 2: '2ND', 3: '3RD' };
  const MEDAL_PD = { 1: ['#fff3a8', '#f2c94c', '#5c3d00'], 2: ['#ffffff', '#c3c9bc', '#3c4236'], 3: ['#ffd9b5', '#e4a06a', '#5a2f0f'] };

  /* User picks (saved in localStorage or synced with backend) */
  let picks = { 1: null, 2: null, 3: null };

  let currentOngoingSession = useAppStore.getState().ongoingQuizSession || null;

  function syncOngoingPrizes(session) {
    if (!session) return;
    currentOngoingSession = session;
    const bgColors = ['#e8f4ff', '#fff6d6', '#efeaff', '#ffe9e6', '#ffe9f0', '#f1fad6', '#f3f5f0', '#fff0e3'];

    // Reset picks and prizes
    picks = { 1: null, 2: null, 3: null };

    // Populate selectable prizes per position from backend
    if (session.selectablePrizes) {
      for (const pos of [1, 2, 3]) {
        const list = session.selectablePrizes[String(pos)];
        if (Array.isArray(list) && list.length > 0) {
          PRIZES[pos] = list.map((p, idx) => [
            p.productImage || '',
            p.prizeName,
            p.productDescription || '',
            bgColors[idx % bgColors.length],
            p.prizeId,
          ]);
        } else {
          PRIZES[pos] = [];
        }
      }
    } else {
      PRIZES[1] = [];
      PRIZES[2] = [];
      PRIZES[3] = [];
    }

    // Match existing user selections
    if (session.myPrizeSelections) {
      for (const pos of [1, 2, 3]) {
        const sel = session.myPrizeSelections[String(pos)];
        if (sel && sel.prizeId != null && PRIZES[pos] && PRIZES[pos].length > 0) {
          const foundIdx = PRIZES[pos].findIndex(it => it[4] === sel.prizeId);
          if (foundIdx !== -1) {
            picks[pos] = foundIdx;
          }
        }
      }
    }

    qtick();
  }

  if (currentOngoingSession) syncOngoingPrizes(currentOngoingSession);

  useAppStore.subscribe(s => {
    if (s.ongoingQuizSession !== currentOngoingSession) {
      syncOngoingPrizes(s.ongoingQuizSession);
      renderPicks();
      qtick();
    }
  });

  const savePicks = async (pos, item) => {
    if (!currentOngoingSession || !item || !item[4]) return;
    try {
      await selectQuizPrize(currentOngoingSession.id, pos, item[4]);
    } catch (err) {
      console.error('Failed to save quiz prize selection:', err);
    }
  };

  /* Render 3 podium prize slots in the banner */
  function renderPicks(got) {
    const qpz = $('#qpz'); if (!qpz) return;
    const MV = { 1: '--m1:#fff6d6;--m2:#ffc83d;--m3:#d99a0b;--mt:#5a3a00', 2: '--m1:#ffffff;--m2:#d3d8cc;--m3:#8d9585;--mt:#3c4236', 3: '--m1:#ffe2c4;--m2:#eaa874;--m3:#b9733a;--mt:#5a2f0f' };
    qpz.innerHTML = [2, 1, 3].map(p => {
      const k = picks[p], it = k != null ? PRIZES[p][k] : null;
      return `<button class="qp r${p}${got === p ? ' got' : ''}" data-p="${p}" style="${MV[p]}" aria-label="${PLACE[p]} place prize${it ? ': ' + it[1] : ', choose one'}">
        <span class="rays"></span><span class="ch">${PLACE[p]}</span>
        <span class="art${it ? '' : ' plus'}">${it ? renderPrizeArt(it[0]) : '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'}</span>
        <span class="nm">${it ? it[1] : 'Pick prize'}</span>
      </button>`;
    }).join('');
  }

  /* Drop countdown odometer */
  const qcols = [];
  (function () {
    const el = $('#qtiles'); if (!el) return;
    el.innerHTML = '';
    ['HRS', 'MIN', 'SEC'].forEach((lab, u) => {
      if (u) { const sp = document.createElement('span'); sp.className = 'sep'; sp.textContent = ':'; el.appendChild(sp); }
      const w = document.createElement('span'); w.className = 'u';
      const t = document.createElement('span'); t.className = 'tile';
      for (let k = 0; k < 2; k++) {
        const d = document.createElement('span'); d.className = 'dg';
        const c = document.createElement('span'); c.className = 'col';
        for (let i = 0; i < 10; i++) { const n = document.createElement('span'); n.textContent = String(i); c.appendChild(n); }
        const dash = document.createElement('span'); dash.textContent = '—'; c.appendChild(dash);
        d.appendChild(c); t.appendChild(d); qcols.push(c);
      }
      const sm = document.createElement('small'); sm.textContent = lab; w.append(t, sm); el.appendChild(w);
    });
  })();

  function parseEndDate(dateStr) {
    if (!dateStr) return null;
    const iso = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  function qtick() {
    if (!qcols.length) return;
    if (!currentOngoingSession || !currentOngoingSession.endDate) {
      // No active ongoing session loaded yet -> show dashes (10th index)
      qcols.forEach(col => { col.style.transform = `translateY(${-10 * 30}px)`; });
      return;
    }
    const end = parseEndDate(currentOngoingSession.endDate);
    if (!end) {
      qcols.forEach(col => { col.style.transform = `translateY(${-10 * 30}px)`; });
      return;
    }
    const n = new Date();
    const diff = Math.max(0, Math.floor((end.getTime() - n.getTime()) / 1000));
    const h = Math.min(99, Math.floor(diff / 3600));
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    const str = [h, m, s].map(v => String(v).padStart(2, '0')).join('');
    str.split('').forEach((v, i) => { if (qcols[i]) qcols[i].style.transform = `translateY(${-Number(v) * 30}px)`; });
  }
  qtick(); setInterval(qtick, 1000);

  /* ===================== 9 ROUNDS STATE & RENDER ===================== */
  let QR = { max: 9, rounds: [] };
  let inProgressAttempt = null; // QuizSessionAttempt with status === 'in_progress'

  function syncRoundsFromAttempts(attempts) {
    if (!Array.isArray(attempts)) {
      QR = { max: 9, rounds: [] };
      inProgressAttempt = null;
      return;
    }

    // Check if there is an in-progress attempt
    inProgressAttempt = attempts.find(a => a.status === 'in_progress') || null;

    // Filter attempts that have actually been completed / scored
    // and sort by attempt_number ascending
    const played = attempts
      .filter(a => a.status === 'completed' || (a.score != null && a.status !== 'in_progress' && a.status !== 'available'))
      .sort((a, b) => a.attemptNumber - b.attemptNumber);

    QR = {
      max: attempts.length > 0 ? attempts.length : 9,
      rounds: played.map(a => ({
        c: a.score ?? 0,
        t: a.speedSeconds ?? 0,
        isBest: Boolean(a.isBest),
        subj: a.subjectName || null,
        ch: a.categoryName || null,
      })),
    };

    // If an attempt is currently in_progress, lock subject & category to that attempt
    if (inProgressAttempt) {
      syncInProgressSubjectCategory(inProgressAttempt);
    }
  }

  function syncInProgressSubjectCategory(att) {
    if (!att) return;
    if (att.subjectId != null) {
      if (allQuizSubjects.length > 0) {
        const foundSubj = allQuizSubjects.find(s => s.id === att.subjectId);
        if (foundSubj) {
          selectedSubject = foundSubj;
          if (att.categoryId != null && Array.isArray(foundSubj.categories)) {
            const foundCat = foundSubj.categories.find(c => c.id === att.categoryId);
            if (foundCat) selectedCategory = foundCat;
          }
        }
      } else {
        // Fallback placeholder object until allQuizSubjects loads
        selectedSubject = {
          id: att.subjectId,
          name: att.subjectName || 'Subject',
          description: '',
          imageUrl: null,
          iconUrl: null,
          priority: 0,
          isActive: true,
          isLocked: false,
          ageRangeIds: [],
          completionPercentage: 0,
          categories: att.categoryId != null ? [{
            id: att.categoryId,
            name: att.categoryName || 'Chapter',
            description: '',
            isEligible: true,
            isCompleted: false,
            completionPercentage: 0,
            totalQuestionsCompleted: 0,
            totalQuestions: 0,
          }] : [],
          ageRanges: [],
        };
        if (att.categoryId != null) {
          selectedCategory = selectedSubject.categories[0];
        }
      }
    }
    renderFields();
  }

  // Subscribe to quizSessionAttempts from store
  useAppStore.subscribe((s, prev) => {
    if (s.quizSessionAttempts !== prev.quizSessionAttempts) {
      syncRoundsFromAttempts(s.quizSessionAttempts);
      renderQuiz(true);
    }
  });

  const mmss = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  function bestIdx() {
    let b = -1;
    // If backend marked isBest, prioritize that
    const markedBest = QR.rounds.findIndex(r => r.isBest);
    if (markedBest >= 0) return markedBest;
    QR.rounds.forEach((r, i) => {
      if (b < 0 || r.c > QR.rounds[b].c || (r.c === QR.rounds[b].c && r.t < QR.rounds[b].t)) b = i;
    });
    return b;
  }

  function renderQuiz(anim) {
    const bi = bestIdx(), n = QR.rounds.length, best = bi >= 0 ? QR.rounds[bi] : null;
    const qLeft = $('#qLeft'); if (qLeft) qLeft.textContent = `${QR.max - n} OF ${QR.max} LEFT`;
    const qBestC = $('#qBestC'), qBestT = $('#qBestT'), qBestR = $('#qBestR');
    if (best) {
      if (qBestC) qBestC.textContent = String(best.c);
      if (qBestT) qBestT.textContent = mmss(best.t);
      if (qBestR) qBestR.textContent = `Round ${bi + 1}`;
    } else {
      if (qBestC) qBestC.textContent = '0';
      if (qBestT) qBestT.textContent = '0:00';
      if (qBestR) qBestR.textContent = 'None yet';
    }
    const mx = Math.max(13, ...QR.rounds.map(r => r.c + 1)), f = c => Math.max(.06, c / mx);
    const qslots = $('#qslots');
    if (qslots) {
      qslots.innerHTML = Array.from({ length: QR.max }, (_, i) => {
        const d = `--d:${(.15 + i * .06).toFixed(2)}s`;
        if (i < n) {
          const r = QR.rounds[i];
          return `<button class="sb3${i === bi ? ' best' : ''}" data-i="${i}" style="--h:${f(r.c)};${d}" aria-label="Round ${i + 1}: ${r.c} correct">
            <span class="bv3">${r.c}</span><span class="bar"></span><small>R${i + 1}</small><em>${mmss(r.t)}</em>
          </button>`;
        }
        if (i === n) {
          return `<button class="sb3 next" data-i="${i}" style="--h:${best ? f(best.c + 1) : .3};${d}" aria-label="Play round ${i + 1}">
            <span class="bv3">?</span><span class="bar"></span><small>R${i + 1}</small><em>NEXT</em>
          </button>`;
        }
        return `<span class="sb3 left" style="--h:0;${d}"><span class="bv3"></span><span class="bar"></span><small>R${i + 1}</small><em></em></span>`;
      }).join('') + (best ? `<i class="bln" style="--h:${f(best.c)}"><span>BEST ${best.c}</span></i>` : '');

      qslots.style.setProperty('--H', Math.max(40, qslots.clientHeight - 24 - 58) + 'px');
      const bb = qslots.querySelector('.sb3.best .bar'), ln = qslots.querySelector('.bln');
      if (bb && ln) {
        ln.style.setProperty('--y', ((bb.getBoundingClientRect().top - qslots.getBoundingClientRect().top) / ((qslots.getBoundingClientRect().height / qslots.offsetHeight) || 1)) + 'px');
      }
    }
    const qTip = $('#qTip');
    if (qTip) {
      qTip.innerHTML = n < QR.max
        ? (best ? `One wrong answer ends a round. Get <b>${best.c + 1}+</b> to beat your best.` : 'One wrong answer ends a round. Go!')
        : 'All 9 rounds done. Wait for the prize drop!';
    }
    const qGoR = $('#qGoR'); if (qGoR) qGoR.textContent = n < QR.max ? `ROUND ${n + 1}` : 'DONE';
    if (anim) replay($('#qrounds'), 'anim');
  }

  $('#qslots')?.addEventListener('click', e => {
    const b = e.target.closest('.sb3:not(.left)'); if (!b) return;
    const i = Number(b.dataset.i); buzz();
    if (b.classList.contains('next')) { qPlay(); return; }
    const r = QR.rounds[i];
    toast(`Round ${i + 1}: ${r.c} correct in ${mmss(r.t)}${i === bestIdx() ? ' · your best' : ''}`);
  });

  /* ===================== SUBJECTS, CHAPTERS & ACADEMIC YEAR ===================== */
  let ageRangesList = [];
  let selectedAgeRangeId = null;
  let isUpdatingAgeRange = false;

  let allQuizSubjects = []; // QuizSubjectItem[] from GET /api/v1/quiz-sessions/{id}/subjects
  let selectedSubject = null; // QuizSubjectItem
  let selectedCategory = null; // QuizCategoryItem

  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function getSelectedAgeRange() {
    if (!ageRangesList.length) return null;
    return ageRangesList.find(r => r.id === selectedAgeRangeId) || ageRangesList[0];
  }

  function getFilteredSubjects() {
    if (!allQuizSubjects.length) return [];
    if (selectedAgeRangeId == null) return allQuizSubjects;
    // Filter subjects that belong to the selected age range (or have no age restrictions)
    const filtered = allQuizSubjects.filter(s =>
      !s.ageRangeIds || !s.ageRangeIds.length || s.ageRangeIds.includes(selectedAgeRangeId)
    );
    return filtered.length > 0 ? filtered : allQuizSubjects;
  }

  /* Academic Year Rail & Dropdown */
  function renderRail() {
    const r = getSelectedAgeRange();
    const ycur = $('#ycur'), ycurS = $('#ycurS'), ydd = $('#ydd');
    if (ycur) ycur.textContent = r ? (r.label || 'Select Year') : 'Select Year';
    if (ycurS) ycurS.textContent = 'ACADEMIC YEAR';
    closeYdd();

    if (!ydd) return;
    if (!ageRangesList.length) {
      ydd.innerHTML = '<div style="padding:14px;color:#8a9478;text-align:center;font-size:12px">Loading grades...</div>';
      return;
    }

    const seen = new Set();
    const items = ageRangesList.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    ydd.innerHTML = items.map(o => {
      const isSelected = o.id === selectedAgeRangeId;
      return `<button class="yo${isSelected ? ' on' : ''}" data-y="${o.id}">
        <span>${esc(o.label || `Grade ${o.id}`)}</span>
        <i><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i>
      </button>`;
    }).join('');
  }

  function openYdd() {
    buzz();
    $('#pk')?.classList.add('ydd-open');
    const c = $('#ydd .yo.on');
    if (c) $('#ydd').scrollTop = c.offsetTop - 80;
  }

  function closeYdd() {
    $('#pk')?.classList.remove('ydd-open');
  }

  $('#ychg')?.addEventListener('click', () => {
    $('#pk')?.classList.contains('ydd-open') ? closeYdd() : openYdd();
  });

  $('#ydd')?.addEventListener('click', async e => {
    const c = e.target.closest('.yo');
    if (!c || isUpdatingAgeRange) return;
    const newId = Number(c.dataset.y);
    buzz();

    document.querySelectorAll('#ydd .yo').forEach(x => x.classList.toggle('on', x === c));
    const changed = newId !== selectedAgeRangeId;

    if (changed) {
      selectedAgeRangeId = newId;
      isUpdatingAgeRange = true;
      try {
        await updateAgeRange(newId);
        // Refresh subjects from backend if session exists to reflect new age range eligibility
        if (currentOngoingSession?.id) {
          try {
            allQuizSubjects = await fetchQuizSessionSubjects(currentOngoingSession.id);
          } catch (_) { }
        }
        // Reselect appropriate subject for new academic year
        const available = getFilteredSubjects();
        selectedSubject = available.length > 0 ? available[0] : null;
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
      const ycur = $('#ycur'); if (ycur) ycur.textContent = cur ? (cur.label || 'Select Year') : 'Select Year';
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
    if (!pk) return;
    pk.classList.add('swap');
    setTimeout(() => {
      openPicker(mode);
      pk.classList.remove('swap');
      replay($('#pkO'), 'reIn');
    }, 160);
  }

  function renderFields() {
    const r = getSelectedAgeRange();
    const yrLabel = r ? (r.label || 'YEAR').toUpperCase() : 'YEAR';
    const subjects = getFilteredSubjects();
    const s = selectedSubject || (subjects.length > 0 ? subjects[0] : null);

    const qSubjL = $('#qSubjL'); if (qSubjL) qSubjL.textContent = `${yrLabel} · SUBJECT`;
    const qSubjV = $('#qSubjV'); if (qSubjV) qSubjV.textContent = s ? s.name : 'Select Subject';
    const qSubjI = $('#qSubjI');
    if (qSubjI) {
      if (s?.iconUrl) {
        qSubjI.innerHTML = `<img src="${esc(s.iconUrl)}" alt="" style="width:24px;height:24px;object-fit:contain">`;
      } else {
        qSubjI.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
      }
    }

    const categories = s?.categories || [];
    const cat = selectedCategory || (categories.length > 0 ? categories[0] : null);
    const catIdx = cat ? (categories.findIndex(c => c.id === cat.id) + 1) : 1;

    const qChN = $('#qChN'); if (qChN) qChN.textContent = String(catIdx);
    const qChL = $('#qChL');
    if (qChL) {
      qChL.textContent = categories.length > 0
        ? `CHAPTER ${catIdx} OF ${categories.length}`
        : 'CHAPTER';
    }
    const qChV = $('#qChV');
    if (qChV) {
      qChV.textContent = cat ? cat.name : (categories.length > 0 ? categories[0].name : 'Select Chapter');
    }
  }

  /* Picker popup */
  let pkMode = 'subj';
  const ck = '<span class="ck"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
  const lk = '<span class="lock-ic" style="margin-left:auto;display:flex;align-items:center;color:#a3ab95"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>';

  async function openPicker(mode) {
    if (inProgressAttempt) {
      toast('Cannot change subject while round is in progress');
      return;
    }
    pkMode = mode; buzz();
    closePicker();
    renderRail();
    const pk = $('#pk'), pkBd = $('#pkBd'), pkS = $('#pkS'), pkT = $('#pkT'), pkO = $('#pkO');
    if (!pk || !pkBd || !pkS || !pkT || !pkO) return;

    pk.classList.add('open'); pkBd.classList.add('open');

    if (mode === 'subj') {
      pkS.textContent = 'STEP 1 · SUBJECT';
      pkT.textContent = 'PICK A SUBJECT';

      const subjects = getFilteredSubjects();
      if (!subjects.length) {
        pkO.innerHTML = '<div style="text-align:center;padding:24px;color:#8a9478;font-weight:600">No subjects available for this year</div>';
        return;
      }

      pkO.innerHTML = subjects.map((s, k) => {
        const isSelected = selectedSubject && selectedSubject.id === s.id;
        const icon = s.iconUrl
          ? `<img src="${esc(s.iconUrl)}" alt="" style="width:20px;height:20px;object-fit:contain">`
          : `<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
        const chCount = s.categories?.length || 0;
        return `<button class="opt${isSelected ? ' on' : ''}${s.isLocked ? ' locked' : ''}" data-type="subj" data-id="${s.id}" data-locked="${s.isLocked ? '1' : '0'}">
          <span class="oi">${icon}</span>
          <span>${esc(s.name)}<small class="osub">${chCount ? `${chCount} chapters` : 'Available'}</small></span>
          ${s.isLocked ? lk : ck}
        </button>`;
      }).join('');
    } else {
      if (!selectedSubject) {
        setTimeout(() => openPicker('subj'), 200);
        return;
      }

      pkT.textContent = 'PICK A CHAPTER';
      pkS.textContent = `STEP 2 · ${selectedSubject.name.toUpperCase()}`;

      const categories = selectedSubject.categories || [];
      if (!categories.length) {
        pkO.innerHTML = '<div style="text-align:center;padding:24px;color:#8a9478;font-weight:600">No chapters available</div>';
        return;
      }

      pkO.innerHTML = categories.map((c, i) => {
        const isSelected = selectedCategory && selectedCategory.id === c.id;
        const statusText = c.isCompleted ? 'Completed' : `${c.totalQuestions || 0} questions`;
        return `<button class="opt${isSelected ? ' on' : ''}" data-type="ch" data-id="${c.id}">
          <span class="oi">${i + 1}</span>
          <span>${esc(c.name)}<small class="osub" style="${c.isCompleted ? 'color:#4a7c13;' : ''}">${statusText}</small></span>
          ${ck}
        </button>`;
      }).join('');
    }
  }

  function closePicker() {
    $('#pk')?.classList.remove('open');
    $('#pkBd')?.classList.remove('open');
    closeYdd();
  }

  $('#qSubj')?.addEventListener('click', () => openPicker('subj'));
  $('#qCh')?.addEventListener('click', () => openPicker('ch'));
  $('#pkX')?.addEventListener('click', closePicker);
  $('#pkBd')?.addEventListener('click', closePicker);

  $('#pkO')?.addEventListener('click', e => {
    const o = e.target.closest('.opt');
    if (!o) return;
    const type = o.dataset.type;
    const id = Number(o.dataset.id);
    const isLocked = o.dataset.locked === '1';
    buzz();

    if (isLocked) {
      toast('This subject is locked');
      return;
    }

    document.querySelectorAll('#pkO .opt').forEach(x => x.classList.toggle('on', x === o));

    if (type === 'subj') {
      const found = allQuizSubjects.find(s => s.id === id);
      if (found && (!selectedSubject || selectedSubject.id !== found.id)) {
        selectedSubject = found;
        selectedCategory = null;
      }
      setTimeout(() => {
        renderFields();
        SFX.play('pop');
        setTimeout(() => openPicker('ch'), 380);
      }, 260);
    } else if (type === 'ch') {
      const categories = selectedSubject?.categories || [];
      const found = categories.find(c => c.id === id);
      if (found) {
        selectedCategory = found;
      }
      setTimeout(() => {
        renderFields();
        SFX.play('pop');
        closePicker();
        replay($('#qbar'), 'nudge');
      }, 260);
    }
  });

  /* Initialize academic year & quiz session subjects on mount */
  async function initInitialData() {
    try {
      const [ranges, prof] = await Promise.all([
        fetchAgeRanges().catch(() => []),
        fetchProfile().catch(() => null),
      ]);
      ageRangesList = ranges || [];
      if (prof?.ageRangeId != null) {
        selectedAgeRangeId = prof.ageRangeId;
      }
      if (ageRangesList.length > 0 && selectedAgeRangeId == null) {
        selectedAgeRangeId = ageRangesList[0].id;
      }
      renderRail();
      renderFields();
    } catch (e) {
      console.error('Error initializing age ranges / profile in quiz:', e);
    }

    // Load ongoing quiz session subjects
    const ongoing = useAppStore.getState().ongoingQuizSession;
    if (ongoing?.id) {
      try {
        allQuizSubjects = await fetchQuizSessionSubjects(ongoing.id);
        if (inProgressAttempt) {
          syncInProgressSubjectCategory(inProgressAttempt);
        } else {
          const available = getFilteredSubjects();
          if (available.length > 0 && !selectedSubject) {
            selectedSubject = available[0];
            selectedCategory = null;
          }
          renderFields();
        }
      } catch (e) {
        console.error('Error fetching quiz session subjects:', e);
      }
    }
  }

  // Subscribe to ongoingQuizSession so if it loads after mount, we fetch its subjects
  useAppStore.subscribe((s, prev) => {
    if (s.ongoingQuizSession?.id && s.ongoingQuizSession.id !== prev.ongoingQuizSession?.id) {
      fetchQuizSessionSubjects(s.ongoingQuizSession.id)
        .then(subs => {
          allQuizSubjects = subs;
          if (inProgressAttempt) {
            syncInProgressSubjectCategory(inProgressAttempt);
          } else {
            const available = getFilteredSubjects();
            if (available.length > 0 && !selectedSubject) {
              selectedSubject = available[0];
              selectedCategory = null;
            }
            renderFields();
          }
        })
        .catch(err => console.error('Failed to load quiz session subjects:', err));
    }
  });

  void initInitialData();

  /* ===================== PRIZE SELECTION & DETAILS ===================== */
  let pzPlace = 1;
  function openPrize(p) {
    pzPlace = p; buzz();
    const d = $('#pzd'), bd = $('#pzBd'); if (!d || !bd) return;
    const list = PRIZES[p] || [], cur = picks[p], lbl = PLACE[p];
    const pzS = $('#pzS'), pzT = $('#pzT'), pzP = $('#pzP'), pzG = $('#pzG');
    if (pzS) pzS.innerHTML = `<i>${p}</i>${lbl} PLACE`;
    if (pzT) pzT.textContent = 'PICK YOUR PRIZE';
    if (pzP) pzP.textContent = `Finish ${lbl.toLowerCase()} when the prize drops and this one is yours.`;
    if (pzG) {
      if (list.length === 0) {
        pzG.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px 16px; color: #8a9478; font-weight: 600; font-size: 14px;">No selectable prizes available for this place yet.</div>';
      } else {
        pzG.innerHTML = list.map((it, i) => `
          <button class="pt${cur === i ? ' on' : ''}" data-i="${i}" aria-label="${it[1]}, see details" style="--bgc:${it[3]};--d:${(i * .05).toFixed(2)}s">
            <span class="inf" aria-hidden="true">i</span>
            <span class="ck"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
            <span class="art">${renderPrizeArt(it[0])}</span>
            <b>${it[1]}</b><small>${it[2]}</small>
          </button>
        `).join('');
      }
    }
    d.classList.add('open'); bd.classList.add('open');
  }

  function closePrize() {
    $('#pzd')?.classList.remove('open');
    $('#pzBd')?.classList.remove('open');
    closePD();
  }

  $('#qpz')?.addEventListener('click', e => {
    const c = e.target.closest('.qp'); if (c) openPrize(Number(c.dataset.p));
  });
  $('#pzX')?.addEventListener('click', closePrize);
  $('#pzBd')?.addEventListener('click', closePrize);

  /* Prize detail sheet */
  function openPD(p, i) {
    const it = PRIZES[p][i]; if (!it) return;
    const pdx = $('#pdx'), pdb = $('#pdb'); if (!pdx || !pdb) return;
    const m = MEDAL_PD[p] || MEDAL_PD[1];
    pdx.style.setProperty('--pbg', it[3] || '#f1fad6');
    pdx.style.setProperty('--pm1', m[0]);
    pdx.style.setProperty('--pm2', m[1]);
    pdx.style.setProperty('--pmt', m[2]);

    $('#pdArt').innerHTML = renderPrizeArt(it[0]);
    $('#pdPlace').innerHTML = `<i>${p}</i>${PLACE[p]} PLACE`;
    $('#pdVal').textContent = (it[2] || '').replace(/^Worth /, '');
    $('#pdBody').innerHTML = `
      <small class="k">PRIZE · PRIZE QUIZ</small>
      <h3 id="pdT">${it[1]}</h3>
      <p>A great prize you can win in RI9 sudden-death prize quiz rounds.</p>
      <div class="pd-tiles">
        <div><small>VALUE</small><b>${(it[2] || '').replace(/^Worth /, '') || 'Top Tier'}</b></div>
        <div><small>AGES</small><b>All ages</b></div>
        <div><small>DELIVERY</small><b>Free delivery</b></div>
      </div>
      <div class="pd-box">
        <h5>WHAT YOU GET</h5>
        <ul>
          <li><i><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i>${it[1]} as pictured</li>
        </ul>
      </div>
      <p class="pd-fine">Physical prizes ship to the mailing address in your profile within 5–7 working days.</p>
    `;
    const isPicked = picks[p] === i;
    $('#pdAct').innerHTML = `
      <button class="sec" id="pdCloseBtn">Back</button>
      <button class="pri" id="pdPickBtn"${isPicked ? ' disabled' : ''}>
        <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        ${isPicked ? 'YOUR PICK' : 'PICK THIS PRIZE'}
      </button>
    `;

    $('#pdCloseBtn').onclick = () => { buzz(); closePD(); };
    $('#pdPickBtn').onclick = () => {
      buzz(); picks[p] = i;
      savePicks(p, it);
      closePD(); closePrize();
      renderPicks(p); SFX.play('sparkle');
      toast(`${PLACE[p]} place prize: ${it[1]}`);
    };

    pdx.classList.add('open'); pdb.classList.add('open'); SFX.play('pop');
  }

  function closePD() {
    $('#pdx')?.classList.remove('open');
    $('#pdb')?.classList.remove('open');
  }
  $('#pdClose')?.addEventListener('click', () => { buzz(); closePD(); });
  $('#pdb')?.addEventListener('click', closePD);

  $('#pzG')?.addEventListener('click', e => {
    const t = e.target.closest('.pt'); if (!t) return;
    const i = Number(t.dataset.i); buzz();
    openPD(pzPlace, i);
  });

  /* ===================== PLAY / COUNTDOWN LAUNCH ===================== */
  let launchTimers = [];

  function burst() {
    if (reduce) return;
    const cv = $('#fx');
    if (!cv) return;
    const x = cv.getContext('2d'), dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cl = ['#c6f432', '#ffffff', '#e3f78f', '#ffd43b', '#ff5a2e'];
    const ps = Array.from({ length: 120 }, () => {
      const a = Math.random() * Math.PI * 2, v = 5 + Math.random() * 11;
      return {
        x: W / 2, y: H * .46, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3,
        r: 3 + Math.random() * 4, c: cl[Math.random() * 5 | 0], l: 1, rt: Math.random() * 6
      };
    });
    (function f() {
      x.clearRect(0, 0, W, H); let a = false;
      ps.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += .28; p.vx *= .985; p.l -= .013; p.rt += .2;
        if (p.l > 0) {
          a = true; x.save(); x.globalAlpha = p.l; x.translate(p.x, p.y); x.rotate(p.rt);
          x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r, p.r, p.r * 2); x.restore();
        }
      });
      if (a) requestAnimationFrame(f); else x.clearRect(0, 0, W, H);
    })();
  }

  function confetti(scr) {
    SFX.play('sparkle');
    if (reduce || !scr) return;
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:30';
    scr.appendChild(cv);
    const W = scr.offsetWidth, H = scr.offsetHeight, d = Math.min(2, devicePixelRatio || 1);
    cv.width = W * d; cv.height = H * d; const x = cv.getContext('2d'); x.scale(d, d);
    const cl = ['#c6f432', '#ffffff', '#ffd25e', '#ff5a4e', '#8f7cff', '#e9ff8f'];
    const ps = Array.from({ length: 90 }, () => ({
      x: W / 2 + (Math.random() - .5) * 80, y: 190,
      vx: (Math.random() - .5) * 12, vy: -4 - Math.random() * 9,
      r: 3 + Math.random() * 4, c: cl[Math.random() * cl.length | 0], rt: Math.random() * 6, l: 1
    }));
    (function f() {
      x.clearRect(0, 0, W, H); let a = false;
      ps.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += .26; p.vx *= .985; p.rt += .22; p.l -= .009;
        if (p.l > 0 && p.y < H) {
          a = true; x.save(); x.globalAlpha = Math.min(1, p.l * 1.5);
          x.translate(p.x, p.y); x.rotate(p.rt); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r, p.r, p.r * 2); x.restore();
        }
      });
      if (a) requestAnimationFrame(f); else cv.remove();
    })();
  }

  function qPlay() {
    const n = QR.rounds.length;
    if (n >= QR.max) { toast('All 9 rounds used. Wait for the prize drop!'); return; }
    buzz();

    const ongoing = useAppStore.getState().ongoingQuizSession;
    if (!ongoing?.id) {
      toast('No active quiz session found');
      return;
    }

    // If an in-progress attempt exists, force the in-progress subject & category
    if (inProgressAttempt) {
      syncInProgressSubjectCategory(inProgressAttempt);
    }

    const subjs = getFilteredSubjects();
    let s = selectedSubject || (subjs.length > 0 ? subjs[0] : null);
    let cat = selectedCategory || (s?.categories?.length > 0 ? s.categories[0] : null);

    if (inProgressAttempt?.subjectId != null) {
      const matchSubj = allQuizSubjects.find(sub => sub.id === inProgressAttempt.subjectId);
      if (matchSubj) {
        s = matchSubj;
        if (inProgressAttempt.categoryId != null && Array.isArray(matchSubj.categories)) {
          const matchCat = matchSubj.categories.find(c => c.id === inProgressAttempt.categoryId);
          if (matchCat) cat = matchCat;
        }
      } else {
        s = { id: inProgressAttempt.subjectId, name: inProgressAttempt.subjectName || 'Subject' };
        if (inProgressAttempt.categoryId != null) {
          cat = { id: inProgressAttempt.categoryId, name: inProgressAttempt.categoryName || 'Chapter' };
        }
      }
    }

    if (!s?.id) {
      toast('Please pick a subject first');
      return;
    }

    const catId = cat ? cat.id : null;

    const launchEl = $('#launch'), cntEl = $('#cnt'), loadEl = $('#launchLoad');
    if (!launchEl || !cntEl) return;

    launchEl.hidden = false;
    cntEl.style.display = '';
    if (loadEl) loadEl.style.display = 'none';

    launchTimers.forEach(clearTimeout); launchTimers = [];

    const seq = reduce ? ['GO!'] : ['3', '2', '1', 'GO!'];
    seq.forEach((v, idx) => {
      launchTimers.push(setTimeout(() => {
        cntEl.textContent = v;
        cntEl.classList.remove('pop'); void cntEl.offsetWidth; cntEl.classList.add('pop');
        SFX.play(v === 'GO!' ? 'go' : 'count');
        try { navigator.vibrate && navigator.vibrate(10); } catch (_) { }
        if (v === 'GO!') burst();
      }, idx * 480));
    });

    launchTimers.push(setTimeout(async () => {
      cntEl.style.display = 'none';
      if (loadEl) loadEl.style.display = 'block';

      try {
        // Call POST /api/v1/quiz-sessions/{sessionId}/start
        const res = await startQuizSessionAttempt(ongoing.id, Number(s.id), catId);

        launchEl.hidden = true;
        cntEl.style.display = '';
        if (loadEl) loadEl.style.display = 'none';

        // Initialize quiz drill state
        QD.sessionId = ongoing.id;
        QD.attemptId = res.attemptId;
        QD.attemptNumber = res.attemptNumber;
        QD.extraLife = res.extraLife;
        QD.currentQuestion = res.firstQuestion;
        QD.score = 0;
        QD.elapsedSeconds = res.elapsedSeconds || 0;
        QD.isSubmitting = false;

        // Mark attempt as in_progress immediately
        inProgressAttempt = {
          id: res.attemptId,
          attemptNumber: res.attemptNumber,
          status: 'in_progress',
          score: null,
          speedSeconds: null,
          isBest: false,
          subjectId: Number(s.id),
          subjectName: s.name,
          categoryId: catId,
          categoryName: cat?.name || null,
        };
        syncInProgressSubjectCategory(inProgressAttempt);

        // Switch screen from #s-quiz to #s-drill
        SFX.play('whoosh');
        $('#s-quiz')?.classList.remove('play');
        $('#s-quiz')?.classList.add('off');
        $('#s-drill')?.classList.remove('off');
        $('#s-drill')?.classList.add('play');

        // Paint question & start timer
        renderQuizQuestion();
        resumeDrill();
      } catch (err) {
        console.error('Failed to start quiz session:', err);
        launchEl.hidden = true;
        cntEl.style.display = '';
        if (loadEl) loadEl.style.display = 'none';
        toast(err?.message || 'Failed to start quiz round');
      }
    }, seq.length * 480 + 120));
  }

  $('#qGo')?.addEventListener('click', qPlay);
  /* ===================== QUIZ DRILL / GAMEPLAY STATE ===================== */
  const QD = {
    sessionId: null,
    attemptId: null,
    attemptNumber: 1,
    extraLife: 1,
    currentQuestion: null,
    score: 0,
    startTime: 0,
    elapsedSeconds: 0,
    qStart: 0,
    run: false,
    raf: 0,
    isSubmitting: false,
  };

  function fmtQuizTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function drillTick() {
    if (!QD.run) return;
    const now = performance.now();
    const sec = QD.elapsedSeconds + (now - QD.startTime) / 1000;
    const timeEl = $('#dTime');
    if (timeEl) timeEl.textContent = fmtQuizTime(sec);
    QD.raf = requestAnimationFrame(drillTick);
  }

  function pauseDrill() {
    if (!QD.run) return;
    QD.elapsedSeconds += (performance.now() - QD.startTime) / 1000;
    QD.run = false;
    cancelAnimationFrame(QD.raf);
  }

  function resumeDrill() {
    QD.startTime = performance.now();
    QD.qStart = performance.now();
    QD.run = true;
    QD.raf = requestAnimationFrame(drillTick);
  }

  function renderQuizQuestion() {
    if (!QD.currentQuestion) return;
    const q = QD.currentQuestion;
    const qb = $('#qbox');
    const isGrouped = q.isGrouped && Array.isArray(q.groupedQuestions) && q.groupedQuestions.length > 0;
    const activeChild = isGrouped ? q.groupedQuestions[0] : null;
    const qText = activeChild ? activeChild.question_text || '' : q.questionText;
    const qImg = q.questionImageUrl;
    const hasStim = Boolean(q.stimulus);

    if (qb) {
      qb.className = 'qbox' + (qImg ? ' has-img' : '') + (hasStim ? ' has-stim' : '');
      const bk = '<svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>';
      const stimBtn = hasStim
        ? `<button class="rm" id="rmBtn" type="button"><i>${bk}</i>Read passage<em>${esc(q.stimulus.stimulus_name || q.stimulus.stimulusName || 'View')}</em><span class="rmp"></span></button>`
        : '';

      qb.innerHTML = `<small>QUESTION · ROUND ${QD.attemptNumber} · SCORE: ${QD.score}</small>
        <p>${formatMathAndText(qText || '')}</p>
        ${qImg ? `<div class="qimg"><img src="${esc(qImg)}" alt="Question Illustration" /></div>` : ''}
        ${stimBtn}`;
      replay(qb, 'inq');
    }

    // Render options
    const rawOptions = activeChild ? activeChild.options || [] : q.options || [];
    const options = rawOptions.map(o => ({
      id: typeof o.id === 'number' ? o.id : Number(o.id) || 0,
      optionText: o.optionText || o.option_text || '',
    }));

    const ansEl = $('#ans');
    if (ansEl) {
      const ck = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      ansEl.innerHTML = options.map((o, k) => `<button class="an" data-id="${o.id}">
        <span class="lt">${'ABCD'[k] || (k + 1)}</span>
        <span class="v">${formatMathAndText(o.optionText)}</span>
        <span class="mk">${ck}</span>
      </button>`).join('');
      ansEl.classList.remove('lock');
      replay(ansEl, 'inq');
    }

    // Update HUD
    const dOk = $('#dOk'); if (dOk) dOk.textContent = String(QD.score);
    const dTot = $('#dTot'); if (dTot) dTot.textContent = ' CORRECT';
    const dNeed = $('#dNeed'); if (dNeed) dNeed.textContent = `ROUND ${QD.attemptNumber}`;
    const dLife = $('#dLife');
    if (dLife) dLife.innerHTML = `<span>${Math.max(0, QD.extraLife)}</span><small>LIFE</small>`;
  }

  function openStimulus() {
    const q = QD.currentQuestion;
    if (!q || !q.stimulus) return;
    buzz();
    const S = q.stimulus;
    const stimEl = $('#stim');
    if (!stimEl) return;

    $('#sKind').textContent = (S.stimulus_type || S.stimulusType || 'READ THIS').toUpperCase();
    $('#sTitle').textContent = S.stimulus_name || S.stimulusName || 'Passage';
    $('#sH').textContent = S.stimulus_name || S.stimulusName || 'Passage';

    const sImg = $('#sImg');
    const imgUrl = S.stimulus_image_url || S.stimulusImageUrl;
    if (imgUrl) {
      sImg.innerHTML = `<img src="${esc(imgUrl)}" alt="Passage Illustration" />`;
      sImg.style.display = 'grid';
    } else {
      sImg.innerHTML = '';
      sImg.style.display = 'none';
    }

    const sTxt = $('#sTxt');
    const textContent = S.stimulus_text || S.stimulusText || '';
    sTxt.innerHTML = textContent ? formatMathAndText(textContent) : '';

    const sQ = $('#sQ');
    if (sQ) sQ.innerHTML = `<b>Question:</b> ${formatMathAndText(q.questionText || '')}`;

    const sb = stimEl.querySelector('.sb');
    if (sb) sb.scrollTop = 0;
    stimEl.classList.add('open');
  }

  function closeStimulus() {
    const stimEl = $('#stim');
    if (stimEl) stimEl.classList.remove('open');
  }

  $('#qbox')?.addEventListener('click', e => {
    if (e.target.closest('#rmBtn')) openStimulus();
  });
  $('#sClose')?.addEventListener('click', () => { buzz(); closeStimulus(); });
  $('#sBack')?.addEventListener('click', () => { buzz(); closeStimulus(); });

  $('#ans')?.addEventListener('click', async e => {
    const btn = e.target.closest('.an');
    if (!btn || !QD.run || QD.isSubmitting) return;
    pauseDrill();
    QD.isSubmitting = true;

    const optionId = Number(btn.dataset.id);
    const q = QD.currentQuestion;
    const timeTaken = Math.max(1, Math.round((performance.now() - QD.qStart) / 1000));
    const isGrouped = q?.isGrouped && Array.isArray(q.groupedQuestions) && q.groupedQuestions.length > 0;
    const activeChild = isGrouped ? q.groupedQuestions[0] : null;

    $('#ans')?.classList.add('lock');

    try {
      const res = await submitQuizAttemptAnswer(
        QD.attemptId,
        q.id,
        optionId,
        timeTaken,
        activeChild?.id ?? null,
      );

      const good = res.isCorrect;
      if (good) {
        QD.score++;
        SFX.play('ok');
        btn.classList.add('ok');
        replay($('#plus1'), 'go');
      } else {
        QD.extraLife = Math.max(0, (res.extraLife != null ? res.extraLife : (QD.extraLife - 1)));
        SFX.play('no');
        btn.classList.add('no');
      }
      try { navigator.vibrate && navigator.vibrate(good ? 12 : [30, 40, 30]); } catch (_) { }

      const flash = $('#flash');
      if (flash) {
        flash.className = 'flash ' + (good ? 'ok' : 'no');
      }

      const dLife = $('#dLife');
      if (dLife) dLife.innerHTML = `<span>${Math.max(0, QD.extraLife)}</span><small>LIFE</small>`;

      if (res.categoryTransition?.current_category_name) {
        toast(`Moving to ${res.categoryTransition.current_category_name}...`);
      }

      setTimeout(async () => {
        if (res.roundEnded || !res.nextQuestion) {
          // Round completed or ended
          await finishQuizRound(res);
        } else {
          QD.currentQuestion = res.nextQuestion;
          QD.isSubmitting = false;
          renderQuizQuestion();
          resumeDrill();
        }
      }, good ? 520 : 900);
    } catch (err) {
      console.error('Failed to submit answer:', err);
      toast(err?.message || 'Error submitting answer');
      QD.isSubmitting = false;
      resumeDrill();
    }
  });

  async function finishQuizRound(res) {
    pauseDrill();
    closeStimulus();

    // In Flutter (quiz_question_screen.dart line 275):
    // When res.roundEnded is true, the backend has ALREADY completed the attempt during /answer.
    // Calling /complete again causes ATTEMPT_NOT_FOUND because it is no longer "active".
    // Only call /complete as a fallback if roundEnded was false and no next question returned.
    if (!res?.roundEnded && QD.attemptId) {
      try {
        await completeQuizAttempt(QD.attemptId);
      } catch (_) { }
    }

    // Refresh attempts from backend
    if (QD.sessionId) {
      try {
        const updated = await fetchQuizSessionAttempts(QD.sessionId);
        syncRoundsFromAttempts(updated);
        renderQuiz(false);
      } catch (_) { }
    }

    // Show round ended modal (#res)
    const totalSec = QD.elapsedSeconds;
    const r = $('#res');
    if (r) {
      $('#ckAv').textContent = `${QD.score} CORRECT`;
      $('#ckTv').textContent = fmtQuizTime(totalSec);
      $('#resSub').textContent = QD.extraLife <= 0
        ? 'One wrong answer ended the round. Great effort!'
        : 'All round questions completed!';
      r.classList.add('show');
      SFX.play(QD.score > 0 ? 'win' : 'lose');
      if (QD.score > 0) confetti(r);
    }
  }

  async function quitQuiz() {
    pauseDrill();
    closeStimulus();
    buzz();
    $('#res')?.classList.remove('show');
    $('#s-drill')?.classList.remove('play');
    $('#s-drill')?.classList.add('off');
    $('#s-quiz')?.classList.remove('off');
    $('#s-quiz')?.classList.add('play');

    // Refetch attempts from backend so the lobby immediately knows
    // there is an attempt in_progress (locking the subject/chapter picker)
    if (QD.sessionId) {
      try {
        const updated = await fetchQuizSessionAttempts(QD.sessionId);
        syncRoundsFromAttempts(updated);
        renderQuiz(false);
      } catch (err) {
        console.error('Failed to refetch quiz attempts on quit:', err);
      }
    }
  }

  $('#dQuit')?.addEventListener('click', quitQuiz);
  $('#resBack')?.addEventListener('click', quitQuiz);
  $('#resAgain')?.addEventListener('click', () => {
    buzz();
    quitQuiz();
    setTimeout(() => qPlay(), 300);
  });

  /* Leaderboard / Past Winners button (#qPast):
     Redirects to the standalone Past Winners (Prize Winners) page (past.html?tab=quiz)
     with the whoosh transition audio effect. */
  $('#qPast')?.addEventListener('click', () => {
    buzz();
    setTimeout(() => {
      SFX.play('whoosh');
      setTimeout(() => { location.href = 'past.html?tab=quiz'; }, 260);
    }, 180);
  });

  /* Info and back button */
  $('#qInfo')?.addEventListener('click', () => {
    buzz(); toast('9 sudden-death rounds. Best round counts. Top 3 win.');
  });
  $('#qBack')?.addEventListener('click', () => {
    buzz(); SFX.play('whoosh');
    setTimeout(() => { location.href = 'index.html'; }, 200);
  });

  /* Initial paints */
  const initialAttempts = useAppStore.getState().quizSessionAttempts;
  if (initialAttempts) {
    syncRoundsFromAttempts(initialAttempts);
  }
  renderPicks();
  renderFields();
  renderQuiz(true);
}
