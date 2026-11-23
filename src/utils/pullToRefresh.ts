/* ============================================================
   RI9 · Pull-to-refresh — shared gesture for every HTML page
   that calls APIs (home, profile, and future screens).

   Usage (from a page entry module or behavior module):

     import { mountPullToRefresh } from '../../utils/pullToRefresh';
     mountPullToRefresh({
       refresh: async () => { await refetchEverything(); },
       scroller: () => document.querySelector('.pf-body'),   // optional
       disabled: () => modalIsOpen(),                        // optional
     });

   How it works:
   - Touch-only (the app runs in the Capacitor WebView and on
     phones — desktop pointer "pulls" are not a thing).
   - The gesture arms when a single touch starts while the
     scroller is at scrollTop 0; a downward-dominant drag then
     stretches a damped indicator pill at the top of the screen.
   - Past `threshold` the arrow flips + haptic fires; releasing
     then shows a spinner and awaits refresh() (≥ 400ms so the
     spinner never flashes), before sliding back out.
   - Self-contained: styles are injected on first mount, so
     pages need zero CSS changes.
   ============================================================ */

export interface PullToRefreshOptions {
  /** Re-fetch + re-paint the page's API data. Errors are the
      caller's to surface (page toast), not this module's. */
  refresh: () => Promise<void> | void;
  /** The element whose scrollTop defines "at the top".
      Defaults to the document scrolling element. Profile uses
      its inner .pf-body scroll container; home uses the default
      (the page never scrolls, so it is always at 0). */
  scroller?: () => Element | null | undefined;
  /** Extra opt-out checked on every gesture start (open modals,
      in-flight saves, …). */
  disabled?: () => boolean;
  /** Pull distance (px) that arms the refresh. Default 72. */
  threshold?: number;
  /** Maximum visual travel of the indicator (px). Default 110. */
  maxPull?: number;
}

/** Inject the indicator styles once per document. */
function ensureStyles(): void {
  if (document.getElementById('ri9-ptr-style')) return;
  const st = document.createElement('style');
  st.id = 'ri9-ptr-style';
  st.textContent = `
.ri9-ptr{position:fixed;top:0;left:50%;width:34px;height:34px;margin-top:10px;
  border-radius:50%;background:#1b1c19;display:flex;align-items:center;justify-content:center;
  opacity:0;pointer-events:none;z-index:9998;box-shadow:0 2px 12px rgba(27,28,25,.28);
  transition:opacity .18s ease;will-change:transform}
.ri9-ptr svg{width:18px;height:18px;fill:none;stroke:#c6f432;stroke-width:2.4;
  stroke-linecap:round;stroke-linejoin:round;transition:transform .18s ease}
.ri9-ptr.armed svg{transform:rotate(180deg)}
.ri9-ptr.busy svg{animation:ri9PtrSpin .8s linear infinite}
@keyframes ri9PtrSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){
  .ri9-ptr,.ri9-ptr svg{transition:none}
  .ri9-ptr.busy svg{animation-duration:1.6s}
}`;
  document.head.appendChild(st);
}

export function mountPullToRefresh(opts: PullToRefreshOptions): { destroy(): void } {
  const threshold = opts.threshold ?? 72;
  const maxPull = opts.maxPull ?? 110;

  ensureStyles();

  const el = document.createElement('div');
  el.className = 'ri9-ptr';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>';
  document.body.appendChild(el);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const atTop = (): boolean => {
    const s = opts.scroller?.() ?? document.scrollingElement;
    return !s || s.scrollTop <= 0;
  };

  const setOffset = (px: number): void => {
    el.style.transform = `translate(-50%, ${px.toFixed(1)}px)`;
  };

  const haptic = (): void => {
    try { navigator.vibrate?.(12); } catch { /* unsupported */ }
  };

  let startX = 0;
  let startY = 0;
  let armed = false;   // touch began while at top — candidate gesture
  let pulling = false; // downward-dominant drag confirmed — indicator live
  let triggered = false;
  let busy = false;    // refresh in flight

  function reset(keepBusy = false): void {
    if (!keepBusy) {
      busy = false;
      el.classList.remove('busy');
    }
    el.classList.remove('pulling', 'armed');
    setOffset(0);
    el.style.opacity = '';
    armed = false;
    pulling = false;
    triggered = false;
  }

  function onStart(e: TouchEvent): void {
    if (busy || e.touches.length !== 1) return;
    if (opts.disabled?.()) return;
    if (!atTop()) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    armed = true;
  }

  function onMove(e: TouchEvent): void {
    if (!armed || busy) return;
    if (e.touches.length !== 1) { reset(); return; }

    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;

    if (!pulling) {
      // wait for clear downward intent — lets horizontal swipes
      // (home's subject carousel) pass through untouched
      if (dy <= 8) return;
      if (Math.abs(dx) > Math.abs(dy)) { armed = false; return; }
      pulling = true;
      el.classList.add('pulling');
    }

    // damped travel — the last few pixels get progressively harder
    const d = dy - 8;
    const off = maxPull * (1 - 1 / (d / (maxPull * 1.6) + 1));
    setOffset(off);

    const now = off >= threshold;
    if (now !== triggered) {
      triggered = now;
      el.classList.toggle('armed', now);
      if (now) haptic();
    }

    // keep the WebView from rubber-banding while we own the gesture
    if (atTop()) e.preventDefault();
  }

  async function onEnd(): Promise<void> {
    if (!armed) return;
    if (!pulling || busy) { reset(); return; }
    armed = false;
    pulling = false;

    if (!triggered) { reset(); return; }

    busy = true;
    triggered = false;
    el.classList.remove('pulling', 'armed');
    el.classList.add('busy');
    // snap the pill to its resting refresh position
    setOffset(threshold * 0.6);
    try {
      const started = Date.now();
      await opts.refresh();
      // hold the spinner long enough to read (min 400ms)
      const left = 400 - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
    } finally {
      reset();
    }
  }

  const onTouchEnd = (): void => { void onEnd(); };
  const onTouchCancel = (): void => { reset(); };

  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchCancel, { passive: true });

  return {
    destroy(): void {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
      el.remove();
    },
  };
}
