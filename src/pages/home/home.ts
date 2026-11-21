/* ============================================================
   RI9 · HOME SCREEN entry (kid dashboard).
   Order: guard → page logic → store bridge.
   The markup lives in the root index.html (unchanged from the
   prototype); home.css is loaded via <link> in its <head>
   (before first paint — avoids any unstyled flash); this
   module adds behavior only.
   ============================================================ */
import { boot } from '../../router';
import { mount } from './home.behavior';
import { useAppStore } from '../../store/app';

// Guard is a no-op for now; when auth lands, lock it down:
// boot({ page: 'home', roles: ['kid'] })
boot({ page: 'home' });

// OTA (native only — no-op in browser/dev)
import { initOta } from '../../ota';
initOta();

// Run the exact prototype logic (SFX engine, carousel, goal rings, dock nav)
mount();

/* ---------- bridge: page SFX toggle ↔ persisted Zustand store ----------
   The prototype exposes its SFX engine as window.SFX. Keep the global
   store (riverpod-style single source of truth) in sync in both
   directions without touching the page's UI code. */
type SfxEngine = { on: boolean; set(v: boolean): void };
const SFX = (window as unknown as { SFX?: SfxEngine }).SFX;

if (SFX) {
  const { sfxOn, setSfxOn } = useAppStore.getState();

  // hydrate engine from store (e.g. changed on another page)
  if (SFX.on !== sfxOn) SFX.set(sfxOn);

  // wrap the engine's setter so page toggles update the store
  const origSet = SFX.set.bind(SFX);
  SFX.set = (v: boolean) => {
    origSet(v);
    useAppStore.getState().setSfxOn(v);
  };
}
