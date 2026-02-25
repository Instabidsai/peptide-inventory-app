/**
 * Auto Error Reporter — Catches runtime errors and sends them to the database
 * WITHOUT requiring any user interaction.
 *
 * What it catches:
 *  1. Unhandled promise rejections (e.g., failed fetch, edge function errors)
 *  2. Uncaught JavaScript errors (e.g., TypeError, ReferenceError)
 *  3. Edge function invocation failures (via supabase.functions.invoke wrapper)
 *  4. React ErrorBoundary crashes (via explicit reportError() calls)
 *
 * How it works:
 *  - Listens for window 'error' and 'unhandledrejection' events
 *  - Debounces + deduplicates to avoid spamming the database
 *  - Writes to `bug_reports` table via raw fetch() (bypasses supabase client)
 *  - Auto-heal pipeline reads these entries and can fix the underlying code
 *
 * Rate limiting:
 *  - Max 10 errors per 60-second window per session
 *  - Identical errors (same message) are deduped within the window
 *
 * IMPORTANT: Uses raw fetch() to PostgREST — NOT the supabase JS client.
 * The supabase client's auth state can silently block inserts via RLS.
 */

import { supabase } from '@/integrations/sb_client/client';

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SB_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Save the REAL fetch before any interceptors wrap it.
// sendErrorToDb MUST use this to avoid infinite loops with the fetch interceptor.
const _rawFetch = window.fetch.bind(window);

interface ErrorEntry {
  message: string;
  source: string; // 'unhandled_rejection' | 'uncaught_error' | 'edge_function' | 'react_boundary'
  page: string;
  stack?: string;
  extra?: Record<string, unknown>;
  timestamp: string;
}

const WINDOW_MS = 60_000; // 1-minute dedup window
const MAX_PER_WINDOW = 10; // max errors to report per window
const recentMessages = new Set<string>();
let reportedInWindow = 0;
let windowStart = Date.now();

function resetWindowIfNeeded() {
  if (Date.now() - windowStart > WINDOW_MS) {
    recentMessages.clear();
    reportedInWindow = 0;
    windowStart = Date.now();
  }
}

/** Try to get a JWT from localStorage (supabase stores session there). */
function getSessionToken(): string | null {
  try {
    // Supabase stores the session under a key like sb-<project-ref>-auth-token
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

async function sendErrorToDb(entry: ErrorEntry) {
  resetWindowIfNeeded();

  // Dedup: skip if we already reported this exact message in this window
  const key = entry.message + entry.source;
  if (recentMessages.has(key)) return;
  if (reportedInWindow >= MAX_PER_WINDOW) return;

  recentMessages.add(key);
  reportedInWindow++;

  // Use the session JWT if available, otherwise anon key
  const jwt = getSessionToken() || SB_ANON_KEY;

  // Try bug_reports first — simpler RLS, more reliable
  try {
    const resp = await _rawFetch(`${SB_URL}/rest/v1/bug_reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_ANON_KEY,
        'Authorization': `Bearer ${jwt}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
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
      }),
    });
    if (resp.ok) {
      console.info('[AutoErrorReporter] Error captured in bug_reports');
      return;
    }
    console.warn('[AutoErrorReporter] bug_reports insert failed:', resp.status, await resp.text().catch(() => ''));
  } catch (e) {
    console.warn('[AutoErrorReporter] bug_reports fetch failed:', e);
  }

  // Fallback: try audit_log
  try {
    const resp = await _rawFetch(`${SB_URL}/rest/v1/audit_log`, {
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
    if (resp.ok) {
      console.info('[AutoErrorReporter] Error captured in audit_log');
      return;
    }
    console.warn('[AutoErrorReporter] audit_log insert failed:', resp.status, await resp.text().catch(() => ''));
  } catch (e) {
    console.warn('[AutoErrorReporter] audit_log fetch failed:', e);
  }
}

/**
 * Call this once at app startup (main.tsx) to install global error listeners.
 */
export function installAutoErrorReporter() {
  // 0. Wrap supabase.functions.invoke to auto-capture edge function errors
  //    This catches errors EVEN when the calling code has try/catch.
  const origInvoke = supabase.functions.invoke.bind(supabase.functions);
  (supabase.functions as any).invoke = async (functionName: string, options?: any) => {
    try {
      const result = await origInvoke(functionName, options);
      if (result.error) {
        sendErrorToDb({
          message: `Edge function '${functionName}' failed: ${result.error.message || JSON.stringify(result.error)}`,
          source: 'edge_function',
          page: window.location.hash || '/',
          stack: result.error instanceof Error ? result.error.stack : undefined,
          extra: { functionName, context: result.error.context },
          timestamp: new Date().toISOString(),
        });
      }
      return result;
    } catch (err: any) {
      // Network-level failure (couldn't even reach the function)
      sendErrorToDb({
        message: `Edge function '${functionName}' network error: ${err?.message || String(err)}`,
        source: 'edge_function',
        page: window.location.hash || '/',
        stack: err instanceof Error ? err.stack : undefined,
        extra: { functionName },
        timestamp: new Date().toISOString(),
      });
      throw err; // Re-throw so the calling code's catch still works
    }
  };

  // 0b. Intercept console.error — catches EVERYTHING any code logs as an error,
  //     including try/catch'd errors that show toasts but never bubble up.
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
      // Skip React internal noise and our own messages
      if (msg.includes('[AutoErrorReporter]')) return;
      if (msg.includes('Warning:') && msg.includes('React')) return;
      if (msg.includes('Download the React DevTools')) return;
      sendErrorToDb({
        message: msg,
        source: 'console_error',
        page: window.location.hash || '/',
        timestamp: new Date().toISOString(),
      });
    } catch { /* never throw from here */ }
  };

  // 0c. Intercept global fetch() — catches ALL failed HTTP requests including
  //     edge function calls that bypass supabase.functions.invoke
  const origFetch = window.fetch;
  window.fetch = async (...fetchArgs: Parameters<typeof fetch>) => {
    try {
      const resp = await origFetch(...fetchArgs);
      if (!resp.ok) {
        const url = typeof fetchArgs[0] === 'string' ? fetchArgs[0] : fetchArgs[0] instanceof Request ? fetchArgs[0].url : String(fetchArgs[0]);
        // Only report Supabase-related failures (edge functions, REST API)
        if (url.includes('supabase') || url.includes('functions/v1')) {
          const bodyText = await resp.clone().text().catch(() => '');
          sendErrorToDb({
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
      // Network error (couldn't even connect)
      const url = typeof fetchArgs[0] === 'string' ? fetchArgs[0] : fetchArgs[0] instanceof Request ? fetchArgs[0].url : String(fetchArgs[0]);
      if (url.includes('supabase') || url.includes('functions/v1')) {
        sendErrorToDb({
          message: `Fetch failed: ${err instanceof Error ? err.message : String(err)} — ${url.split('?')[0]}`.slice(0, 300),
          source: 'fetch_error',
          page: window.location.hash || '/',
          extra: { url: url.split('?')[0] },
          timestamp: new Date().toISOString(),
        });
      }
      throw err;
    }
  };

  // 1. Unhandled promise rejections (covers failed fetch, edge function errors, etc.)
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : JSON.stringify(reason);

    // Skip known non-actionable errors
    if (message.includes('AbortError') || message.includes('The user aborted')) return;
    if (message.includes('ResizeObserver')) return;

    sendErrorToDb({
      message,
      source: 'unhandled_rejection',
      page: window.location.hash || '/',
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: new Date().toISOString(),
    });
  });

  // 1b. Self-test: send a single ping per browser session to verify pipeline
  if (!sessionStorage.getItem('auto-error-reporter-pinged')) {
    sessionStorage.setItem('auto-error-reporter-pinged', '1');
    sendErrorToDb({
      message: 'AutoErrorReporter installed successfully — this is a self-test ping',
      source: 'self_test',
      page: window.location.hash || '/',
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Uncaught JavaScript errors
  window.addEventListener('error', (event) => {
    // Skip script loading errors (CORS, CDN issues)
    if (event.message === 'Script error.' && !event.filename) return;

    sendErrorToDb({
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
  sendErrorToDb({
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
 * Usage: reportEdgeFunctionError('chat-with-ai', error)
 */
export function reportEdgeFunctionError(functionName: string, error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : JSON.stringify(error);

  sendErrorToDb({
    message: `Edge function '${functionName}' failed: ${message}`,
    source: 'edge_function',
    page: window.location.hash || '/',
    stack: error instanceof Error ? error.stack : undefined,
    extra: { functionName },
    timestamp: new Date().toISOString(),
  });
}
