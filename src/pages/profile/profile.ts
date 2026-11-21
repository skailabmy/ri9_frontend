/* ============================================================
   RI9 · PROFILE SCREEN entry (kid profile).
   The markup lives in the root profile.html; profile.css is
   loaded via <link> in its <head> (before first paint); this
   module adds behavior only (profile.behavior.js).

   Navigation here mirrors the router's multi-page model:
   "back" and "log out" redirect to index.html (the dashboard).
   ============================================================ */
import { boot } from '../../router';
import { mount } from './profile.behavior';

// Guard is a no-op for now; when auth lands, lock it down:
// boot({ page: 'profile', roles: ['kid'] })
boot({ page: 'profile' });

mount();
