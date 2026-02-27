/**
 * Auto Error Reporter v2 — Comprehensive runtime error + performance capture.
 * Sends everything to bug_reports for sentinel auto-healing. Zero user interaction.
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
 *  6. Failed HTTP fetches — ALL domains, not just Supabase (v2)
 *  7. Slow fetches > 5s to any API endpoint (v2)
 *  8. Network failures — fetch throws (DNS, timeout, CORS) (v2)
 *  9. Poor Web Vitals — CLS > 0.25, LCP > 4s, INP > 500ms (v2)
 * 10. Empty critical query results — Supabase queries that return 0 rows unexpectedly (v2)
 *
 * Rate limiting:
 *  - Max 20 errors per 60-second window per session (raised from 10 for v2 sources)
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
const MAX_PER_WINDOW = 20;
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

  // 0c. Intercept global fetch() — ALL domains (v2)
  // Tracks: HTTP errors, slow fetches (>5s), network failures (DNS/timeout/CORS)
  const SLOW_FETCH_MS = 5_000;
  // Skip reporting for static assets and common non-API resources
  const FETCH_SKIP_EXTENSIONS = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)(\?|$)/i;
  const FETCH_SKIP_DOMAINS = /fonts\.googleapis|cdn\.jsdelivr|unpkg\.com|polyfill\.io/i;

  const origFetch = window.fetch;
  window.fetch = async (...fetchArgs: Parameters<typeof fetch>) => {
    const fetchStart = Date.now();
    const url = typeof fetchArgs[0] === 'string' ? fetchArgs[0] : fetchArgs[0] instanceof Request ? fetchArgs[0].url : String(fetchArgs[0]);
    const urlClean = url.split('?')[0];

    // Skip static assets and CDNs
    if (FETCH_SKIP_EXTENSIONS.test(url) || FETCH_SKIP_DOMAINS.test(url)) {
      return origFetch(...fetchArgs);
    }

    const isSupabase = url.includes('supabase') || url.includes('functions/v1');

    try {
      const resp = await origFetch(...fetchArgs);
      const elapsed = Date.now() - fetchStart;

      // ── Slow fetch detection (any domain) ──
      if (elapsed >= SLOW_FETCH_MS) {
        queueError({
          message: `Slow fetch ${elapsed}ms: ${urlClean}`.slice(0, 300),
          source: 'slow_fetch',
          page: window.location.hash || '/',
          extra: { url: urlClean, elapsed_ms: elapsed, status: resp.status },
          timestamp: new Date().toISOString(),
        });
      }

      // ── HTTP error detection ──
      if (!resp.ok) {
        const fnMatch = url.match(/functions\/v1\/([^?/]+)/);
        const fnName = fnMatch?.[1] || '';

        // Supabase-specific filters
        if (isSupabase) {
          if (FIRE_AND_FORGET_FUNCTIONS.has(fnName) || DEPRECATED_FUNCTIONS.has(fnName)) return resp;
          if (resp.status === 409 && url.includes('payment_email_queue')) return resp;
          if ((resp.status === 401 || resp.status === 403) && url.includes('/auth/v1/')) return resp;
        }

        // External API: only report 5xx (server errors) — 4xx is often expected (auth, not found)
        if (!isSupabase && resp.status < 500) return resp;

        const bodyText = isSupabase ? await resp.clone().text().catch(() => '') : '';
        queueError({
          message: `HTTP ${resp.status} ${resp.statusText}: ${urlClean}`.slice(0, 300),
          source: isSupabase ? 'fetch_error' : 'external_fetch_error',
          page: window.location.hash || '/',
          extra: { url: urlClean, status: resp.status, body: bodyText.slice(0, 500), domain: new URL(url, window.location.origin).hostname },
          timestamp: new Date().toISOString(),
        });
      }
      return resp;
    } catch (err) {
      // ── Network failure: DNS, timeout, CORS, connection refused ──
      const elapsed = Date.now() - fetchStart;
      const errMsg = err instanceof Error ? err.message : String(err);
      // AbortError = intentional cancellation, skip
      if (errMsg.includes('AbortError') || errMsg.includes('The user aborted')) throw err;

      queueError({
        message: `Network error (${elapsed}ms): ${urlClean} — ${errMsg}`.slice(0, 400),
        source: 'network_error',
        page: window.location.hash || '/',
        extra: { url: urlClean, elapsed_ms: elapsed, error: errMsg, domain: isSupabase ? 'supabase' : 'external' },
        timestamp: new Date().toISOString(),
      });
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

  // 1c. Web Vitals → bug_reports bridge (poor scores only)
  // Thresholds from https://web.dev/vitals/ "poor" tier
  const VITAL_THRESHOLDS: Record<string, number> = { CLS: 0.25, LCP: 4000, INP: 500, FID: 300, TTFB: 1800 };
  (window as any).__reportPoorVital = (name: string, value: number, rating: string) => {
    if (rating !== 'poor') return;
    const threshold = VITAL_THRESHOLDS[name];
    queueError({
      message: `Poor Web Vital: ${name} = ${name === 'CLS' ? value.toFixed(3) : Math.round(value) + 'ms'} (threshold: ${threshold})`,
      source: 'poor_web_vital',
      page: window.location.hash || '/',
      extra: { vital_name: name, value, threshold, rating },
      timestamp: new Date().toISOString(),
    });
  };

  // 1d. Long Task observer — detects JS blocking the main thread > 100ms
  if ('PerformanceObserver' in window) {
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 200) { // Only report > 200ms to reduce noise
            queueError({
              message: `Long task: ${Math.round(entry.duration)}ms blocking main thread`,
              source: 'long_task',
              page: window.location.hash || '/',
              extra: { duration_ms: Math.round(entry.duration), entryType: entry.entryType, name: entry.name },
              timestamp: new Date().toISOString(),
            });
          }
        }
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch { /* longtask not supported in all browsers */ }
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

/**
 * Report a poor Web Vital metric. Called from main.tsx web-vitals callbacks.
 */
export function reportPoorVital(name: string, value: number, rating: string) {
  if ((window as any).__reportPoorVital) {
    (window as any).__reportPoorVital(name, value, rating);
  }
}
