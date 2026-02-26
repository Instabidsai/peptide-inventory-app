/**
 * Edge Function Error Self-Reporter
 *
 * Writes unhandled errors to the bug_reports table so the auto-heal
 * sentinel can detect server-side edge function crashes.
 *
 * Usage:
 *   import { reportEdgeFunctionError, withErrorReporting } from "../_shared/error-reporter.ts";
 *
 *   // Option A: Manual
 *   catch (err) { await reportEdgeFunctionError("my-function", err, req); }
 *
 *   // Option B: Wrap your handler (recommended)
 *   Deno.serve(withErrorReporting("my-function", async (req) => { ... }));
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let _supabase: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
    if (_supabase) return _supabase;
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return null;
    _supabase = createClient(url, key, { auth: { persistSession: false } });
    return _supabase;
}

/**
 * Report an edge function error to the bug_reports table.
 * Fire-and-forget — never throws, never blocks the response.
 */
export async function reportEdgeFunctionError(
    functionName: string,
    error: unknown,
    req?: Request,
): Promise<void> {
    try {
        const sb = getServiceClient();
        if (!sb) return;

        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : undefined;
        const url = req?.url || "";
        const method = req?.method || "";

        await sb.from("bug_reports").insert({
            description: `[AUTO] edge_function_error: ${functionName}: ${errMsg}`,
            page_url: `edge-function://${functionName}`,
            status: "open",
            console_errors: JSON.stringify([
                {
                    source: "edge_function",
                    function: functionName,
                    error: errMsg,
                    stack: errStack?.slice(0, 2000),
                    request_url: url.slice(0, 500),
                    request_method: method,
                    timestamp: new Date().toISOString(),
                },
            ]),
        });
    } catch {
        // Swallow — the reporter itself must never crash the function
    }
}

/**
 * Wrap a Deno.serve handler to auto-report unhandled errors.
 * The wrapper catches top-level errors, reports them, and still
 * returns a 500 response so the caller gets feedback.
 *
 * Usage:
 *   Deno.serve(withErrorReporting("my-function", async (req) => {
 *       // your handler
 *       return new Response("ok");
 *   }));
 */
export function withErrorReporting(
    functionName: string,
    handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
    return async (req: Request): Promise<Response> => {
        try {
            return await handler(req);
        } catch (err) {
            // Report to DB (fire-and-forget, 3s timeout so we don't hang)
            const reportPromise = reportEdgeFunctionError(functionName, err, req);
            const timeout = new Promise<void>((r) => setTimeout(r, 3000));
            await Promise.race([reportPromise, timeout]);

            // Still log to console for Supabase's own log viewer
            console.error(`[${functionName}] Unhandled:`, err);

            // Return 500 to caller
            return new Response(
                JSON.stringify({ error: "Internal server error" }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
    };
}
