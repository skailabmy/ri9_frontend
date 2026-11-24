/* ============================================================
   RI9 · Router — the go_router-equivalent layer.
   This app is a Vite multi-page app (one HTML document per
   portal) because each page is a full, self-contained design
   with its own document-level CSS. Navigation between pages is
   real navigation, which:
     - keeps every page's CSS/JS isolated (zero UI regressions)
     - makes the Android/iOS hardware back button work for free
     - lets each page keep its own listeners without leaks

   Guards mirror go_router's `redirect`: each page declares the
   roles it accepts in boot(); unauthorized visits are bounced
   to the kid home page before any UI mounts.
   ============================================================ */
import { useAppStore, type Role } from './store/app';
import { getToken } from './api/storage';

export type PageId = 'home' | 'profile' | 'stats' | 'challenge' | 'onboarding' | 'auth' | 'school' | 'parent';

/** Canonical paths for programmatic navigation (like go_router's NamedRoutes) */
export const routes = {
  home: 'index.html',
  profile: 'profile.html',
  stats: 'stats.html',
  challenge: 'challenge.html',
  onboarding: 'onboarding.html',
  auth: 'auth.html',
  school: 'school.html',
  parent: 'parent.html',
} as const;

/** Pages accessible without being logged in */
const PUBLIC_PAGES: readonly PageId[] = ['auth', 'onboarding'] as const;

interface BootOptions {
  /** Which page is booting */
  page: PageId;
  /** Roles allowed on this page — omit while auth isn't wired up yet.
      e.g. boot({ page: 'school', roles: ['school'] }) */
  roles?: Role[];
}

/** go_router-style guard + page bootstrap. Called before mount() on every page. */
export function boot({ page, roles }: BootOptions): void {
  const token = getToken();

  // 1. Auth guard: if not authenticated and trying to access a protected page, bounce to auth
  if (!token && !PUBLIC_PAGES.includes(page)) {
    location.replace(routes.auth);
    return;
  }

  // 2. Guest-only guard: if authenticated and on auth page, bounce to home
  if (token && page === 'auth') {
    const forceAuth = /[?&#]auth\b/.test(location.search + location.hash);
    if (!forceAuth) {
      location.replace(routes.home);
      return;
    }
  }

  // 3. Role guard
  const { role } = useAppStore.getState();
  if (roles?.length && (!role || !roles.includes(role))) {
    location.replace(routes.home);
    return;
  }

  // Expose the current page for CSS hooks and analytics later
  document.documentElement.dataset.page = page;
}

/** Programmatic navigation (like context.go('/parent')) */
export function go(target: PageId): void {
  location.href = routes[target];
}
