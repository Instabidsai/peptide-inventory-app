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

  // 4. Safety net: retry once on auth failure (shouldn't happen after proactive refresh)
  if (error) {
    const msg = error.message || "";
    const isAuthError =
      msg.includes("401") ||
      msg.includes("Unauthorized") ||
      msg.includes("JWT");

    if (isAuthError) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session) {
        const retry = await supabase.functions.invoke(functionName, { body });
        return { data: retry.data as T, error: retry.error };
      }
      return { data: null, error: { message: "Session expired — please sign in again" } };
    }

    // Extract actual error from edge function response if available
    const context = (error as any).context;
    if (context) {
      const detail = typeof context === "string" ? context : context?.error || context?.message;
      if (detail) {
        return { data: null, error: { message: String(detail) } };
      }
    }
  }

  return { data: data as T, error };
}
