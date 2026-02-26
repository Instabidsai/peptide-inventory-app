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

/**
 * Invoke a Supabase Edge Function with guaranteed fresh auth token.
 * Refreshes the session before calling, and retries once on auth failure.
 */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<InvokeResult<T>> {
  // Ensure we have a fresh session token before invoking
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    return { data: null, error: { message: "Not authenticated — please sign in again" } };
  }

  const { data, error } = await supabase.functions.invoke(functionName, { body });

  // If we get an auth error, try refreshing the session and retry once
  if (error) {
    const msg = error.message || "";
    const isAuthError =
      msg.includes("401") ||
      msg.includes("Unauthorized") ||
      msg.includes("non-2xx") ||
      msg.includes("JWT");

    if (isAuthError) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError) {
        // Retry with the refreshed token
        const retry = await supabase.functions.invoke(functionName, { body });
        return { data: retry.data as T, error: retry.error };
      }
      return { data: null, error: { message: "Session expired — please sign in again" } };
    }
  }

  return { data: data as T, error };
}
