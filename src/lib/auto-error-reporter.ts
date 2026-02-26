/**
 * Auto Error Reporter — Catches runtime errors and sends them to the database
 * WITHOUT requiring any user interaction.
 *
 * SCALE-READY: Batches errors and flushes every 5s (or on unload) instead of
 * writing each error individually. 100 users × 10 errors/min = 1 batch insert
 * per user per 5s instead of 10 individual writes per user per minute.
 *
 * What it catches:
 *  1. Unhandled promise rejections (e.g., failed fetch, edge function errors)
 *  2. Uncaught JavaScript errors (e.g., TypeError, ReferenceError)
 *  3. Edge function invocation failures (via supabase.functions.invoke wrapper)
 *  4. React ErrorBoundary crashes (via explicit reportError() calls)
 *  5. Console.error intercepts (catches try/catch'd errors that show toasts)
 *  6. Failed HTTP fetches to Supabase endpoints
 *
 * Rate limiting:
 *  - Max 10 errors per 60-second window per session
 *  - Fingerprint-based dedup (source + first 100 chars of message)
 *  - Batch flushes every 5 seconds to reduce DB writes
 *
 * IMPORTANT: Uses raw fetch() to PostgREST — NOT the supabase JS client.
 * The supabase client's auth state can silently block inserts via RLS.
 */

import { supabase } from '@/integrations/sb_client/client';

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SB_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Skip during tests — vitest sets import.meta.env.MODE = 'test' or TEST = true
const IS_TEST = import.meta.env.MODE === 'test' || import.meta.env.VITEST;

// Edge functions called fire-and-forget (already .catch'd by callers) — skip reporting
const FIRE_AND_FORGET_FUNCTIONS = new Set(['notify-commission']);
// Edge functions replaced by RPCs — skip stale in-flight errors
const DEPRECATED_FUNCTIONS = new Set(['invite-user']);

// Save the REAL fetch before any interceptors wrap it.
// sendErrorToDb MUST use this to avoid infinite loops with the fetch interceptor.
const _rawFetch = window.fetch.bind(window);

interface ErrorEntry {
  message: string;
  source: string;
  page: string;
  stack?: string;
  extra?: Record<string, unknown>;
  timestamp: string;
}

// ── Rate limiting ──────────────────────────────────────────────────
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const recentFingerprints = new Set<string>();
let reportedInWindow = 0;
let windowStart = Date.now();

function resetWindowIfNeeded() {
  if (Date.now() - windowStart > WINDOW_MS) {
    recentFingerprints.clear();
    reportedInWindow = 0;
    windowStart = Date.now();
  }
}

/** Fingerprint = source + first 100 chars of message (groups similar errors) */
function fingerprint(entry: ErrorEntry): string {
  return entry.source + ':' + entry.message.slice(0, 100);
}

// ── Batch queue ────────────────────────────────────────────────────
const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 20;
let queue: ErrorEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Try to get a JWT from localStorage (supabase stores session there). */
function getSessionToken(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed?.access_token || null;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

/** Flush the queued errors to the database in one batch insert */
async function flushQueue() {
  if (queue.length === 0) return;

  const batch = queue.splice(0, MAX_BATCH_SIZE);
  const jwt = getSessionToken() || SB_ANON_KEY;

  const rows = batch.map((entry) => ({
    description: `[AUTO] ${entry.source}: ${entry.message}`.slice(0, 500),
    page_url: entry.page,
    user_agent: navigator.userAgent,
    status: 'open',
    console_errors: JSON.stringify({
      source: entry.source,
      stack: entry.stack?.slice(0, 2000),
      extra: entry.extra || {},
      timestamp: entry.timestamp,
    }),
  }));

  // PostgREST accepts array body for batch inserts
  try {
    const resp = await _rawFetch(`${SB_URL}/rest/v1/bug_reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_ANON_KEY,
        'Authorization': `Bearer ${jwt}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!resp.ok) {
      console.warn('[AutoErrorReporter] Batch insert failed:', resp.status);
      // Fallback: try audit_log with individual entries
      for (const entry of batch) {
        try {
          await _rawFetch(`${SB_URL}/rest/v1/audit_log`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SB_ANON_KEY,
              'Authorization': `Bearer ${jwt}`,
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              action: 'auto_error',
              table_name: 'app',
              record_id: crypto.randomUUID(),
              new_data: {
                message: entry.message,
                source: entry.source,
                page: entry.page,
                stack: entry.stack?.slice(0, 2000),
                extra: entry.extra || {},
                user_agent: navigator.userAgent,
                timestamp: entry.timestamp,
              },
            }),
          });
        } catch { /* best effort */ }
      }
    }
  } catch (e) {
    console.warn('[AutoErrorReporter] Batch flush failed:', e);
  }
}

/** Queue an error for batched writing */
function queueError(entry: ErrorEntry) {
  if (IS_TEST) return; // Never write to DB during tests

  resetWindowIfNeeded();

  const fp = fingerprint(entry);
  if (recentFingerprints.has(fp)) return;
  if (reportedInWindow >= MAX_PER_WINDOW) return;

  recentFingerprints.add(fp);
  reportedInWindow++;
  queue.push(entry);

  // Flush immediately if batch is full
  if (queue.length >= MAX_BATCH_SIZE) {
    flushQueue();
  }
}

/**
 * Call this once at app startup (main.tsx) to install global error listeners.
 */
export function installAutoErrorReporter() {
  if (IS_TEST) return; // Skip entirely in test environment

  // Start the flush timer
  if (!flushTimer) {
    flushTimer = setInterval(flushQueue, FLUSH_INTERVAL_MS);
  }

  // Flush on page unload (uses sendBeacon for reliability)
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushQueue();
    }
  });
  window.addEventListener('beforeunload', () => {
    if (queue.length > 0) {
      const jwt = getSessionToken() || SB_ANON_KEY;
      const rows = queue.splice(0).map((entry) => ({
        description: `[AUTO] ${entry.source}: ${entry.message}`.slice(0, 500),
        page_url: entry.page,
        user_agent: navigator.userAgent,
        status: 'open',
        console_errors: JSON.stringify({
          source: entry.source,
          stack: entry.stack?.slice(0, 2000),
          extra: entry.extra || {},
          timestamp: entry.timestamp,
        }),
      }));
      // sendBeacon is more reliable on unload than fetch
      const blob = new Blob([JSON.stringify(rows)], { type: 'application/json' });
      navigator.sendBeacon(
        `${SB_URL}/rest/v1/bug_reports?apikey=${SB_ANON_KEY}`,
        blob,
      );
    }
  });

  // 0. Wrap supabase.functions.invoke to auto-capture edge function errors
  const origInvoke = supabase.functions.invoke.bind(supabase.functions);
  (supabase.functions as any).invoke = async (functionName: string, options?: any) => {
    try {
      const result = await origInvoke(functionName, options);
      if (result.error) {
        if (!FIRE_AND_FORGET_FUNCTIONS.has(functionName) && !DEPRECATED_FUNCTIONS.has(functionName)) {
          queueError({
            message: `Edge function '${functionName}' failed: ${result.error.message || JSON.stringify(result.error)}`,
            source: 'edge_function',
            page: window.location.hash || '/',
            stack: result.error instanceof Error ? result.error.stack : undefined,
            extra: { functionName, context: result.error.context },
            timestamp: new Date().toISOString(),
          });
        }
      }
      return result;
    } catch (err: any) {
      throw err;
    }
  };

  // 0b. Intercept console.error
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    origConsoleError.apply(console, args);
    try {
      const msg = args
        .map((a) => {
          if (typeof a === 'string') return a;
          if (a instanceof Error) return a.message;
          try { return JSON.stringify(a); } catch { return String(a); }
        })
        .join(' ')
        .slice(0, 500);
      if (msg.includes('[AutoErrorReporter]')) return;
      if (msg.includes('Warning:') && msg.includes('React')) return;
      if (msg.includes('Download the React DevTools')) return;
      queueError({
        message: msg,
        source: 'console_error',
        page: window.location.hash || '/',
        timestamp: new Date().toISOString(),
      });
    } catch { /* never throw from here */ }
  };

  // 0c. Intercept global fetch()
  const origFetch = window.fetch;
  window.fetch = async (...fetchArgs: Parameters<typeof fetch>) => {
    try {
      const resp = await origFetch(...fetchArgs);
      if (!resp.ok) {
        const url = typeof fetchArgs[0] === 'string' ? fetchArgs[0] : fetchArgs[0] instanceof Request ? fetchArgs[0].url : String(fetchArgs[0]);
        if (url.includes('supabase') || url.includes('functions/v1')) {
          const fnMatch = url.match(/functions\/v1\/([^?/]+)/);
          const fnName = fnMatch?.[1] || '';
          if (FIRE_AND_FORGET_FUNCTIONS.has(fnName) || DEPRECATED_FUNCTIONS.has(fnName)) {
            return resp;
          }
          if (resp.status === 409 && url.includes('payment_email_queue')) {
            return resp;
          }
          const bodyText = await resp.clone().text().catch(() => '');
          queueError({
            message: `HTTP ${resp.status} ${resp.statusText}: ${url.split('?')[0]}`.slice(0, 300),
            source: 'fetch_error',
            page: window.location.hash || '/',
            extra: { url: url.split('?')[0], status: resp.status, body: bodyText.slice(0, 500) },
            timestamp: new Date().toISOString(),
          });
        }
      }
      return resp;
    } catch (err) {
      throw err;
    }
  };

  // 1. Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : JSON.stringify(reason);

    if (message.includes('AbortError') || message.includes('The user aborted')) return;
    if (message.includes('ResizeObserver')) return;

    queueError({
      message,
      source: 'unhandled_rejection',
      page: window.location.hash || '/',
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: new Date().toISOString(),
    });
  });

  // 1b. Self-test ping (once per browser session)
  if (!sessionStorage.getItem('auto-error-reporter-pinged')) {
    sessionStorage.setItem('auto-error-reporter-pinged', '1');
    queueError({
      message: 'AutoErrorReporter installed successfully — this is a self-test ping',
      source: 'self_test',
      page: window.location.hash || '/',
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Uncaught JavaScript errors
  window.addEventListener('error', (event) => {
    if (event.message === 'Script error.' && !event.filename) return;
    if (event.message?.includes('ResizeObserver')) return;

    queueError({
      message: event.message,
      source: 'uncaught_error',
      page: window.location.hash || '/',
      stack: event.error?.stack,
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      timestamp: new Date().toISOString(),
    });
  });
}

/**
 * Call this from ErrorBoundary.componentDidCatch to report React crashes.
 */
export function reportBoundaryError(error: Error, componentStack?: string) {
  queueError({
    message: error.message,
    source: 'react_boundary',
    page: window.location.hash || '/',
    stack: error.stack,
    extra: { componentStack: componentStack?.slice(0, 1000) },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Call this when a supabase.functions.invoke() call fails.
 */
export function reportEdgeFunctionError(functionName: string, error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : JSON.stringify(error);

  queueError({
    message: `Edge function '${functionName}' failed: ${message}`,
    source: 'edge_function',
    page: window.location.hash || '/',
    stack: error instanceof Error ? error.stack : undefined,
    extra: { functionName },
    timestamp: new Date().toISOString(),
  });
}
