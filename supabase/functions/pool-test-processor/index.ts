import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * pool-test-processor: Validates NMI or Authorize.net credentials
 * by making a lightweight test API call.
 *
 * POST { processor: "nmi"|"authorize_net", public_key: string, api_key: string }
 * Returns { valid: true } or { valid: false, error: string }
 */
Deno.serve(withErrorReporting("pool-test-processor", async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    await authenticateRequest(req, { requireRole: ["admin"] });

    const { processor, public_key, api_key } = await req.json();
    if (!processor || !public_key || !api_key) {
      return jsonResponse({ error: "Missing processor, public_key, or api_key" }, 400, corsHeaders);
    }

    if (processor === "nmi") {
      // NMI: Use the Three Step Redirect API to validate credentials
      // A simple sale of $0.00 or query call validates the security key
      const body = new URLSearchParams({
        security_key: api_key,
        type: "validate",
      });

      const resp = await fetch("https://secure.nmi.com/api/transact.php", {
        method: "POST",
        body,
      });
      const text = await resp.text();

      // NMI returns response=1 for valid keys (even with validate type)
      // response=2 or response=3 means error
      const params = new URLSearchParams(text);
      const responseCode = params.get("response");
      const responseText = params.get("responsetext");

      if (responseCode === "1") {
        return jsonResponse({ valid: true, message: "NMI credentials verified" }, 200, corsHeaders);
      } else {
        return jsonResponse({
          valid: false,
          error: responseText || "NMI rejected the credentials",
        }, 200, corsHeaders);
      }
    } else if (processor === "authorize_net") {
      // Authorize.net: Use the authenticateTest transaction type
      const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<authenticateTestRequest xmlns="AnetApi/xml/v1/schema/AnetApiSchema.xsd">
  <merchantAuthentication>
    <name>${public_key}</name>
    <transactionKey>${api_key}</transactionKey>
  </merchantAuthentication>
</authenticateTestRequest>`;

      const resp = await fetch("https://apitest.authorize.net/xml/v1/request.api", {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xmlBody,
      });
      const text = await resp.text();

      // Check for resultCode=Ok
      if (text.includes("<resultCode>Ok</resultCode>")) {
        return jsonResponse({ valid: true, message: "Authorize.net credentials verified" }, 200, corsHeaders);
      } else {
        const match = text.match(/<text>(.*?)<\/text>/);
        return jsonResponse({
          valid: false,
          error: match?.[1] || "Authorize.net rejected the credentials",
        }, 200, corsHeaders);
      }
    } else {
      return jsonResponse({ error: `Unknown processor: ${processor}` }, 400, corsHeaders);
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }
    console.error("[pool-test-processor]", err);
    return jsonResponse({ error: (err as Error).message }, 500, corsHeaders);
  }
}));
