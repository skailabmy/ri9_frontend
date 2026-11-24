/* ============================================================
   RI9 · AUTH FLOW BEHAVIOR
   Extracted from references/auth.html & modernized for Vite/TS.
   Uses the global BottomSheet component and hooks up login API.
   ============================================================ */
import { BottomSheet } from '../../components/sheet/sheet';
import {
  login,
  setToken,
  registerUser,
  verifyRegistration,
  resendRegistrationOtp,
  forgotPasswordEmail,
  forgotPasswordSms,
  verifyResetPasswordSms,
  resendResetPasswordSms,
  resetPasswordSms,
  fetchCountriesWithDetected,
  type UiCountry,
} from '../../api/auth';
import {
  credentialsSchema,
  usernameInputSchema,
  emailInputSchema,
  createPhoneInputSchema,
  passwordCreationSchema,
  otpInputSchema,
} from '../../api/schemas';
import { useAppStore } from '../../store/app';
import { routes } from '../../router';
import { ApiError } from '../../api/client';

export function mountAuth(): void {
  const $ = <E extends Element = HTMLElement>(s: string): E | null => document.querySelector<E>(s);
  const $$ = <E extends Element = HTMLElement>(s: string): E[] => [...document.querySelectorAll<E>(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  /* ---------- icons ---------- */
  const I: Record<string, string> = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
    mailopen: '<path d="M3 10l9-6 9 6v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M3 10l9 6 9-6"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/><circle cx="12" cy="15.6" r="1.2" fill="currentColor"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.1 3.9M6.6 6.6A17 17 0 002 12s3.6 7 10 7a9.6 9.6 0 004.4-1.1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    key: '<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8L20 3M16.5 6.5l2.5 2.5M14 9l2 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.2"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>',
  };

  const svg = (n: string, sw = 1.9): string =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;

  $$('svg[data-ic]').forEach((e) => {
    const iconName = (e as HTMLElement).dataset.ic || '';
    const t = document.createElement('template');
    t.innerHTML = svg(iconName, iconName === 'check' ? 3 : 1.9);
    e.replaceWith(t.content.firstChild!);
  });

  $$('[data-back]').forEach((b) => {
    if (b.classList.contains('back')) b.innerHTML = svg('back', 2.2);
  });

  const setEye = (b: HTMLElement, on: boolean): void => {
    b.innerHTML = svg(on ? 'eye' : 'eyeoff', 1.8);
    b.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
  };

  $$('[data-eye]').forEach((b) => {
    const btn = b as HTMLElement;
    setEye(btn, false);
    btn.onclick = () => {
      const targetId = btn.dataset.eye;
      if (!targetId) return;
      const inp = document.getElementById(targetId) as HTMLInputElement | null;
      if (!inp) return;
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      setEye(btn, show);
      inp.focus({ preventScroll: true });
    };
  });

  /* light-screen speed streaks */
  const STREAKS: [number, number, string, number, number, number][] = [
    [40, 26, '#d6ef5f', 0.75, 8, 7],
    [86, 14, '#bfe85a', 0.55, 5, 9],
    [118, 34, '#e9f59a', 0.7, 12, 8],
    [168, 10, '#c9ec66', 0.5, 4, 6],
    [196, 22, '#f0f7b8', 0.6, 10, 10],
    [238, 8, '#cbe96a', 0.4, 3, 7],
  ];

  $$('[data-speed]').forEach((s) => {
    s.innerHTML = STREAKS.map(
      ([t, h, c, o, b, d]) =>
        `<i style="top:${t}px;height:${h}px;--c:${c};--o:${o};--b:${b}px;--t:${d}s"></i>`,
    ).join('');
  });

  /* ---------- navigation ---------- */
  const history = ['splash'];
  let cur = 'splash';

  function show(id: string, dir = 'fwd'): void {
    if (id === cur) return;
    const from = document.getElementById(cur);
    const to = document.getElementById(id);
    if (!from || !to) return;

    if (dir === 'fwd') {
      from.dataset.pos = from.id === 'login' ? 'left' : 'left';
      to.dataset.pos = 'center';
      history.push(id);
    } else {
      from.dataset.pos = 'right';
      to.dataset.pos = 'center';
    }
    to.scrollTop = 0;
    cur = id;

    const metaTheme = $('meta[name=theme-color]');
    if (metaTheme) metaTheme.setAttribute('content', id === 'login' ? '#0d0e0c' : '#ffffff');

    const v = $<HTMLVideoElement>('#vid');
    if (id === 'login' && v) {
      v.play().catch(() => {});
    }

    setTimeout(() => {
      const f = to.querySelector<HTMLInputElement>('input:not([hidden] input)');
      if (f && id !== 'login' && matchMedia('(hover:hover)').matches) {
        f.focus({ preventScroll: true });
      }
    }, 560);
  }

  const go = (id: string): void => show(id, 'fwd');

  function back(): void {
    if (history.length <= 2) {
      home();
      return;
    }
    history.pop();
    show(history[history.length - 1], 'back');
  }

  function home(): void {
    const target = 'login';
    const from = document.getElementById(cur);
    $$('.screen').forEach((s) => {
      if (s.id !== 'login' && s.id !== 'splash' && s !== from) s.dataset.pos = 'right';
    });
    history.length = 0;
    history.push('splash', 'login');
    if (from) from.dataset.pos = 'right';
    const targetEl = document.getElementById(target);
    if (targetEl) targetEl.dataset.pos = 'center';
    cur = target;

    const metaTheme = $('meta[name=theme-color]');
    if (metaTheme) metaTheme.setAttribute('content', '#0d0e0c');

    const v = $<HTMLVideoElement>('#vid');
    v?.play().catch(() => {});
  }

  $$('[data-go]').forEach((b) => (b as HTMLElement).onclick = () => go((b as HTMLElement).dataset.go || ''));
  $$('[data-back]').forEach((b) => (b as HTMLElement).onclick = back);
  $$('[data-home]').forEach((b) => (b as HTMLElement).onclick = home);

  const appEl = $('#app');
  appEl?.addEventListener('scroll', () => {
    appEl.scrollTop = 0;
    appEl.scrollLeft = 0;
  });

  /* ---------- toast ---------- */
  let tt: ReturnType<typeof setTimeout> | undefined;
  function toast(m: string): void {
    const t = $('#toast');
    if (!t) return;
    const span = t.querySelector('span');
    if (span) span.textContent = m;
    t.classList.add('show');
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- splash ---------- */
  const warp = $('#warp');
  if (warp) {
    warp.innerHTML = Array.from(
      { length: 26 },
      () =>
        `<i style="top:${(Math.random() * 100).toFixed(1)}%;width:${(20 + Math.random() * 40).toFixed(0)}%;--t:${(0.7 + Math.random() * 1.2).toFixed(2)}s;--d:${(Math.random() * 1.5).toFixed(2)}s;--o:${(0.25 + Math.random() * 0.6).toFixed(2)}"></i>`,
    ).join('');
  }

  let splashDone = false;
  async function runSplash(): Promise<void> {
    const segs = $$('#nine i');
    for (let i = 0; i < segs.length; i++) {
      await wait(reduce ? 0 : i === 0 ? 650 : 150);
      if (splashDone) return;
      segs[i].classList.add('on');
    }
    await wait(reduce ? 0 : 320);
    leaveSplash();
  }

  async function leaveSplash(): Promise<void> {
    if (splashDone) return;
    splashDone = true;
    const w = $('#wipe');
    if (!reduce && w) {
      w.classList.add('go');
      await wait(330);
    }
    const loginEl = $('#login');
    const splashEl = $('#splash');
    if (loginEl) loginEl.dataset.pos = 'center';
    if (splashEl) splashEl.dataset.pos = 'under';

    const metaTheme = $('meta[name=theme-color]');
    if (metaTheme) metaTheme.setAttribute('content', '#0d0e0c');
    cur = 'login';
    history.push('login');

    const v = $<HTMLVideoElement>('#vid');
    v?.play().catch(() => {});

    setTimeout(() => {
      if (splashEl) (splashEl as HTMLElement).hidden = true;
      w?.classList.remove('go');
    }, 800);
  }

  const skipBtn = $('#skip');
  if (skipBtn) skipBtn.onclick = () => leaveSplash();
  $('#splash')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id !== 'skip') leaveSplash();
  });
  void runSplash();

  /* ---------- countries & registration state ---------- */
  let countriesList: UiCountry[] = [];
  let selectedCountry: UiCountry = {
    id: 1,
    code: 'MY',
    name: 'Malaysia',
    flag: '🇲🇾',
    dialCode: '+60',
    minDigits: 9,
    maxDigits: 10,
  };
  let countriesLoading = false;

  async function loadCountries(): Promise<void> {
    if (countriesList.length > 0 || countriesLoading) return;
    countriesLoading = true;
    try {
      const { countries, detectedCountry } = await fetchCountriesWithDetected();
      if (countries && countries.length > 0) {
        countriesList = countries;
        if (detectedCountry) {
          selectedCountry = detectedCountry;
        } else if (!countries.some((c) => c.code === selectedCountry.code)) {
          selectedCountry = countries[0];
        }
      }
    } catch (err) {
      console.warn('Failed to load countries from API:', err);
    } finally {
      countriesLoading = false;
      paintCountry();
    }
  }

  function paintCountry(): void {
    $$('[data-cflag]').forEach((e) => (e.textContent = selectedCountry.flag));
    $$('[data-cname]').forEach((e) => (e.textContent = selectedCountry.name));
    $$('[data-dial]').forEach((e) => (e.innerHTML = `<span class="fl">${selectedCountry.flag}</span>${selectedCountry.dialCode}`));
    const listEl = $('#countryList');
    if (listEl) {
      if (countriesLoading && countriesList.length === 0) {
        listEl.innerHTML = '<div style="padding: 24px; text-align: center; color: #888;"><span class="spin"></span> Loading countries…</div>';
        return;
      }
      listEl.innerHTML = countriesList.map(
        (k) =>
          `<button class="opt" role="option" aria-selected="${k.id === selectedCountry.id || k.code === selectedCountry.code}" data-cid="${k.id}" data-c="${k.code}"><span class="fl">${k.flag}</span><span class="n">${k.name}</span><span class="c">${k.dialCode}</span><span class="ck">${svg('check', 3)}</span></button>`,
      ).join('');
      $$('#countryList [data-cid]').forEach((b) => {
        (b as HTMLElement).onclick = () => {
          const cid = (b as HTMLElement).dataset.cid;
          const cCode = (b as HTMLElement).dataset.c;
          const found = countriesList.find((k) => String(k.id) === cid || (cCode && k.code === cCode));
          if (found) selectedCountry = found;
          paintCountry();
          countrySheet.close();
        };
      });
    }
  }

  /* ---------- sheets using global BottomSheet component ---------- */
  const countrySheetEl = $('#countrySheet');
  const sosSheetEl = $('#sosSheet');
  const scrimEl = $('#scrim');

  const countrySheet = new BottomSheet(countrySheetEl!, scrimEl!);
  const sosSheet = new BottomSheet(sosSheetEl!, scrimEl!);

  paintCountry();

  // Preload countries in background
  void loadCountries();

  $$('[data-country]').forEach((b) => {
    (b as HTMLElement).onclick = () => {
      countrySheet.open();
      if (countriesList.length === 0) {
        void loadCountries();
      }
    };
  });
  const sosBtn = $('#sosBtn');
  if (sosBtn) sosBtn.onclick = () => sosSheet.open();

  $$('[data-sos]').forEach((b) => {
    (b as HTMLElement).onclick = () => {
      const k = (b as HTMLElement).dataset.sos;
      sosSheet.close();
      if (k === 'forgot') go('forgot');
      else if (k === 'user') toast('Your username is in your welcome email — or ask a parent.');
      else toast('Connecting you to Ri9 support…');
    };
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !countrySheet.active && !sosSheet.active && cur !== 'login' && cur !== 'splash') {
      back();
    }
  });

  /* ---------- validation helpers via Zod schemas ---------- */
  function validateField<T>(schema: import('zod').ZodType<T>, value: unknown): { ok: boolean; error?: string } {
    const res = schema.safeParse(value);
    if (!res.success) {
      return { ok: false, error: res.error.issues[0]?.message || 'Invalid value' };
    }
    return { ok: true };
  }

  function setErr(fld: HTMLElement, msg?: string): void {
    fld.classList.toggle('bad', !!msg);
    fld.classList.remove('ok');
    const errSpan = fld.querySelector('.err');
    if (errSpan) errSpan.textContent = msg || '';
  }

  function setOk(fld: HTMLElement, ok: boolean): void {
    fld.classList.toggle('ok', ok);
    if (ok) {
      fld.classList.remove('bad');
      const errSpan = fld.querySelector('.err');
      if (errSpan) errSpan.textContent = '';
    }
  }

  function strength(p: string): number {
    let s = 0;
    if (p.length >= 8) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++;
    return p ? Math.max(1, s) : 0;
  }

  const SLBL = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const SCOL = ['', '#e5483a', '#f2a93b', '#a7d81c', '#6cc43a'];

  const digits = (v: string): string => v.replace(/\D/g, '').replace(/^0+/, '');
  function maskPhone(v: string, dial = selectedCountry.dialCode): string {
    const d = digits(v);
    return `${dial} ${d.slice(0, 2)}•••${d.slice(-4)}`;
  }

  async function busy(btn: HTMLButtonElement, ms = 900): Promise<void> {
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    await wait(ms);
    btn.disabled = false;
    btn.innerHTML = html;
  }

  const F = (form: HTMLFormElement, name: string): HTMLElement =>
    form.querySelector<HTMLElement>(`[data-f="${name}"]`)!;

  $$('.fld input').forEach((i) =>
    i.addEventListener('input', () => {
      const f = i.closest<HTMLElement>('.fld');
      if (f && f.classList.contains('bad')) setErr(f, '');
    }),
  );

  $$('input[type=tel]').forEach((i) =>
    i.addEventListener('input', () => {
      const inp = i as HTMLInputElement;
      inp.value = inp.value.replace(/[^\d\s-]/g, '').slice(0, 16);
    }),
  );

  /* email / mobile toggles */
  const mode = { reg: 'email', fp: 'email' };
  $$('[data-swap]').forEach((b) => {
    (b as HTMLElement).onclick = () => {
      const k = (b as HTMLElement).dataset.swap as 'reg' | 'fp';
      const m = (mode[k] = mode[k] === 'email' ? 'mobile' : 'email');
      const form = (b as HTMLElement).closest('form') as HTMLFormElement;
      const fld = F(form, 'contact');
      const emailBox = fld.querySelector<HTMLElement>('[data-mode=email]');
      const mobileBox = fld.querySelector<HTMLElement>('[data-mode=mobile]');
      if (emailBox) emailBox.hidden = m !== 'email';
      if (mobileBox) mobileBox.hidden = m !== 'mobile';
      setErr(fld, '');
      b.textContent = m === 'email' ? 'Use mobile' : 'Use email';

      if (k === 'fp') {
        const fpSub = $('#fpSub');
        const fpGo = $('#fpGo');
        const optOnlyMobile = $('#forgot [data-only-mobile]');
        const fpUserFld = form.querySelector<HTMLElement>('[data-f="fp-user"]');
        if (fpUserFld) fpUserFld.hidden = m !== 'mobile';
        if (fpSub) {
          fpSub.textContent =
            m === 'email'
              ? 'Enter your email to receive a reset link'
              : 'Enter your username and mobile number to receive a 6-digit code';
        }
        if (fpGo) fpGo.textContent = m === 'email' ? 'Send reset link' : 'Send OTP';
        if (optOnlyMobile) (optOnlyMobile as HTMLElement).hidden = m !== 'mobile';
      }

      const activeInput = fld.querySelector<HTMLInputElement>(`[data-mode=${m}] input`);
      activeInput?.focus();
    };
  });

  function navigatePostAuth(): void {
    let walkthroughDone = false;
    try {
      walkthroughDone = localStorage.getItem('ri9_walkthrough') === 'done';
    } catch {
      walkthroughDone = false;
    }

    if (!walkthroughDone) {
      location.href = routes.onboarding;
    } else {
      location.href = routes.home;
    }
  }

  /* ---------- LOGIN ---------- */
  $('#loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $<HTMLInputElement>('#lgUser')!;
    const p = $<HTMLInputElement>('#lgPass')!;
    const err = $<HTMLElement>('#lgErr')!;
    const row = $<HTMLElement>('#lgRow')!;

    $$('.sk').forEach((s) => s.classList.remove('bad'));
    err.hidden = true;

    // Validate inputs with Zod credentialsSchema
    const credValidation = credentialsSchema.safeParse({ username: u.value, password: p.value });
    if (!credValidation.success) {
      const issues = credValidation.error.issues;
      const userIssue = issues.find((i) => i.path[0] === 'username');
      const passIssue = issues.find((i) => i.path[0] === 'password');

      if (userIssue) u.closest('.sk')?.classList.add('bad');
      if (passIssue) p.closest('.sk')?.classList.add('bad');

      err.textContent =
        userIssue && passIssue
          ? 'Enter your username and password.'
          : (userIssue?.message || passIssue?.message || 'Invalid credentials');
      err.hidden = false;
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      if (userIssue) u.focus();
      else if (passIssue) p.focus();
      return;
    }

    const b = $<HTMLButtonElement>('#lgGo')!;
    const html = b.innerHTML;
    b.disabled = true;
    b.innerHTML = '<span class="spin"></span>';

    try {
      // Authenticate with real API using validated credentials
      const res = await login(credValidation.data.username, credValidation.data.password);
      setToken(res.token);
      useAppStore.getState().setRole('kid');
      if (res.user.username) {
        useAppStore.getState().setMeName(res.user.username);
      }
      toast(`Welcome back, ${res.user.username || u.value.trim()}!`);
      await wait(800);
      navigatePostAuth();
    } catch (loginErr: unknown) {
      b.disabled = false;
      b.innerHTML = html;

      let errMsg = 'Username or password is incorrect.';
      if (loginErr instanceof ApiError) {
        if (loginErr.errorCode === 'INVALID_CREDENTIALS') {
          errMsg = loginErr.message || 'Invalid credentials';
        } else if (loginErr.message) {
          errMsg = loginErr.message;
        }
      } else if ((loginErr as { message?: string })?.message) {
        errMsg = (loginErr as { message: string }).message;
      }

      u.closest('.sk')?.classList.add('bad');
      p.closest('.sk')?.classList.add('bad');
      err.textContent = errMsg;
      err.hidden = false;
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      p.select();
    }
  });

  $$('#lgUser,#lgPass').forEach((i) =>
    i.addEventListener('input', () => {
      i.closest('.sk')?.classList.remove('bad');
      const err = $('#lgErr');
      if (err) err.hidden = true;
    }),
  );

  /* ---------- REGISTER ---------- */
  const rg = $<HTMLFormElement>('#regForm')!;

  $('#rgUser')?.addEventListener('blur', (e) => {
    const v = (e.target as HTMLInputElement).value.trim();
    if (!v) return;
    const res = validateField(usernameInputSchema, v);
    res.ok ? setOk(F(rg, 'user'), true) : setErr(F(rg, 'user'), res.error);
  });

  $('#rgEmail')?.addEventListener('blur', (e) => {
    const v = (e.target as HTMLInputElement).value.trim();
    if (!v) return;
    const res = validateField(emailInputSchema, v);
    res.ok ? setOk(F(rg, 'contact'), true) : setErr(F(rg, 'contact'), res.error);
  });

  $('#rgPhone')?.addEventListener('blur', (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (!v) return;
    const phoneSchema = createPhoneInputSchema(selectedCountry.minDigits, selectedCountry.maxDigits, selectedCountry.name);
    const res = validateField(phoneSchema, v);
    res.ok ? setOk(F(rg, 'contact'), true) : setErr(F(rg, 'contact'), res.error);
  });

  $('#rgPass')?.addEventListener('input', (e) => {
    const s = strength((e.target as HTMLInputElement).value);
    const rgMeter = $('#rgMeter');
    const rgMeterLbl = $('#rgMeterLbl');
    if (rgMeter) rgMeter.hidden = !s;
    if (rgMeterLbl) rgMeterLbl.hidden = !s;
    $$('#rgMeter i').forEach((b, i) => ((b as HTMLElement).style.background = i < s ? SCOL[s] : ''));
    const l = $('#rgMeterLbl b');
    if (l) {
      l.textContent = SLBL[s];
      (l as HTMLElement).style.color = SCOL[s];
    }
  });

  // Track pending registration details for OTP verification
  interface PendingRegistration {
    username: string;
    email?: string;
    mobileNumber?: string;
    countryCode?: string;
    countryId?: number;
    referer?: string;
  }
  let pendingReg: PendingRegistration | null = null;

  // Track pending reset password details
  interface PendingReset {
    username: string;
    mobileNumber: string;
    resetToken?: string;
  }
  let pendingReset: PendingReset | null = null;

  rg?.addEventListener('submit', async (e) => {
    e.preventDefault();
    let first: HTMLElement | null = null;
    const bad = (f: HTMLElement, m: string, i: HTMLElement): void => {
      setErr(f, m);
      first = first || i;
    };

    const u = $<HTMLInputElement>('#rgUser')!.value.trim();
    const uRes = validateField(usernameInputSchema, u);
    if (!uRes.ok) bad(F(rg, 'user'), uRes.error!, $('#rgUser')!);
    else setOk(F(rg, 'user'), true);

    let cleanMobile: string | undefined;
    let cleanEmail: string | undefined;

    if (mode.reg === 'email') {
      const v = $<HTMLInputElement>('#rgEmail')!.value.trim();
      const eRes = validateField(emailInputSchema, v);
      if (!eRes.ok) bad(F(rg, 'contact'), eRes.error!, $('#rgEmail')!);
      else {
        setOk(F(rg, 'contact'), true);
        cleanEmail = v;
      }
    } else {
      const v = $<HTMLInputElement>('#rgPhone')!.value;
      const pSchema = createPhoneInputSchema(selectedCountry.minDigits, selectedCountry.maxDigits, selectedCountry.name);
      const pRes = validateField(pSchema, v);
      if (!pRes.ok) bad(F(rg, 'contact'), pRes.error!, $('#rgPhone')!);
      else {
        setOk(F(rg, 'contact'), true);
        cleanMobile = digits(v);
      }
    }

    const p = $<HTMLInputElement>('#rgPass')!.value;
    const pRes = validateField(passwordCreationSchema, p);
    if (!pRes.ok) bad(F(rg, 'pass'), pRes.error!, $('#rgPass')!);
    else setErr(F(rg, 'pass'), '');

    const c = $<HTMLInputElement>('#rgConfirm')!.value;
    if (!c) bad(F(rg, 'confirm'), 'Re-enter your password.', $('#rgConfirm')!);
    else if (c !== p) bad(F(rg, 'confirm'), "Passwords don't match.", $('#rgConfirm')!);
    else setErr(F(rg, 'confirm'), '');

    if (first) {
      (first as HTMLElement).focus();
      return;
    }

    const regBtn = $<HTMLButtonElement>('#rgGo')!;
    const origHtml = regBtn.innerHTML;
    regBtn.disabled = true;
    regBtn.innerHTML = '<span class="spin"></span>';

    // Parse referer query param if present
    const urlParams = new URLSearchParams(window.location.search);
    const refererParam = urlParams.get('ref') || urlParams.get('referer') || undefined;

    try {
      const res = await registerUser({
        username: u,
        password: p,
        email: cleanEmail,
        mobileNumber: cleanMobile,
        countryCode: selectedCountry.dialCode,
        countryId: selectedCountry.id || undefined,
        referer: refererParam,
      });

      pendingReg = {
        username: u,
        email: cleanEmail,
        mobileNumber: cleanMobile,
        countryCode: selectedCountry.dialCode,
        countryId: selectedCountry.id || undefined,
        referer: refererParam,
      };

      toast(res.message || 'Verification code sent!');
      const destination = mode.reg === 'mobile' ? (cleanMobile ? maskPhone(cleanMobile, selectedCountry.dialCode) : '') : cleanEmail || '';
      startOtp('register', destination, mode.reg === 'email');
    } catch (err: unknown) {
      const errMsg = (err as { message?: string })?.message || 'Registration failed. Please try again.';
      toast(errMsg);
      setErr(F(rg, 'user'), errMsg);
    } finally {
      regBtn.disabled = false;
      regBtn.innerHTML = origHtml;
    }
  });

  /* ---------- FORGOT ---------- */
  let lastFpEmail = '';
  const fp = $<HTMLFormElement>('#fpForm');
  fp?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const contactFld = F(fp, 'contact');
    const userFld = F(fp, 'fp-user');

    if (mode.fp === 'email') {
      const i = $<HTMLInputElement>('#fpEmail')!;
      const v = i.value.trim();
      const res = validateField(emailInputSchema, v);
      if (!res.ok) {
        setErr(contactFld, res.error);
        i.focus();
        return;
      }

      const fpBtn = $<HTMLButtonElement>('#fpGo')!;
      const origHtml = fpBtn.innerHTML;
      fpBtn.disabled = true;
      fpBtn.innerHTML = '<span class="spin"></span>';

      try {
        const result = await forgotPasswordEmail(v);
        lastFpEmail = v;
        const sentTo = $('#sentTo');
        if (sentTo) sentTo.textContent = v;
        toast(result.message || 'Reset link sent! Check your email.');
        go('sent');
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message || 'Failed to send reset email. Please try again.';
        setErr(contactFld, msg);
        toast(msg);
      } finally {
        fpBtn.disabled = false;
        fpBtn.innerHTML = origHtml;
      }
    } else {
      const uInput = $<HTMLInputElement>('#fpUser')!;
      const u = uInput.value.trim();
      const uRes = validateField(usernameInputSchema, u);
      if (!uRes.ok) {
        setErr(userFld, uRes.error);
        uInput.focus();
        return;
      }

      const pInput = $<HTMLInputElement>('#fpPhone')!;
      const rawMobile = pInput.value;
      const phoneSchema = createPhoneInputSchema(selectedCountry.minDigits, selectedCountry.maxDigits, selectedCountry.name);
      const res = validateField(phoneSchema, rawMobile);
      if (!res.ok) {
        setErr(contactFld, res.error);
        pInput.focus();
        return;
      }

      const mobileNumber = digits(rawMobile);
      const fpBtn = $<HTMLButtonElement>('#fpGo')!;
      const origHtml = fpBtn.innerHTML;
      fpBtn.disabled = true;
      fpBtn.innerHTML = '<span class="spin"></span>';

      try {
        const smsRes = await forgotPasswordSms({
          username: u,
          mobileNumber,
          countryCode: selectedCountry.dialCode,
        });

        pendingReset = {
          username: u,
          mobileNumber,
        };

        toast(smsRes.message || 'Verification code sent!');
        const displayDestination = smsRes.maskedDestination || maskPhone(mobileNumber, selectedCountry.dialCode);
        startOtp('reset', displayDestination, false);
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message || 'Failed to send reset code. Please try again.';
        setErr(contactFld, msg);
        toast(msg);
      } finally {
        fpBtn.disabled = false;
        fpBtn.innerHTML = origHtml;
      }
    }
  });

  const sentResend = $('#sentResend');
  if (sentResend) {
    sentResend.onclick = async (e) => {
      if (!lastFpEmail) return;
      const b = e.currentTarget as HTMLButtonElement;
      b.disabled = true;
      try {
        await forgotPasswordEmail(lastFpEmail);
        toast('Reset link sent again.');
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message || 'Failed to resend reset email.';
        toast(msg);
      }
      let n = 30;
      b.textContent = `Resend in ${n}s`;
      const t = setInterval(() => {
        n--;
        if (n <= 0) {
          clearInterval(t);
          b.disabled = false;
          b.textContent = 'Resend';
        } else {
          b.textContent = `Resend in ${n}s`;
        }
      }, 1000);
    };
  }

  const openMail = $('#openMail');
  if (openMail) {
    openMail.onclick = () => {
      try {
        location.href = 'mailto:';
      } catch {
        toast('Opening your email app…');
      }
    };
  }

  /* ---------- OTP ---------- */
  const boxes = $('#otpBoxes');
  if (boxes) {
    boxes.innerHTML = Array.from(
      { length: 6 },
      (_, i) =>
        `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Digit ${i + 1}" ${
          i === 0 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'
        }>`,
    ).join('');
  }

  const ins = [...boxes?.querySelectorAll<HTMLInputElement>('input') || []];
  const code = (): string => ins.map((i) => i.value).join('');

  function syncOtp(): void {
    ins.forEach((i) => i.classList.toggle('fill', !!i.value));
    const otpGo = $<HTMLButtonElement>('#otpGo');
    if (otpGo) otpGo.disabled = code().length !== 6;
    boxes?.classList.remove('bad');
    const otpErr = $('#otpErr');
    if (otpErr) otpErr.textContent = '';
  }

  function fillFrom(idx: number, str: string): void {
    const d = str.replace(/\D/g, '').split('');
    let k = idx;
    for (const c of d) {
      if (k > 5) break;
      ins[k++].value = c;
    }
    syncOtp();
    ins[Math.min(k, 5)]?.focus();
    if (code().length === 6) void verifyOtp();
  }

  ins.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      const v = inp.value.replace(/\D/g, '');
      if (v.length > 1) {
        inp.value = '';
        fillFrom(i, v);
        return;
      }
      inp.value = v;
      syncOtp();
      if (v && i < 5) ins[i + 1]?.focus();
      if (code().length === 6) void verifyOtp();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) {
        ins[i - 1].value = '';
        ins[i - 1].focus();
        syncOtp();
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' && i > 0) {
        ins[i - 1]?.focus();
      } else if (e.key === 'ArrowRight' && i < 5) {
        ins[i + 1]?.focus();
      }
    });
    inp.addEventListener('paste', (e) => {
      e.preventDefault();
      fillFrom(i, (e.clipboardData || (window as unknown as { clipboardData: DataTransfer }).clipboardData).getData('text'));
    });
    inp.addEventListener('focus', () => inp.select());
  });

  let otpCtx: 'register' | 'reset' = 'reset';
  let otpTimer: ReturnType<typeof setInterval> | undefined;

  function startTimer(): void {
    clearInterval(otpTimer);
    let n = 60;
    const b = $<HTMLButtonElement>('#otpResend');
    const t = $('#otpTimer');
    if (b) b.disabled = true;

    const tick = (): void => {
      if (t) t.textContent = n > 0 ? `Resend available in 0:${String(n).padStart(2, '0')}` : "Didn't receive it?";
      if (b) b.disabled = n > 0;
      n--;
      if (n < -1) clearInterval(otpTimer);
    };
    tick();
    otpTimer = setInterval(tick, 1000);
  }

  function startOtp(ctx: 'register' | 'reset', destination: string, isEmail = false): void {
    otpCtx = ctx;
    ins.forEach((i) => (i.value = ''));
    syncOtp();
    boxes?.classList.remove('good');
    boxes?.classList.remove('bad');
    const otpErr = $('#otpErr');
    if (otpErr) otpErr.textContent = '';
    const otpTitle = $('#otpTitle');
    const otpTo = $('#otpTo');
    if (otpTitle) {
      if (ctx === 'register') {
        otpTitle.textContent = isEmail ? 'Verify your email' : 'Verify your number';
      } else {
        otpTitle.textContent = 'Enter verification code';
      }
    }
    if (otpTo) otpTo.textContent = destination;
    startTimer();
    go('otp');
    setTimeout(() => ins[0]?.focus({ preventScroll: true }), 580);
  }

  const otpResend = $('#otpResend');
  if (otpResend) {
    otpResend.onclick = async () => {
      ins.forEach((i) => (i.value = ''));
      syncOtp();

      if (otpCtx === 'register' && pendingReg) {
        try {
          await resendRegistrationOtp({
            username: pendingReg.username,
            email: pendingReg.email,
            mobileNumber: pendingReg.mobileNumber,
            countryCode: pendingReg.countryCode,
          });
          startTimer();
          toast('A new code is on its way.');
        } catch (err: unknown) {
          const msg = (err as { message?: string })?.message || 'Failed to resend code.';
          toast(msg);
        }
      } else if (otpCtx === 'reset' && pendingReset) {
        try {
          await resendResetPasswordSms({
            username: pendingReset.username,
            mobileNumber: pendingReset.mobileNumber,
          });
          startTimer();
          toast('A new code is on its way.');
        } catch (err: unknown) {
          const msg = (err as { message?: string })?.message || 'Failed to resend code.';
          toast(msg);
        }
      } else {
        startTimer();
        toast('A new code is on its way.');
      }
      ins[0]?.focus();
    };
  }

  let verifying = false;
  async function verifyOtp(): Promise<void> {
    if (verifying || code().length !== 6) return;

    // Validate 6-digit OTP code with Zod schema
    const otpRes = validateField(otpInputSchema, code());
    if (!otpRes.ok) {
      boxes?.classList.remove('bad');
      void boxes?.offsetWidth;
      boxes?.classList.add('bad');
      const otpErr = $('#otpErr');
      if (otpErr) otpErr.textContent = otpRes.error || 'Invalid code.';
      setTimeout(() => {
        ins.forEach((i) => (i.value = ''));
        ins.forEach((i) => i.classList.remove('fill'));
        ins[0]?.focus();
        const otpGo = $<HTMLButtonElement>('#otpGo');
        if (otpGo) otpGo.disabled = true;
      }, 450);
      return;
    }

    verifying = true;
    const b = $<HTMLButtonElement>('#otpGo')!;
    const origHtml = b.innerHTML;
    b.disabled = true;
    b.innerHTML = '<span class="spin"></span>';

    if (otpCtx === 'register') {
      if (!pendingReg) {
        verifying = false;
        b.disabled = false;
        b.innerHTML = origHtml;
        toast('Registration details missing, please try again.');
        go('register');
        return;
      }

      try {
        const result = await verifyRegistration({
          username: pendingReg.username,
          otp: code(),
          email: pendingReg.email,
          mobileNumber: pendingReg.mobileNumber,
          countryCode: pendingReg.countryCode,
          countryId: pendingReg.countryId,
          referer: pendingReg.referer,
        });

        // Store login session
        setToken(result.token);
        useAppStore.getState().setRole('kid');
        if (result.user.username) {
          useAppStore.getState().setMeName(result.user.username);
        }

        boxes?.classList.add('good');
        await wait(350);

        finish(
          'Account created!',
          `Welcome to Ri9, <b>${esc(result.user.username || pendingReg.username)}</b> — your account is verified!`,
          () => navigatePostAuth(),
          'Get started',
        );
      } catch (err: unknown) {
        boxes?.classList.remove('bad');
        void boxes?.offsetWidth;
        boxes?.classList.add('bad');
        const otpErr = $('#otpErr');
        const errMsg = (err as { message?: string })?.message || 'Invalid or expired code.';
        if (otpErr) otpErr.textContent = errMsg;
        toast(errMsg);
        setTimeout(() => {
          ins.forEach((i) => (i.value = ''));
          ins.forEach((i) => i.classList.remove('fill'));
          ins[0]?.focus();
          b.disabled = true;
        }, 450);
      } finally {
        verifying = false;
        b.innerHTML = origHtml;
      }
    } else {
      if (!pendingReset) {
        verifying = false;
        b.disabled = false;
        b.innerHTML = origHtml;
        toast('Reset session expired. Please request OTP again.');
        go('forgot');
        return;
      }

      try {
        const resetToken = await verifyResetPasswordSms({
          username: pendingReset.username,
          mobileNumber: pendingReset.mobileNumber,
          otp: code(),
        });

        pendingReset.resetToken = resetToken;
        boxes?.classList.add('good');
        await wait(350);

        const rsForm = $<HTMLFormElement>('#rsForm');
        rsForm?.reset();
        paintRules('');
        go('reset');
      } catch (err: unknown) {
        boxes?.classList.remove('bad');
        void boxes?.offsetWidth;
        boxes?.classList.add('bad');
        const otpErr = $('#otpErr');
        const errMsg = (err as { message?: string })?.message || 'Invalid or expired code.';
        if (otpErr) otpErr.textContent = errMsg;
        toast(errMsg);
        setTimeout(() => {
          ins.forEach((i) => (i.value = ''));
          ins.forEach((i) => i.classList.remove('fill'));
          ins[0]?.focus();
          b.disabled = true;
        }, 450);
      } finally {
        verifying = false;
        b.innerHTML = origHtml;
      }
    }
  }

  $('#otpForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    void verifyOtp();
  });

  /* ---------- RESET PASSWORD ---------- */
  const rs = $<HTMLFormElement>('#rsForm');
  const RULES: Record<string, (p: string) => boolean> = {
    len: (p) => p.length >= 8,
    mix: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p),
    num: (p) => /\d/.test(p),
  };

  function paintRules(p: string): void {
    $$('#rsRules li').forEach((li) => {
      const rKey = (li as HTMLElement).dataset.r;
      if (rKey && RULES[rKey]) {
        li.classList.toggle('ok', RULES[rKey](p));
      }
    });
  }

  $('#rsPass')?.addEventListener('input', (e) => paintRules((e.target as HTMLInputElement).value));

  rs?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = $<HTMLInputElement>('#rsPass')!.value;
    const c = $<HTMLInputElement>('#rsConfirm')!.value;
    let first: HTMLElement | null = null;

    const pRes = validateField(passwordCreationSchema, p);
    if (!pRes.ok) {
      setErr(F(rs, 'pass'), pRes.error);
      first = $('#rsPass');
    } else {
      setErr(F(rs, 'pass'), '');
    }

    if (!c) {
      setErr(F(rs, 'confirm'), 'Re-enter your new password.');
      first = first || $('#rsConfirm');
    } else if (c !== p) {
      setErr(F(rs, 'confirm'), "Passwords don't match.");
      first = first || $('#rsConfirm');
    } else {
      setErr(F(rs, 'confirm'), '');
    }

    if (first) {
      first.focus();
      return;
    }

    if (!pendingReset?.resetToken) {
      toast('Session expired. Please request OTP again.');
      go('forgot');
      return;
    }

    const rsBtn = $<HTMLButtonElement>('#rsGo')!;
    const origHtml = rsBtn.innerHTML;
    rsBtn.disabled = true;
    rsBtn.innerHTML = '<span class="spin"></span>';

    try {
      await resetPasswordSms({
        resetToken: pendingReset.resetToken,
        password: p,
        passwordConfirmation: c,
      });

      pendingReset = null;
      finish('Password updated', 'Your password has been changed. Use your new password to log in.');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to update password. Please try again.';
      setErr(F(rs, 'pass'), msg);
      toast(msg);
    } finally {
      rsBtn.disabled = false;
      rsBtn.innerHTML = origHtml;
    }
  });

  /* ---------- done ---------- */
  const esc = (s: string): string =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

  function finish(title: string, sub: string, onAction?: () => void, actionText = 'Continue'): void {
    const doneTitle = $('#doneTitle');
    const doneSub = $('#doneSub');
    const doneGo = $<HTMLButtonElement>('#doneGo');
    if (doneTitle) doneTitle.textContent = title;
    if (doneSub) doneSub.innerHTML = sub;
    if (doneGo) {
      doneGo.textContent = actionText;
      if (onAction) {
        doneGo.onclick = onAction;
      } else {
        doneGo.onclick = home;
      }
    }

    const d = $('#done');
    d?.querySelectorAll<HTMLElement>('.ring, .ring svg').forEach((n) => {
      n.style.animation = 'none';
      void n.offsetWidth;
      n.style.animation = '';
    });
    go('done');
  }
}
