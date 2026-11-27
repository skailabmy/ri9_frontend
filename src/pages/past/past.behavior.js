import { useAppStore } from '../../store/app';
import { CLOUDFRONT_APP_URL } from '../../api/config';

export function mount() {
  const $ = s => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const replay = (el, c) => { if (!el) return; el.classList.remove(c); void el.offsetWidth; el.classList.add(c) };

  /* ---------- sound FX ---------- */
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
    };
    return { play(k, ...a) { try { P[k] && P[k](...a); } catch (_) { } } };
  })();
  const buzz = () => { SFX.play('tap'); try { navigator.vibrate && navigator.vibrate(10); } catch (_) { } };

  /* ---------- stage fit ---------- */
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

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ini = n => n.split(' ').filter(w => w.length > 1).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const TINT = ['#e4f5b8', '#ffd9b8', '#cfe3ff', '#ffd0dc', '#ddd2ff', '#c7f1df', '#fff0a8', '#e9e6dc'];

  /* Prize Art SVG fallback */
  const PA = {
    console: '<svg viewBox="0 0 64 64"><rect x="6" y="14" width="52" height="36" rx="10" fill="#2d2f2a"/><rect x="14" y="20" width="36" height="24" rx="4" fill="#7fd1ff"/><circle cx="10" cy="28" r="2.5" fill="#c6f432"/><circle cx="53" cy="30" r="2" fill="#ff5a4e"/></svg>',
    scooter: '<svg viewBox="0 0 64 64"><path d="M14 50h36M18 50l12-32h-8" fill="none" stroke="#2d2f2a" stroke-width="4" stroke-linecap="round"/><circle cx="14" cy="50" r="6" fill="#ff5a4e"/><circle cx="50" cy="50" r="6" fill="#ff5a4e"/></svg>',
    earbuds: '<svg viewBox="0 0 64 64"><rect x="10" y="18" width="44" height="32" rx="12" fill="#ffffff" stroke="#2d2f2a" stroke-width="3"/><ellipse cx="24" cy="30" rx="4" ry="7" fill="#2d2f2a"/><ellipse cx="40" cy="30" rx="4" ry="7" fill="#2d2f2a"/></svg>',
    books: '<svg viewBox="0 0 64 64"><path d="M10 48c6-3 14-3 22 0 8-3 16-3 22 0V16c-6-3-14-3-22 0-8-3-16-3-22 0z" fill="#fff" stroke="#2d2f2a" stroke-width="3"/></svg>',
    credit: '<svg viewBox="0 0 64 64"><rect x="4" y="14" width="56" height="36" rx="7" fill="#7fd1ff"/><rect x="4" y="22" width="56" height="7" fill="#1b1c19"/><text x="32" y="44" font-family="Anton,Impact,sans-serif" font-size="14" text-anchor="middle" fill="#1b1c19">RM30</text></svg>'
  };

  const CLOUD_IMG_BASE = `${CLOUDFRONT_APP_URL}/products`;

  // Neutral SVG prize gift/box placeholder for failed or unavailable images
  const BLANK_PRIZE_PLACEHOLDER = `<svg viewBox="0 0 64 64" style="width:36px;height:36px;display:block"><rect width="64" height="64" rx="8" fill="#e2e8f0"/><path d="M20 28h24v20H20z" fill="#cbd5e1"/><path d="M18 24h28v6H18z" fill="#94a3b8"/><path d="M30 24v24h4V24z" fill="#f8fafc"/><circle cx="28" cy="20" r="4" fill="none" stroke="#94a3b8" stroke-width="2.5"/><circle cx="36" cy="20" r="4" fill="none" stroke="#94a3b8" stroke-width="2.5"/></svg>`;

  window._onPrizeImgErr = function(img) {
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

  function renderPrizeArt(imgOrKey) {
    if (!imgOrKey) return BLANK_PRIZE_PLACEHOLDER;
    let imgUrl = '';
    if (imgOrKey.startsWith('http://') || imgOrKey.startsWith('https://')) {
      imgUrl = imgOrKey;
    } else if (imgOrKey.startsWith('/') || imgOrKey.startsWith('./')) {
      imgUrl = `${CLOUDFRONT_APP_URL}${imgOrKey.replace(/^\./, '')}`;
    } else if (/\.(png|jpe?g|webp|svg)$/i.test(imgOrKey)) {
      imgUrl = `${CLOUD_IMG_BASE}/${imgOrKey}`;
    } else if (PA[imgOrKey]) {
      return PA[imgOrKey];
    } else {
      imgUrl = `${CLOUD_IMG_BASE}/${imgOrKey}`;
    }
    return `<img src="${esc(imgUrl)}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:8px" onerror="window._onPrizeImgErr(this)">`;
  }

  /* ===================== PAST WINNERS (PWIN) ===================== */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const dd = d => `${d.getDate()} ${MON[d.getMonth()]}`;
  const meName = () => useAppStore.getState().meName || 'You';

  function mapBackendQuizSessions(apiSessions) {
    const M = meName();
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

      // Extract prizes: prefer b.prizes directly, fallback to rows (winners)
      let prizes = [1, 2, 3].map(pos => {
        const p = (b.prizes || []).find(x => x.position === pos);
        if (p && (p.image || p.name)) {
          return [p.image || null, p.name || 'Prize', '', '#e8f4ff'];
        }
        const w = rows.find(r => r.rank === pos);
        if (w && (w.prizeImage || w.sub)) {
          return [w.prizeImage, w.sub || 'Prize', '', '#e8f4ff'];
        }
        return null;
      });

      // If prizes array has elements but position matching was off (e.g. 0-indexed or unpositioned)
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
        rows.push({ n: `${M} (you)`, c: '#e4f8a8', me: true, score: 0, sub: 'Completed rounds', rank });
      }
      return {
        id: 'qs_' + b.id,
        kind: 'quiz',
        when: en,
        title: b.title || 'Prize Quiz',
        date: `${dd(st)} – ${dd(en)}`,
        sub: '9 sudden-death rounds · best round counts',
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
    const M = meName();
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

      // Extract prizes: prefer b.prizes directly, fallback to rows (winners)
      let prizes = [1, 2, 3].map(pos => {
        const p = (b.prizes || []).find(x => x.position === pos);
        if (p && (p.image || p.name)) {
          return [p.image || null, p.name || 'Prize', '', '#e8f4ff'];
        }
        const w = rows.find(r => r.rank === pos);
        if (w && (w.prizeImage || w.sub)) {
          return [w.prizeImage, w.sub || 'Prize', '', '#e8f4ff'];
        }
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
        rows.push({ n: `${M} (you)`, c: '#e4f8a8', me: true, score: 0, sub: 'Completed challenges', rank });
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
    const lbList = apiLb ? mapBackendBoards(apiLb) : [];
    return [...quizList, ...lbList];
  }

  // Determine initial tab from query / hash (e.g. past.html?tab=quiz or past.html#quiz)
  const initialTab = (new URLSearchParams(location.search).get('tab') || location.hash.replace(/^#/, '') || 'quiz') === 'lb' ? 'lb' : 'quiz';
  let ALL = [], tab = initialTab, filt = 'all';

  const IC = {
    quiz: '<path d="M12 20.5s-8.5-4.8-8.5-11A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.5c0 6.2-8.5 11-8.5 11z"/>',
    lb: '<path d="M8 21V11H3v10zM15 21V4h-6v17zM21 21v-7h-6v7z"/>',
    wk: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
  };
  const KL = { quiz: 'PRIZE QUIZ', lb: 'DAILY', wk: 'WEEKLY' };
  const placeTxt = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const inTab = s => tab === 'quiz' ? s.kind === 'quiz' : s.kind !== 'quiz';

  function list() {
    return ALL.filter(inTab)
      .filter(s => filt === 'won' ? s.won : filt === 'played' ? Boolean(s.rank) : true)
      .sort((a, b) => b.when - a.when);
  }

  function cardH(s, j) {
    const pod = [0, 1, 2].map(k => {
      const row = s.rows[k] || { n: '—', me: false };
      const pzLabel = s.prizes[k] ? s.prizes[k][1] : '';
      return `<div class="r${k + 1}${row.me ? ' pw-mine' : ''}"><span class="pw-md">${k + 1}</span><span class="pw-nm"><b>${esc(row.me ? 'You' : row.n.split(' ')[0])}</b>${pzLabel ? `<small>${esc(pzLabel)}</small>` : ''}</span></div>`;
    }).join('');

    return `
      <div class="pw-c k-${s.kind}${s.won ? ' won' : ''}" data-id="${s.id}" style="--d:${(.04 + j * .04).toFixed(2)}s">
        ${s.won ? '<span class="pw-rib">YOU WON</span>' : ''}
        <div class="pw-h">
          <span class="pw-k"><svg viewBox="0 0 24 24">${IC[s.kind] || IC.wk}</svg>${KL[s.kind] || KL.wk}</span>
          <span class="pw-dt">${esc(s.date)}</span>
        </div>
        <div class="pw-t"><b>${esc(s.title)}</b></div>
        <p class="sub">${esc(s.sub)}</p>
        <div class="pw-pod">${pod}</div>
        <div class="pw-st">
          <span class="st-y${s.won ? ' won' : ''}">
            <b>${s.rank ? '#' + s.rank : '—'}</b>
            ${s.won ? `<span>You won ${esc(s.prize ? s.prize[1] : 'Prize')}! 🎉</span>` : s.rank ? `<span>You finished <b>${placeTxt(s.rank)}</b></span>` : '<span>You didn\'t play</span>'}
          </span>
          <span class="tap">DETAILS <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span>
        </div>
      </div>
    `;
  }

  function render(anim) {
    const L = list(), T = ALL.filter(inTab), wins = T.filter(x => x.won), played = T.filter(x => x.rank);
    let best = null;
    played.forEach(x => { if (best === null || (x.rank && x.rank < best)) best = x.rank; });

    $('#pwSum').innerHTML = `
      <div><b>${wins.length}</b><small>TIMES YOU WON</small></div>
      <div><b>${best ? '#' + best : '—'}</b><small>BEST FINISH</small></div>
      <div><b>${played.length}/${T.length}</b><small>SESSIONS PLAYED</small></div>
    `;

    $('#pwF').innerHTML = `
      <button data-f="all" class="${filt === 'all' ? 'on' : ''}">All <i>${T.length}</i></button>
      <button data-f="won" class="${filt === 'won' ? 'on' : ''}">🏆 I won <i>${wins.length}</i></button>
      <button data-f="played" class="${filt === 'played' ? 'on' : ''}">I played <i>${played.length}</i></button>
    `;

    const el = $('#pwList'); let j = 0, last = '';
    el.innerHTML = L.length
      ? L.map(s => {
          const g = `${MONL[s.when.getMonth()]} ${s.when.getFullYear()}`;
          const h = g !== last ? `<div class="pw-g"><span>${g}</span><span>${L.filter(x => `${MONL[x.when.getMonth()]} ${x.when.getFullYear()}` === g).length} sessions</span></div>` : '';
          last = g;
          return h + cardH(s, j++);
        }).join('')
      : `<div class="pw-empty"><b>${filt === 'won' ? 'No wins here yet' : 'Nothing to show'}</b>${filt === 'won' ? 'Finish in the prize spots and your wins will show up here.' : 'Try another filter.'}</div>`;

    if (anim) { replay(el, 'anim'); el.scrollTop = 0; }
  }

  function detail(id) {
    const s = ALL.find(x => x.id === id); if (!s) return; buzz();
    $('#pwdS').textContent = `${KL[s.kind] || KL.wk} · ${s.date.toUpperCase()}`;
    $('#pwdT').textContent = s.title;
    $('#pwdP').textContent = s.sub;
    const y = $('#pwdYou');
    y.className = 'pwd-you' + (s.won ? ' won' : '');
    y.innerHTML = s.rank
      ? `<b>#${s.rank}</b><span><strong>${s.won ? `You won ${esc(s.prize ? s.prize[1] : 'Prize')}! 🎉` : 'Your finish'}</strong>${s.won ? (s.kind === 'quiz' ? 'It’s in My prizes.' : 'Prize sent to parent email.') : s.rank <= 10 ? 'Top 10 finish!' : 'Keep practising to climb.'}</span>`
      : `<b>—</b><span><strong>You didn't play</strong>Jump into the next one to win.</span>`;

    const pz = s.prizes && s.prizes.length
      ? s.prizes.filter(Boolean).map((p, k) => `
          <div style="--bgc:${p[3] || '#e8f4ff'}">
            ${renderPrizeArt(p[0])}
            <b>${esc(p[1])}</b>
            <small>${['🥇 1ST', '🥈 2ND', '🥉 3RD'][k] || 'Prize'}</small>
          </div>
        `).join('')
      : '';

    const rows = (s.rows || []).map((r, k) => {
      const rk = r.rank || k + 1;
      return (r.rank && r.rank > 10 ? '<div class="pwd-gap">···</div>' : '') + `
        <div class="pwd-r r${rk}${r.me ? ' pw-mine' : ''}">
          <span class="pw-rk">${rk}</span>
          <span class="pw-av" style="--t:${r.c}">${r.me ? 'YOU' : ini(r.n)}</span>
          <span class="pw-nm"><b>${esc(r.n)}</b><small>${esc(r.sub || '')}</small></span>
          <span class="pw-sc">${r.score ? r.score.toLocaleString() : '0'}<small>${(s.unit || '').toUpperCase()}</small></span>
        </div>
      `;
    }).join('');

    $('#pwdB').innerHTML = `
      ${pz ? `<div class="pwd-l">PRIZES</div><div class="pwd-pz">${pz}</div>` : ''}
      ${s.cons ? `<div class="pwd-con">${renderPrizeArt(s.cons[0])}<span>4th – 10th each won <b>${esc(s.cons[1])}</b></span></div>` : ''}
      <div class="pwd-l" style="margin-top:14px">FINAL BOARD</div>
      <div class="pwd-rows">${rows}</div>
    `;

    $('#pwdF').innerHTML = `<button class="sec" data-a="close">Close</button>`;
    $('#pwdB').scrollTop = 0;
    $('#pwd').classList.add('open'); $('#pwdBd').classList.add('open');
    SFX.play('pop');
  }

  function closeDetail() {
    $('#pwd')?.classList.remove('open');
    $('#pwdBd')?.classList.remove('open');
  }

  const segBtns = [...document.querySelectorAll('#pwSeg button')], k = $('#pwK');
  const moveK = () => {
    const b = document.querySelector('#pwSeg button.on'); if (!b || !b.offsetWidth) return;
    k.style.width = b.offsetWidth + 'px';
    k.style.transform = `translateX(${b.offsetLeft}px)`;
  };

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

  $('#pwF')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    buzz();
    if (b.dataset.f) {
      filt = b.dataset.f;
      render(true);
      useAppStore.getState().setPwFilter(filt);
    }
  });

  $('#pwList')?.addEventListener('click', e => {
    const c = e.target.closest('.pw-c'); if (c) detail(c.dataset.id);
  });
  $('#pwdF')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    buzz(); closeDetail();
  });
  ['#pwdX', '#pwdBd'].forEach(s => $(s)?.addEventListener('click', () => { buzz(); closeDetail(); }));
  addEventListener('keydown', e => { if (e.key === 'Escape' && $('#pwd')?.classList.contains('open')) closeDetail(); });

  // Back button navigates to caller or default
  $('#pwBack')?.addEventListener('click', () => {
    buzz();
    SFX.play('whoosh');
    setTimeout(() => {
      if (history.length > 1) history.back();
      else location.href = tab === 'quiz' ? 'quiz.html' : 'challenge.html';
    }, 200);
  });

  addEventListener('resize', moveK);
  document.fonts && document.fonts.ready.then(moveK);

  function open() {
    ALL = build();
    segBtns.forEach(x => x.classList.toggle('on', x.dataset.t === tab));
    render(true);
    requestAnimationFrame(moveK);
  }

  open();

  useAppStore.subscribe((s, prev) => {
    if (
      s.weeklyBoardsHistory !== prev.weeklyBoardsHistory ||
      s.quizSessionsHistory !== prev.quizSessionsHistory
    ) {
      ALL = build();
      render(true);
    }
  });
}
