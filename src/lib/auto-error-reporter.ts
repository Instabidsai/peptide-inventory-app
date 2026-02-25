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
 *  - Writes to `audit_log` table with action='auto_error'
 *  - Auto-heal pipeline reads these entries and can fix the underlying code
 *
 * Rate limiting:
 *  - Max 5 errors per 60-second window per session
 *  - Identical errors (same message) are deduped within the window
 */

import { supabase } from '@/integrations/sb_client/client';

interface ErrorEntry {
  message: string;
  source: string; // 'unhandled_rejection' | 'uncaught_error' | 'edge_function' | 'react_boundary'
  page: string;
  stack?: string;
  extra?: Record<string, unknown>;
  timestamp: string;
}

const WINDOW_MS = 60_000; // 1-minute dedup window
const MAX_PER_WINDOW = 5; // max errors to report per window
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

async function sendErrorToDb(entry: ErrorEntry) {
  resetWindowIfNeeded();

  // Dedup: skip if we already reported this exact message in this window
  const key = entry.message + entry.source;
  if (recentMessages.has(key)) return;
  if (reportedInWindow >= MAX_PER_WINDOW) return;

  recentMessages.add(key);
  reportedInWindow++;

  try {
    // Get current user info if available (don't block on this)
    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('audit_log').insert({
      action: 'auto_error',
      table_name: 'app',
      record_id: crypto.randomUUID(),
      user_id: user?.id || null,
      new_data: {
        message: entry.message,
        source: entry.source,
        page: entry.page,
        stack: entry.stack?.slice(0, 2000), // truncate long stacks
        extra: entry.extra || {},
        user_agent: navigator.userAgent,
        timestamp: entry.timestamp,
      },
    });

    if (insertError) {
      console.warn('[AutoErrorReporter] Failed to write to audit_log:', insertError.message);
      // Fallback: try bug_reports table (has different RLS)
      await supabase.from('bug_reports').insert({
        description: `[AUTO] ${entry.source}: ${entry.message}`,
        page_url: entry.page,
        user_agent: navigator.userAgent,
        user_id: user?.id || null,
        user_email: user?.email || null,
        status: 'new',
        console_errors: JSON.stringify({
          source: entry.source,
          stack: entry.stack?.slice(0, 2000),
          extra: entry.extra,
          timestamp: entry.timestamp,
        }),
      });
    }
  } catch {
    // If we can't report the error, don't throw — that would cause infinite loop
    console.warn('[AutoErrorReporter] Could not report error (both tables failed)');
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
