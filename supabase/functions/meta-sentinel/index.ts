/* eslint-disable complexity */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";
import { authenticateCron, createServiceClient } from "../_shared/auth.ts";

/**
 * meta-sentinel — Self-Monitoring Heal System
 *
 * Runs every 30 minutes via pg_cron.
 *
 * Responsibilities:
 *   1. Compute fix rate over rolling 6h window
 *   2. Identify top unresolved error fingerprints
 *   3. Adaptive threshold adjustment when fix rate drops
 *   4. Auto-generate suppression rules for persistent expected-behavior errors
 *   5. Store metrics in sentinel_meta table
 *   6. Create self-repair incident if fix rate critically low
 */

const WINDOW_HOURS = 6;
const LOW_FIX_RATE_THRESHOLD = 0.50;
const CRITICAL_FIX_RATE_THRESHOLD = 0.30;
const BROKEN_FIX_RATE_THRESHOLD = 0.10;
const AUTO_SUPPRESS_MIN_OCCURRENCES = 10; // Only auto-suppress if error appears 10+ times
const AUTO_SUPPRESS_CATEGORIES = ["auth", "network", "client"]; // Safe to auto-suppress

Deno.serve(
  withErrorReporting("meta-sentinel", async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    // Auth: CRON_SECRET or service_role
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!authHeader.includes(serviceKey)) {
      try { authenticateCron(req); } catch {
        return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
      }
    }

    const supabase = createServiceClient();
    const windowStart = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date().toISOString();
    const adaptiveActions: string[] = [];

    try {
      // ── 1. Count total bugs in window ──
      const { count: totalBugs } = await supabase
        .from("bug_reports")
        .select("id", { count: "exact", head: true })
        .gte("created_at", windowStart);

      // ── 2. Count auto-fixed bugs ──
      const { count: autoFixed } = await supabase
        .from("bug_reports")
        .select("id", { count: "exact", head: true })
        .gte("created_at", windowStart)
        .eq("status", "resolved")
        .not("sentinel_diagnosis", "is", null);

      // ── 3. Count suppressed (client_healed) ──
      const { count: suppressed } = await supabase
        .from("bug_reports")
        .select("id", { count: "exact", head: true })
        .gte("created_at", windowStart)
        .eq("client_healed", true);

      // ── 4. Compute fix rate ──
      const total = totalBugs || 0;
      const fixed = (autoFixed || 0) + (suppressed || 0);
      const fixRate = total > 0 ? fixed / total : 1.0;

      // ── 5. Category breakdown ──
      const { data: openBugs } = await supabase
        .from("bug_reports")
        .select("description, error_fingerprint")
        .gte("created_at", windowStart)
        .eq("status", "open")
        .limit(200);

      const categoryBreakdown: Record<string, number> = {};
      const fingerprintCounts: Record<string, number> = {};

      for (const bug of openBugs || []) {
        // Simple category detection from description
        const desc = (bug.description || "").toLowerCase();
        let cat = "unknown";
        if (desc.includes("auth") || desc.includes("jwt") || desc.includes("token") || desc.includes("session")) cat = "auth";
        else if (desc.includes("network") || desc.includes("fetch") || desc.includes("dns")) cat = "network";
        else if (desc.includes("chunk") || desc.includes("module")) cat = "client";
        else if (desc.includes("column") || desc.includes("relation") || desc.includes("constraint")) cat = "database";
        else if (desc.includes("rpc") || desc.includes("edge")) cat = "edge_function";

        categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;

        const fp = bug.error_fingerprint || desc.slice(0, 100);
        fingerprintCounts[fp] = (fingerprintCounts[fp] || 0) + 1;
      }

      // ── 6. Top unresolved fingerprints ──
      const topUnresolved = Object.entries(fingerprintCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([fp, count]) => ({ fingerprint: fp, count }));

      // ── 7. Adaptive actions ──

      // 7a. Auto-suppress frequent expected-behavior errors
      for (const [fp, count] of Object.entries(fingerprintCounts)) {
        if (count < AUTO_SUPPRESS_MIN_OCCURRENCES) continue;

        // Only auto-suppress if it looks like a safe category
        const fpLower = fp.toLowerCase();
        const isSafe = AUTO_SUPPRESS_CATEGORIES.some(cat => {
          if (cat === "auth") return fpLower.includes("auth") || fpLower.includes("jwt") || fpLower.includes("token") || fpLower.includes("session");
          if (cat === "network") return fpLower.includes("fetch") || fpLower.includes("network") || fpLower.includes("dns");
          if (cat === "client") return fpLower.includes("chunk") || fpLower.includes("resize") || fpLower.includes("abort");
          return false;
        });

        if (isSafe) {
          // Check if already suppressed
          const { data: existingPattern } = await supabase
            .from("error_patterns")
            .select("id")
            .eq("pattern", fp.slice(0, 200))
            .limit(1);

          if (!existingPattern || existingPattern.length === 0) {
            // Auto-create suppression pattern
            await supabase.from("error_patterns").insert({
              pattern: fp.slice(0, 200),
              match_type: "substring",
              category: fpLower.includes("auth") ? "auth" : fpLower.includes("fetch") ? "network" : "client",
              severity: "low",
              auto_fix_action: "suppress",
              fix_description: `[META-SENTINEL] Auto-suppressed: ${count} occurrences in ${WINDOW_HOURS}h, safe category`,
              enabled: true,
            });
            adaptiveActions.push(`auto_suppress: ${fp.slice(0, 80)} (${count}x)`);
          }

          // Also create client heal instruction for browser-side suppression
          const { data: existingHeal } = await supabase
            .from("client_heal_instructions")
            .select("id")
            .eq("error_fingerprint", fp.slice(0, 200))
            .limit(1);

          if (!existingHeal || existingHeal.length === 0) {
            await supabase.from("client_heal_instructions").insert({
              error_fingerprint: fp.slice(0, 200),
              instruction_type: "suppress",
              instruction_payload: {},
              active: true,
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });
          }
        }
      }

      // 7b. Check fix rate trend (last 3 windows)
      const { data: recentMeta } = await supabase
        .from("sentinel_meta")
        .select("fix_rate")
        .order("window_start", { ascending: false })
        .limit(3);

      const recentRates = (recentMeta || []).map(m => m.fix_rate);

      if (fixRate < BROKEN_FIX_RATE_THRESHOLD) {
        // Fix rate critically low — sentinel itself may be broken
        const { data: existingIncident } = await supabase
          .from("incidents")
          .select("id")
          .eq("title", "META-SENTINEL: Fix rate critically low")
          .eq("status", "detected")
          .limit(1);

        if (!existingIncident || existingIncident.length === 0) {
          await supabase.from("incidents").insert({
            title: "META-SENTINEL: Fix rate critically low",
            severity: "critical",
            status: "detected",
            source: "meta-sentinel",
            error_pattern: `fix_rate=${fixRate.toFixed(2)}`,
            diagnosis: `Fix rate ${(fixRate * 100).toFixed(1)}% over ${WINDOW_HOURS}h window. Recent rates: ${recentRates.map(r => (r * 100).toFixed(1) + '%').join(', ')}. Sentinel self-heal may be broken.`,
            metadata: { fix_rate: fixRate, total_bugs: total, auto_fixed: fixed, window_hours: WINDOW_HOURS },
          });
          adaptiveActions.push(`critical_incident: fix_rate=${(fixRate * 100).toFixed(1)}%`);
        }
      } else if (fixRate < CRITICAL_FIX_RATE_THRESHOLD && recentRates.filter(r => r < CRITICAL_FIX_RATE_THRESHOLD).length >= 2) {
        // 3+ consecutive low windows — enable aggressive mode
        adaptiveActions.push(`aggressive_mode: 3+ windows below ${CRITICAL_FIX_RATE_THRESHOLD * 100}%`);
        // Lower the confidence threshold by updating a config (future: tenant_config row)
      } else if (fixRate < LOW_FIX_RATE_THRESHOLD && recentRates.filter(r => r < LOW_FIX_RATE_THRESHOLD).length >= 1) {
        adaptiveActions.push(`elevated_processing: 2+ windows below ${LOW_FIX_RATE_THRESHOLD * 100}%`);
      }

      // ── 8. Store metrics ──
      await supabase.from("sentinel_meta").insert({
        window_start: windowStart,
        window_end: windowEnd,
        total_bugs: total,
        auto_fixed: autoFixed || 0,
        suppressed: suppressed || 0,
        client_healed: suppressed || 0,
        fix_rate: fixRate,
        category_breakdown: categoryBreakdown,
        top_unresolved: topUnresolved,
        adaptive_actions: adaptiveActions,
      });

      return jsonResponse({
        ok: true,
        window: { start: windowStart, end: windowEnd },
        total_bugs: total,
        auto_fixed: autoFixed || 0,
        suppressed: suppressed || 0,
        fix_rate: `${(fixRate * 100).toFixed(1)}%`,
        adaptive_actions: adaptiveActions,
        top_unresolved: topUnresolved.slice(0, 5),
      }, 200, corsHeaders);

    } catch (err) {
      return jsonResponse({ ok: false, error: (err as Error).message }, 500, corsHeaders);
    }
  }),
);
