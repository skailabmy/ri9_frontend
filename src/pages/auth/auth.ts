/* ============================================================
   RI9 · AUTH PAGE ENTRY
   Bootstraps the auth screens, sheets, and login flow.
   ============================================================ */
import { boot } from '../../router';
import { mountAuth } from './auth.behavior';
import { getToken } from '../../api/auth';
import { routes } from '../../router';

// Early redirect if already logged in unless forced via query
const forceAuth = /[?&#]auth\b/.test(location.search + location.hash);
if (!forceAuth && getToken()) {
  location.replace(routes.home);
} else {
  boot({ page: 'auth' });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mountAuth();
    });
  } else {
    mountAuth();
  }
}
