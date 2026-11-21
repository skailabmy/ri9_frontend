/* ============================================================
   RI9 · STATS SCREEN entry (kid statistics).
   The markup lives in the root stats.html; stats.css is loaded
   via <link> in its <head> (before first paint); this module
   adds behavior only (stats.behavior.js).

   UI only for now — the screen renders the reference prototype's
   mock data (same seeded rng numbers as references/index.html).
   Real stats endpoints (accuracy, averages, weekly activity)
   don't exist in the backend yet; stats.behavior.js marks the
   swap points when they land.
   ============================================================ */
import { boot } from '../../router';
import { mount } from './stats.behavior';

// Guard is a no-op for now; when auth lands, lock it down:
// boot({ page: 'stats', roles: ['kid'] })
boot({ page: 'stats' });

mount();
