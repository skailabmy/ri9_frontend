/* ============================================================
   RI9 · API logger — logs every endpoint call that goes
   through the api() client: method, path, status and duration.

   Logs go to the console. On native builds (Capacitor) console
   output is visible in Xcode / Android Logcat; on web it shows
   in DevTools. Set VITE_API_LOG_LEVEL=off (or 'silent') to
   disable, or 'debug' to also log request/response bodies.
   ============================================================ */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'off';

const LOG_LEVEL: LogLevel = (() => {
  const raw = (import.meta.env.VITE_API_LOG_LEVEL ?? 'info').toLowerCase();
  return (['debug', 'info', 'warn', 'error', 'off'] as const).includes(raw as LogLevel)
    ? (raw as LogLevel)
    : 'info';
})();

const LEVEL_ORDER: Record<Exclude<LogLevel, 'off'>, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const enabled = (level: Exclude<LogLevel, 'off'>): boolean =>
  LOG_LEVEL !== 'off' && LEVEL_ORDER[level] >= LEVEL_ORDER[LOG_LEVEL];

export interface ApiLogEntry {
  method: string;
  url: string;
  status: number | 'network-error';
  durationMs: number;
  timestamp: string;
  /** Present when level is 'debug' */
  requestBody?: unknown;
  /** Present when level is 'debug' */
  responseBody?: unknown;
}

const PREFIX = '[RI9 API]';

/** Formatted console line for a completed request. */
export function logRequest(entry: ApiLogEntry): void {
  if (!enabled('info')) return;

  const { method, url, status, durationMs } = entry;
  const line = `${PREFIX} ${method} ${url} → ${status} (${durationMs}ms)`;

  if (status === 'network-error' || (typeof status === 'number' && status >= 500)) {
    console.error(line);
  } else if (typeof status === 'number' && status >= 400) {
    console.warn(line);
  } else {
    console.info(line);
  }

  if (enabled('debug')) {
    if (entry.requestBody !== undefined) {
      console.debug(`${PREFIX} ${method} ${url} request body:`, entry.requestBody);
    }
    if (entry.responseBody !== undefined) {
      console.debug(`${PREFIX} ${method} ${url} response body:`, entry.responseBody);
    }
  }
}

/** Log a request-level error before a response exists (timeout / network). */
export function logRequestError(method: string, url: string, error: unknown): void {
  if (!enabled('error')) return;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${PREFIX} ${method} ${url} ✕ failed: ${message}`);
}

/** Persist a log entry to an in-memory ring buffer (last 200 calls). */
const history: ApiLogEntry[] = [];
const MAX_HISTORY = 200;

export function record(entry: ApiLogEntry): void {
  history.push(entry);
  if (history.length > MAX_HISTORY) history.shift();
}

/** Get a copy of the recent API call history (useful for on-screen debugging). */
export function getApiLog(): readonly ApiLogEntry[] {
  return [...history];
}

/** Clear the in-memory log history. */
export function clearApiLog(): void {
  history.length = 0;
}
