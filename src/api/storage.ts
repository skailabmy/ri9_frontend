/* ============================================================
   RI9 · Storage helpers — the single access point for the
   WebView's localStorage.

   Notes:
   - localStorage persists across app restarts (sandboxed per app)
   - Treat it as a CACHE, not a source of truth: the backend is
     authoritative for quiz results, coins, streaks
   - If you later need native-backed storage (survives WebView
     data clears, readable from native SDKs), swap the internals
     for @capacitor/preferences — the call sites don't change.
   ============================================================ */

const KEYS = {
  token: 'ri9-token',
} as const;

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEYS.token);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(KEYS.token, token);
  } catch {
    /* storage full / private mode — auth will need re-login */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEYS.token);
  } catch {
    /* ignore */
  }
}
