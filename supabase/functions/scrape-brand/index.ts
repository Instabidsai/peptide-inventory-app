import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { sanitizeString } from "../_shared/validate.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * scrape-brand: Extract brand identity + peptide catalog from a website URL.
 *
 * Uses Firecrawl to discover & scrape MULTIPLE pages, then GPT-4o to extract.
 * Returns: { brand, peptides } — brand info + full product catalog.
 *
 * Flow:
 * 1. Map the site (Firecrawl /v1/map) → discover all URLs
 * 2. Filter for product/shop/catalog pages
 * 3. Scrape homepage (brand) + product pages (catalog)
 * 4. GPT-4o extraction with combined content from all pages
 * 5. Deduplicate peptides by normalized name
 *
 * POST /scrape-brand
 * Body: { url: string, persist?: boolean }
 * Auth: JWT (admin role)
 */

const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const MAX_PRODUCT_PAGES = 5;
const CONTENT_LIMIT_PER_PAGE = 15000;
const TOTAL_CONTENT_LIMIT = 50000;

// ── Firecrawl scrape (single page) ──────────────────────────────

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

// ── Firecrawl map (discover all site URLs) ──────────────────────

async function discoverSiteUrls(url: string): Promise<string[]> {
    if (!FIRECRAWL_API_KEY) return [];

    try {
        const resp = await fetch("https://api.firecrawl.dev/v1/map", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                url,
                limit: 200,
            }),
        });

        if (!resp.ok) {
            console.warn(`[scrape-brand] Map endpoint failed: ${resp.status}`);
            return [];
        }

        const data = await resp.json();
        return data.links || [];
    } catch (err) {
        console.warn(`[scrape-brand] Map failed: ${(err as Error).message}`);
        return [];
    }
}

// ── Filter URLs for product/shop pages ──────────────────────────

function selectProductPages(urls: string[], baseUrl: string): string[] {
    const origin = new URL(baseUrl).origin;

    // Patterns that indicate a page listing products (high priority = catalog pages)
    const catalogPatterns = [
        /\/shop\/?$/i,
        /\/products\/?$/i,
        /\/all-products\/?$/i,
        /\/our-products\/?$/i,
        /\/catalog\/?$/i,
        /\/store\/?$/i,
        /\/peptides\/?$/i,
        /\/collections\/?$/i,
        /\/collections\/all\/?$/i,
        /\/product-category\/?/i,
    ];

    // Patterns for individual product pages (lower priority — many of these)
    const productPagePatterns = [
        /\/product\//i,
        /\/products\//i,
        /\/shop\//i,
        /\/peptides?\//i,
        /\/collections\/[^/]+\/?$/i,
    ];

    const catalogPages: string[] = [];
    const productPages: string[] = [];

    for (const rawUrl of urls) {
        try {
            const parsed = new URL(rawUrl);
            // Only same-origin pages
            if (parsed.origin !== origin) continue;
            // Skip the homepage itself
            if (parsed.pathname === "/" || parsed.pathname === "") continue;
            // Skip non-content pages
            if (/\.(jpg|jpeg|png|gif|svg|css|js|pdf|xml|json|ico)$/i.test(parsed.pathname)) continue;
            if (/\/(cart|checkout|account|login|register|contact|about|faq|blog|privacy|terms|refund|shipping-policy)/i.test(parsed.pathname)) continue;

            const isCatalog = catalogPatterns.some(p => p.test(parsed.pathname));
            const isProduct = productPagePatterns.some(p => p.test(parsed.pathname));

            if (isCatalog) {
                catalogPages.push(rawUrl);
            } else if (isProduct) {
                productPages.push(rawUrl);
            }
        } catch {
            // Invalid URL, skip
        }
    }

    // Prioritize catalog/listing pages first, then individual product pages
    const selected = [...catalogPages];

    // If we have catalog pages, add a few individual product pages for completeness
    // If no catalog pages found, rely more on individual product pages
    const remainingSlots = MAX_PRODUCT_PAGES - selected.length;
    if (remainingSlots > 0) {
        selected.push(...productPages.slice(0, remainingSlots));
    }

    console.log(`[scrape-brand] Found ${catalogPages.length} catalog pages, ${productPages.length} product pages → selected ${selected.length}`);
    return selected;
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

    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*?)"/i);
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*?)"/i);
    const faviconMatch = html.match(/<link[^>]+rel="(?:shortcut )?icon"[^>]+href="([^"]*?)"/i);

    const textContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, CONTENT_LIMIT_PER_PAGE);

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

        const hexColors = new Set<string>();
        const hexPattern = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
        let match;
        while ((match = hexPattern.exec(html)) !== null) {
            hexColors.add(match[0].toLowerCase());
        }

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
    allContent: string,
    metadata: FirecrawlResult["metadata"],
    colors: string[],
    url: string,
    pagesScraped: number
): Promise<ExtractionResult> {
    const systemPrompt = `You are a data extraction specialist. You analyze website content and extract structured brand identity and product catalog information.

You will be given the COMBINED text content from MULTIPLE pages of a peptide company's website (homepage + product/shop pages), metadata, and detected CSS colors.

IMPORTANT: The content comes from ${pagesScraped} page(s) of the site. Extract EVERY product you can find across ALL pages. Do NOT miss any products.

Extract:

1. BRAND IDENTITY:
   - company_name: The business name
   - primary_color: Their main brand color as hex (pick from detected colors or infer from context)
   - secondary_color: Secondary/accent color as hex
   - font_family: Their font family (if detectable, otherwise suggest a fitting one like "Inter", "Montserrat", etc.)
   - logo_url: URL of their logo image if found in content
   - favicon_url: URL of their favicon
   - tagline: Their tagline or slogan

2. PEPTIDE CATALOG:
   For EVERY peptide/product found across ALL pages, extract:
   - name: Product name (cleaned, just the peptide name like "BPC-157", "TB-500", etc.)
   - price: Price as a number (null if not found). Use the most common/standard price, not bulk.
   - description: Brief description
   - image_url: Product image URL if found
   - confidence: 0-1 score. 1.0 = clearly a peptide product with price. 0.5 = product found but price unclear. 0.3 = mentioned but not clearly a product listing.

   CRITICAL: Extract ALL unique products. If a product appears on multiple pages, include it only once (use the entry with the most detail/highest confidence). Err on the side of including more products rather than fewer.

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
Pages scraped: ${pagesScraped}

--- COMBINED PAGE CONTENT (${pagesScraped} pages) ---
${allContent.slice(0, TOTAL_CONTENT_LIMIT)}`;

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

// ── Deduplicate peptides by normalized name ──────────────────────

function deduplicatePeptides(peptides: ExtractedPeptide[]): ExtractedPeptide[] {
    const seen = new Map<string, ExtractedPeptide>();

    for (const p of peptides) {
        // Normalize: lowercase, remove extra spaces, strip dosage variants
        const key = p.name
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();

        const existing = seen.get(key);
        if (!existing || p.confidence > existing.confidence) {
            seen.set(key, p);
        }
    }

    return [...seen.values()];
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

        // ══════════════════════════════════════════════════════════
        // Step 1: Discover site structure + scrape homepage in parallel
        // ══════════════════════════════════════════════════════════

        const [homepageResult, siteUrls, colors] = await Promise.all([
            scrapeWithFirecrawl(url).catch(async (err) => {
                console.warn(`[scrape-brand] Firecrawl failed, using fallback: ${(err as Error).message}`);
                return scrapeRawFallback(url);
            }),
            discoverSiteUrls(url),
            extractColorsFromUrl(url),
        ]);

        console.log(`[scrape-brand] Homepage scraped (${homepageResult.markdown.length} chars), discovered ${siteUrls.length} URLs`);

        // ══════════════════════════════════════════════════════════
        // Step 2: Select and scrape product pages
        // ══════════════════════════════════════════════════════════

        const productPageUrls = selectProductPages(siteUrls, url);
        const allPageContents: string[] = [];

        // Always include homepage content first
        allPageContents.push(
            `=== PAGE: Homepage (${url}) ===\n${homepageResult.markdown.slice(0, CONTENT_LIMIT_PER_PAGE)}`
        );

        // Scrape product pages sequentially (to avoid rate limits)
        for (const pageUrl of productPageUrls) {
            try {
                console.log(`[scrape-brand] Scraping product page: ${pageUrl}`);
                const pageResult = await scrapeWithFirecrawl(pageUrl);
                if (pageResult.markdown.length > 100) {
                    allPageContents.push(
                        `\n=== PAGE: ${pageUrl} ===\n${pageResult.markdown.slice(0, CONTENT_LIMIT_PER_PAGE)}`
                    );
                }
            } catch (err) {
                console.warn(`[scrape-brand] Failed to scrape ${pageUrl}: ${(err as Error).message}`);
            }
        }

        const pagesScraped = allPageContents.length;
        const combinedContent = allPageContents.join("\n\n");

        console.log(`[scrape-brand] Total content from ${pagesScraped} pages: ${combinedContent.length} chars`);

        // ══════════════════════════════════════════════════════════
        // Step 3: LLM extraction from ALL pages combined
        // ══════════════════════════════════════════════════════════

        const extraction = await extractWithLlm(
            combinedContent,
            homepageResult.metadata,
            colors,
            url,
            pagesScraped
        );

        // Deduplicate peptides
        extraction.peptides = deduplicatePeptides(extraction.peptides);

        console.log(`[scrape-brand] Extracted: brand + ${extraction.peptides.length} unique peptides from ${pagesScraped} pages`);

        // ══════════════════════════════════════════════════════════
        // Step 4: Persist results if requested
        // ══════════════════════════════════════════════════════════

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
                    title: homepageResult.metadata?.title || "",
                    persisted: persist,
                    colors_detected: colors.length,
                    peptides_found: extraction.peptides.length,
                    pages_scraped: pagesScraped,
                    product_pages_found: productPageUrls.length,
                    site_urls_discovered: siteUrls.length,
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
