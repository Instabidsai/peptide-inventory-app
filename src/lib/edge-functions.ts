/**
 * Edge Function invocation wrapper with automatic token refresh.
 *
 * Problem: supabase.functions.invoke() sends the current access_token.
 * If the token expired and auto-refresh hasn't kicked in yet, the call
 * fails with 401. This wrapper ensures a fresh session before every call.
 */

import { supabase } from "@/integrations/sb_client/client";

interface InvokeResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}

/** Decode JWT payload without a library */
function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp || 0;
  } catch {
    return 0;
  }
}

/** Extract the real error message from a FunctionsHttpError context */
function extractErrorDetail(error: unknown): string | undefined {
  const context = (error as any)?.context;
  if (context == null) return undefined;
  if (typeof context === "string") return context;
  if (typeof context === "object") {
    const detail = context.error || context.message || context.msg;
    if (detail) return String(detail);
    try { return JSON.stringify(context); } catch { /* ignore */ }
  }
  return undefined;
}

/**
 * Invoke a Supabase Edge Function with guaranteed fresh auth token.
 * Proactively refreshes the session if the token expires within 90 seconds,
 * and retries once on auth failure as a safety net.
 */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<InvokeResult<T>> {
  // 1. Get cached session
  let { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session;

  if (!session) {
    return { data: null, error: { message: "Not authenticated — please sign in again" } };
  }

  // 2. Proactively refresh if token expires within 90 seconds
  const exp = jwtExp(session.access_token);
  const nowSec = Math.floor(Date.now() / 1000);
  if (exp > 0 && exp - nowSec < 90) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr || !refreshed.session) {
      return { data: null, error: { message: "Session expired — please sign in again" } };
    }
    session = refreshed.session;
  }

  // 3. Call the edge function
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (!error) return { data: data as T, error: null };

  // 4. Extract real error from context (supabase-js wraps non-2xx with a generic message)
  const detail = extractErrorDetail(error);
  const effectiveMsg = detail || error.message || "Unknown edge function error";

  // 5. Retry once on auth failure (check extracted message, not just generic wrapper)
  const isAuthError = /\b(401|unauthorized|invalid token|expired|jwt)\b/i.test(effectiveMsg);
  if (isAuthError) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session) {
      const retry = await supabase.functions.invoke(functionName, { body });
      if (retry.error) {
        const retryDetail = extractErrorDetail(retry.error);
        return { data: null, error: { message: retryDetail || retry.error.message } };
      }
      return { data: retry.data as T, error: null };
    }
    return { data: null, error: { message: "Session expired — please sign in again" } };
  }

  return { data: null, error: { message: effectiveMsg } };
}
