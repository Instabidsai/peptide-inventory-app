import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { sanitizeString } from "../_shared/validate.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * scrape-brand-status: Poll a Firecrawl batch scrape job and extract products.
 *
 * Two-phase approach to stay within 30s edge function limit:
 *   Phase 1 (offset=0): Stream just the status from Firecrawl (fast, <2s)
 *     - If still scraping: return { status: "scraping", progress }
 *     - If completed: return { status: "batch_ready", total }
 *   Phase 2 (offset>0 OR action="process"): Download batch data + extract products
 *     - Downloads the full batch result (can take 10-25s for large sites)
 *     - Extracts products with GPT-4o-mini
 *     - Persists to DB
 *     - Returns { status: "completed", newPeptides, ... }
 *
 * POST /scrape-brand-status
 * Body: { jobId: string, offset?: number, action?: "check" | "process" }
 */

const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const CONTENT_PER_PAGE = 3000;

// ── Types ─────────────────────────────────────────────────────

interface BatchPage {
    markdown: string;
    metadata?: { sourceURL?: string; title?: string };
}

interface ExtractedProduct {
    name: string;
    price: number | null;
    description: string;
    image_url: string;
}

// ── Stream-based Status Check ─────────────────────────────────
// Reads only the first ~1KB of the Firecrawl response to extract
// the status without downloading megabytes of markdown.

async function checkBatchStatus(
    jobId: string,
): Promise<{ status: string; completed: number; total: number }> {
    if (!FIRECRAWL_API_KEY) {
        throw new Error("FIRECRAWL_API_KEY not configured");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const resp = await fetch(
            `https://api.firecrawl.dev/v2/batch/scrape/${jobId}`,
            {
                headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
                signal: controller.signal,
            },
        );

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Firecrawl API (${resp.status}): ${err}`);
        }

        // Stream just the first chunk to find status/completed/total
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Read chunks until we have enough to parse status fields
        for (let i = 0; i < 5; i++) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // Status fields should be in the first few hundred bytes
            if (buffer.length > 500) break;
        }

        // Cancel the rest of the download immediately
        reader.cancel();

        // Extract fields from partial JSON using regex
        const statusMatch = buffer.match(/"status"\s*:\s*"(\w+)"/);
        const completedMatch = buffer.match(/"completed"\s*:\s*(\d+)/);
        const totalMatch = buffer.match(/"total"\s*:\s*(\d+)/);

        return {
            status: statusMatch?.[1] || "unknown",
            completed: parseInt(completedMatch?.[1] || "0"),
            total: parseInt(totalMatch?.[1] || "0"),
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

// ── Full Batch Data Download ──────────────────────────────────
// Downloads the complete batch result (all pages). Uses a 25s timeout.

async function downloadBatchData(
    jobId: string,
): Promise<BatchPage[]> {
    if (!FIRECRAWL_API_KEY) {
        throw new Error("FIRECRAWL_API_KEY not configured");
    }

    const allPages: BatchPage[] = [];
    let nextUrl: string | null =
        `https://api.firecrawl.dev/v2/batch/scrape/${jobId}`;

    while (nextUrl) {
        const resp = await fetch(nextUrl, {
            headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
            signal: AbortSignal.timeout(55000),
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Firecrawl data (${resp.status}): ${err}`);
        }

        const result = await resp.json();
        if (result.data) {
            allPages.push(...result.data);
        }
        nextUrl = result.next || null;
    }

    return allPages;
}

// ── GPT-4o-mini Product Extraction ────────────────────────────

async function extractProducts(
    pages: BatchPage[],
): Promise<ExtractedProduct[]> {
    const sections = pages
        .filter((p) => p.markdown && p.markdown.length > 50)
        .map((p, i) => {
            const url = p.metadata?.sourceURL || `Page ${i + 1}`;
            return `=== ${url} ===\n${p.markdown.slice(0, CONTENT_PER_PAGE)}`;
        });

    if (sections.length === 0) return [];

    // Split into groups of 8 pages to keep GPT context manageable
    const groups: string[][] = [];
    for (let i = 0; i < sections.length; i += 8) {
        groups.push(sections.slice(i, i + 8));
    }

    const allProducts: ExtractedProduct[] = [];

    for (const group of groups) {
        const combined = group.join("\n\n");
        try {
            const resp = await fetch(
                "https://api.openai.com/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${OPENAI_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: `Extract ALL peptide/research chemical products from the following page contents.

For each product found, extract:
- name: Clean product name (e.g., "BPC-157 5mg", "TB-500 10mg")
- price: Price as a number (null if not found). Use the base/standard price.
- description: Brief description (max 200 chars)
- image_url: Product image URL if found

Return ONLY valid JSON: { "products": [{ "name": "", "price": null, "description": "", "image_url": "" }] }

Rules:
- Include EVERY unique product
- If a page has variants (5mg, 10mg), list the primary variant
- If a page is a category/listing page, extract ALL products
- Deduplicate across pages`,
                            },
                            {
                                role: "user",
                                content: `${group.length} pages:\n\n${combined}`,
                            },
                        ],
                        temperature: 0.1,
                        response_format: { type: "json_object" },
                    }),
                    signal: AbortSignal.timeout(15000),
                },
            );

            if (!resp.ok) {
                console.error(
                    `[scrape-brand-status] GPT extraction failed: ${resp.status}`,
                );
                continue;
            }

            const data = await resp.json();
            const parsed = JSON.parse(data.choices[0].message.content);
            allProducts.push(...(parsed.products || []));
        } catch (e) {
            console.error(
                "[scrape-brand-status] Extraction error:",
                e,
            );
        }
    }

    return allProducts;
}

// ── Deduplication ─────────────────────────────────────────────

function normalizeProductName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/\d+\s*(mg|mcg|ml|iu)\b/gi, "")
        .trim();
}

// ── Main Handler ──────────────────────────────────────────────

Deno.serve(
    withErrorReporting("scrape-brand-status", async (req) => {
        const corsHeaders = getCorsHeaders(req);
        const preflight = handleCors(req);
        if (preflight) return preflight;

        try {
            const { orgId, supabase } = await authenticateRequest(req, {
                requireRole: ["admin", "super_admin"],
            });

            const body = await req.json();
            const jobId = sanitizeString(body.jobId, 200);
            if (!jobId) {
                return jsonResponse(
                    { error: "jobId is required" },
                    400,
                    corsHeaders,
                );
            }

            const action = body.action || "check";

            console.log(
                `[scrape-brand-status] Job ${jobId}, org ${orgId}, action=${action}`,
            );

            // ══════════════════════════════════════════════════════
            // Phase 1: Quick status check (streaming, <2s)
            // ══════════════════════════════════════════════════════

            if (action === "check") {
                const status = await checkBatchStatus(jobId);

                console.log(
                    `[scrape-brand-status] Status: ${status.status} (${status.completed}/${status.total})`,
                );

                if (status.status === "completed") {
                    return jsonResponse(
                        {
                            status: "batch_ready",
                            total: status.total,
                            completed: status.completed,
                        },
                        200,
                        corsHeaders,
                    );
                }

                if (status.status === "failed") {
                    return jsonResponse(
                        { status: "failed", error: "Batch scrape failed" },
                        200,
                        corsHeaders,
                    );
                }

                return jsonResponse(
                    {
                        status: "scraping",
                        progress: {
                            completed: status.completed,
                            total: status.total,
                        },
                    },
                    200,
                    corsHeaders,
                );
            }

            // ══════════════════════════════════════════════════════
            // Phase 2: Process batch data (action="process")
            // This call can take up to ~28s
            // ══════════════════════════════════════════════════════

            console.log(
                `[scrape-brand-status] Downloading batch data...`,
            );

            const pages = await downloadBatchData(jobId);

            console.log(
                `[scrape-brand-status] Downloaded ${pages.length} pages. Extracting products...`,
            );

            // Get existing products for dedup
            const { data: existingProducts } = await supabase
                .from("scraped_peptides")
                .select("name")
                .eq("org_id", orgId);

            const existingNames = new Set(
                (existingProducts || []).map((p: { name: string }) =>
                    normalizeProductName(p.name),
                ),
            );

            // Extract products
            const extracted = await extractProducts(pages);

            console.log(
                `[scrape-brand-status] Extracted ${extracted.length} raw products`,
            );

            // Deduplicate
            const seenInBatch = new Set<string>();
            const newPeptides: ExtractedProduct[] = [];

            for (const p of extracted) {
                if (!p.name) continue;
                const normalized = normalizeProductName(p.name);
                if (!normalized) continue;
                if (existingNames.has(normalized)) continue;
                if (seenInBatch.has(normalized)) continue;

                seenInBatch.add(normalized);
                newPeptides.push(p);
            }

            // Persist new products
            if (newPeptides.length > 0) {
                const { data: config } = await supabase
                    .from("tenant_config")
                    .select("website_url")
                    .eq("org_id", orgId)
                    .single();

                const sourceUrl = config?.website_url || "";

                const rows = newPeptides.map((p) => ({
                    org_id: orgId,
                    name: p.name,
                    price: p.price,
                    description: p.description || "",
                    image_url: p.image_url || "",
                    source_url: sourceUrl,
                    confidence: p.price ? 0.9 : 0.6,
                    status: "pending",
                    raw_data: {
                        ...p,
                        source: "crawl",
                        batchJobId: jobId,
                    },
                }));

                const { error } = await supabase
                    .from("scraped_peptides")
                    .insert(rows);

                if (error) {
                    console.error(
                        "[scrape-brand-status] Insert error:",
                        error,
                    );
                }
            }

            console.log(
                `[scrape-brand-status] Done: ${newPeptides.length} new, ${existingNames.size} existing`,
            );

            return jsonResponse(
                {
                    status: "completed",
                    newPeptides: newPeptides.map((p) => ({
                        name: p.name,
                        price: p.price,
                        description: p.description || "",
                        image_url: p.image_url || "",
                        confidence: p.price ? 0.9 : 0.6,
                        source: "crawl",
                    })),
                    existingCount: existingNames.size,
                    newCount: newPeptides.length,
                    totalPagesScraped: pages.length,
                },
                200,
                corsHeaders,
            );
        } catch (err) {
            if (err instanceof AuthError) {
                return jsonResponse(
                    { error: err.message },
                    err.status,
                    corsHeaders,
                );
            }
            console.error("[scrape-brand-status]", err);
            return jsonResponse(
                { error: (err as Error).message || "Internal error" },
                500,
                corsHeaders,
            );
        }
    }),
);
