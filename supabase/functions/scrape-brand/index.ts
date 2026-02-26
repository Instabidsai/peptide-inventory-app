import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { sanitizeString } from "../_shared/validate.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * scrape-brand: Extract brand identity + peptide catalog from a website URL.
 *
 * Uses Firecrawl to scrape, then GPT-4o to extract structured data.
 * Returns: { brand, peptides } — brand info + product catalog.
 *
 * POST /scrape-brand
 * Body: { url: string, org_id?: string (admin override) }
 * Auth: JWT (admin role)
 *
 * Two modes:
 * 1. Preview (no org_id): returns extracted data for review during onboarding
 * 2. Persist (with org_id): saves to tenant_config + scraped_peptides table
 */

const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// ── Firecrawl scrape ────────────────────────────────────────────

interface FirecrawlResult {
    markdown: string;
    metadata?: {
        title?: string;
        description?: string;
        ogImage?: string;
        favicon?: string;
    };
}

async function scrapeWithFirecrawl(url: string): Promise<FirecrawlResult> {
    if (!FIRECRAWL_API_KEY) {
        throw new Error("FIRECRAWL_API_KEY not configured");
    }

    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            url,
            formats: ["markdown"],
            onlyMainContent: false,
            waitFor: 3000,
        }),
    });

    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Firecrawl error (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    if (!data.success) {
        throw new Error(`Firecrawl failed: ${data.error || "unknown error"}`);
    }

    return {
        markdown: data.data?.markdown || "",
        metadata: data.data?.metadata || {},
    };
}

// ── Fallback: fetch raw HTML + extract basics ───────────────────

async function scrapeRawFallback(url: string): Promise<FirecrawlResult> {
    const resp = await fetch(url, {
        headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
        redirect: "follow",
    });

    if (!resp.ok) {
        throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    }

    const html = await resp.text();

    // Extract basic metadata from HTML
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*?)"/i);
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*?)"/i);
    const faviconMatch = html.match(/<link[^>]+rel="(?:shortcut )?icon"[^>]+href="([^"]*?)"/i);

    // Strip tags for a rough markdown version
    const textContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 15000); // Limit for LLM context

    return {
        markdown: textContent,
        metadata: {
            title: titleMatch?.[1]?.trim(),
            description: descMatch?.[1]?.trim(),
            ogImage: ogImageMatch?.[1]?.trim(),
            favicon: faviconMatch?.[1]?.trim(),
        },
    };
}

// ── CSS color extraction from raw HTML ──────────────────────────

async function extractColorsFromUrl(url: string): Promise<string[]> {
    try {
        const resp = await fetch(url, {
            headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
            redirect: "follow",
        });
        if (!resp.ok) return [];
        const html = await resp.text();

        // Extract hex colors from inline styles and CSS
        const hexColors = new Set<string>();
        const hexPattern = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
        let match;
        while ((match = hexPattern.exec(html)) !== null) {
            hexColors.add(match[0].toLowerCase());
        }

        // Filter out common non-brand colors
        const ignore = new Set(["#000000", "#ffffff", "#fff", "#000", "#333", "#666", "#999", "#ccc", "#eee", "#ddd", "#aaa", "#bbb"]);
        return [...hexColors].filter((c) => !ignore.has(c)).slice(0, 10);
    } catch {
        return [];
    }
}

// ── GPT-4o extraction ───────────────────────────────────────────

interface ExtractedBrand {
    company_name: string;
    primary_color: string;
    secondary_color: string;
    font_family: string;
    logo_url: string;
    favicon_url: string;
    tagline: string;
}

interface ExtractedPeptide {
    name: string;
    price: number | null;
    description: string;
    image_url: string;
    confidence: number;
}

interface ExtractionResult {
    brand: ExtractedBrand;
    peptides: ExtractedPeptide[];
}

async function extractWithLlm(
    markdown: string,
    metadata: FirecrawlResult["metadata"],
    colors: string[],
    url: string
): Promise<ExtractionResult> {
    const systemPrompt = `You are a data extraction specialist. You analyze website content and extract structured brand identity and product catalog information.

You will be given the text content of a peptide company's website, metadata, and detected CSS colors. Extract:

1. BRAND IDENTITY:
   - company_name: The business name
   - primary_color: Their main brand color as hex (pick from detected colors or infer from context)
   - secondary_color: Secondary/accent color as hex
   - font_family: Their font family (if detectable, otherwise suggest a fitting one like "Inter", "Montserrat", etc.)
   - logo_url: URL of their logo image if found in content
   - favicon_url: URL of their favicon
   - tagline: Their tagline or slogan

2. PEPTIDE CATALOG:
   For each peptide product found, extract:
   - name: Product name (cleaned, just the peptide name like "BPC-157", "TB-500", etc.)
   - price: Price as a number (null if not found). Use the most common/standard price, not bulk.
   - description: Brief description
   - image_url: Product image URL if found
   - confidence: 0-1 score. 1.0 = clearly a peptide product with price. 0.5 = product found but price unclear. 0.3 = mentioned but not clearly a product listing.

Return ONLY valid JSON in this exact format:
{
  "brand": { "company_name": "", "primary_color": "", "secondary_color": "", "font_family": "", "logo_url": "", "favicon_url": "", "tagline": "" },
  "peptides": [{ "name": "", "price": null, "description": "", "image_url": "", "confidence": 0 }]
}

If no peptides found, return empty array. If brand info unclear, make best guesses based on context.`;

    const userContent = `Website URL: ${url}
Title: ${metadata?.title || "Unknown"}
Description: ${metadata?.description || "None"}
OG Image: ${metadata?.ogImage || "None"}
Favicon: ${metadata?.favicon || "None"}
Detected CSS Colors: ${colors.length > 0 ? colors.join(", ") : "None detected"}

--- PAGE CONTENT ---
${markdown.slice(0, 12000)}`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
        }),
    });

    if (!resp.ok) {
        throw new Error(`OpenAI error: ${resp.status}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("No response from extraction LLM");
    }

    const parsed = JSON.parse(content) as ExtractionResult;

    // Resolve relative URLs
    const baseUrl = new URL(url).origin;
    if (parsed.brand.logo_url && !parsed.brand.logo_url.startsWith("http")) {
        parsed.brand.logo_url = `${baseUrl}${parsed.brand.logo_url.startsWith("/") ? "" : "/"}${parsed.brand.logo_url}`;
    }
    if (parsed.brand.favicon_url && !parsed.brand.favicon_url.startsWith("http")) {
        parsed.brand.favicon_url = `${baseUrl}${parsed.brand.favicon_url.startsWith("/") ? "" : "/"}${parsed.brand.favicon_url}`;
    } else if (!parsed.brand.favicon_url && metadata?.favicon) {
        const fav = metadata.favicon;
        parsed.brand.favicon_url = fav.startsWith("http") ? fav : `${baseUrl}${fav.startsWith("/") ? "" : "/"}${fav}`;
    }

    for (const p of parsed.peptides) {
        if (p.image_url && !p.image_url.startsWith("http")) {
            p.image_url = `${baseUrl}${p.image_url.startsWith("/") ? "" : "/"}${p.image_url}`;
        }
    }

    return parsed;
}

// ── Main handler ────────────────────────────────────────────────

Deno.serve(withErrorReporting("scrape-brand", async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    try {
        // Auth — require admin role
        const { user, orgId, supabase } = await authenticateRequest(req, {
            requireRole: ["admin", "super_admin"],
        });

        const body = await req.json();
        const rawUrl = sanitizeString(body.url, 2000);
        if (!rawUrl) {
            return jsonResponse({ error: "url is required" }, 400, corsHeaders);
        }

        // Validate URL format
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
        } catch {
            return jsonResponse({ error: "Invalid URL format" }, 400, corsHeaders);
        }

        const url = parsedUrl.toString();
        const persist = body.persist !== false; // default: persist

        console.log(`[scrape-brand] Scraping ${url} for org ${orgId} (persist: ${persist})`);

        // Step 1: Scrape the website (Firecrawl with raw fallback)
        let scraped: FirecrawlResult;
        try {
            scraped = await scrapeWithFirecrawl(url);
        } catch (err) {
            console.warn(`[scrape-brand] Firecrawl failed, using fallback: ${(err as Error).message}`);
            scraped = await scrapeRawFallback(url);
        }

        // Step 2: Extract CSS colors from the page
        const colors = await extractColorsFromUrl(url);

        // Step 3: LLM extraction
        const extraction = await extractWithLlm(
            scraped.markdown,
            scraped.metadata,
            colors,
            url
        );

        // Step 4: Persist results if requested
        if (persist && orgId) {
            // Update tenant_config with brand data
            const brandUpdates: Record<string, unknown> = {
                website_url: url,
                scraped_brand_data: extraction,
            };

            if (extraction.brand.primary_color) {
                brandUpdates.primary_color = extraction.brand.primary_color;
            }
            if (extraction.brand.secondary_color) {
                brandUpdates.secondary_color = extraction.brand.secondary_color;
            }
            if (extraction.brand.font_family) {
                brandUpdates.font_family = extraction.brand.font_family;
            }
            if (extraction.brand.favicon_url) {
                brandUpdates.favicon_url = extraction.brand.favicon_url;
            }
            if (extraction.brand.logo_url) {
                brandUpdates.logo_url = extraction.brand.logo_url;
            }
            if (extraction.brand.company_name) {
                brandUpdates.brand_name = extraction.brand.company_name;
            }

            await supabase
                .from("tenant_config")
                .update(brandUpdates)
                .eq("org_id", orgId);

            // Insert scraped peptides for review
            if (extraction.peptides.length > 0) {
                const peptideRows = extraction.peptides.map((p) => ({
                    org_id: orgId,
                    name: p.name,
                    price: p.price,
                    description: p.description || "",
                    image_url: p.image_url || "",
                    source_url: url,
                    confidence: p.confidence,
                    status: "pending",
                    raw_data: p,
                }));

                const { error: pepErr } = await supabase
                    .from("scraped_peptides")
                    .insert(peptideRows);

                if (pepErr) {
                    console.error("[scrape-brand] Error inserting peptides:", pepErr);
                }
            }

            console.log(
                `[scrape-brand] Persisted: brand + ${extraction.peptides.length} peptides for org ${orgId}`
            );
        }

        return jsonResponse(
            {
                brand: extraction.brand,
                peptides: extraction.peptides,
                metadata: {
                    url,
                    title: scraped.metadata?.title || "",
                    persisted: persist,
                    colors_detected: colors.length,
                    peptides_found: extraction.peptides.length,
                },
            },
            200,
            corsHeaders
        );
    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error("[scrape-brand]", err);
        return jsonResponse(
            { error: (err as Error).message || "Internal error" },
            500,
            corsHeaders
        );
    }
}));
