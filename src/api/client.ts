/* ============================================================
   RI9 · API client — thin fetch wrapper for the backend.

   Usage:
     const subjects = await api<Subject[]>('/subjects');
     await api('/drills/submit', { method: 'POST', body: { ... } });

   All app/backend traffic goes through here so auth headers,
   error mapping and timeouts stay consistent.
   ============================================================ */
import { API_BASE_URL } from './config';
import { getToken } from './storage';
import { logRequest, logRequestError, record, type ApiLogEntry } from './logger';

export class ApiError extends Error {
  readonly status: number;
  /** Per-field validation errors from 422 responses
      (mirrors Flutter's UserProfileException.errors). */
  readonly errors?: Record<string, unknown>;
  /** Machine-readable error code from the body (e.g. invalid_otp). */
  readonly errorCode?: string;
  constructor(
    status: number,
    message: string,
    opts: { errors?: Record<string, unknown>; errorCode?: string } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = opts.errors;
    this.errorCode = opts.errorCode;
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Extra headers, merged over the defaults */
  headers?: Record<string, string>;
  /** Abort after this many ms (default 15s) */
  timeoutMs?: number;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, timeoutMs = 15_000 } = opts;

  const url = `${API_BASE_URL}${path}`;
  const startedAt = performance.now();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  /** Build the log entry and emit it (console + in-memory history). */
  const finish = (status: ApiLogEntry['status'], responseBody?: unknown) => {
    const entry: ApiLogEntry = {
      method,
      url,
      status,
      durationMs: Math.round(performance.now() - startedAt),
      timestamp: new Date().toISOString(),
      requestBody: body,
      responseBody,
    };
    record(entry);
    logRequest(entry);
  };

  try {
    const token = getToken();
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      let errors: Record<string, unknown> | undefined;
      let errorCode: string | undefined;
      try {
        const errBody = (await res.json()) as {
          message?: string;
          errors?: Record<string, unknown>;
          error_code?: string;
        };
        if (errBody?.message) message = errBody.message;
        if (errBody?.errors) errors = errBody.errors;
        if (errBody?.error_code) errorCode = errBody.error_code;
      } catch {
        /* non-JSON error body — keep default message */
      }
      finish(res.status, { message });
      throw new ApiError(res.status, message, { errors, errorCode });
    }

    const data = (await res.json()) as T;
    finish(res.status, data);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      logRequestError(method, url, 'Request timed out');
      throw new ApiError(0, 'Request timed out');
    }
    logRequestError(method, url, err);
    throw new ApiError(0, err instanceof Error ? err.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}
