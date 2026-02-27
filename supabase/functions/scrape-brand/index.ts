import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { sanitizeString } from "../_shared/validate.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * scrape-brand v4: Three-layer product discovery + brand extraction.
 *
 * Layer 1: Platform-native API (Shopify /products.json, WooCommerce Store API)
 *          Instant, 100% coverage for known platforms. FREE.
 *
 * Layer 2: Firecrawl v2 batch scrape (async)
 *          Covers ALL product pages. Returns job ID for frontend polling.
 *
 * Layer 3: Quick catalog scrape (fallback for unknown platforms)
 *          Scrapes homepage + catalog pages, LLM extracts products.
 *
 * POST /scrape-brand
 * Body: { url: string, persist?: boolean }
 * Auth: JWT (admin role)
 *
 * Response: {
 *   brand, peptides, platform, crawlJobId, metadata
 * }
 */

const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// ── Types ─────────────────────────────────────────────────────

type Platform = "shopify" | "woocommerce" | "unknown";

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
    source: "shopify" | "woocommerce" | "crawl" | "catalog";
}

interface HomepageResult {
    markdown: string;
    metadata: Record<string, string>;
}

// ── Utility ───────────────────────────────────────────────────

function stripHtml(html: string): string {
    if (!html) return "";
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// ── Platform Detection ────────────────────────────────────────

async function detectPlatform(
    origin: string,
): Promise<{ platform: Platform; apiBase?: string }> {
    // Try Shopify: /products.json is public on all Shopify stores
    try {
        const resp = await fetch(`${origin}/products.json?limit=1`, {
            headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
            redirect: "follow",
            signal: AbortSignal.timeout(6000),
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data.products && Array.isArray(data.products)) {
                console.log("[scrape-brand] Detected: Shopify");
                return { platform: "shopify" };
            }
        }
    } catch {
        /* not Shopify */
    }

    // Try WooCommerce Store API v1
    try {
        const resp = await fetch(
            `${origin}/wp-json/wc/store/v1/products?per_page=1`,
            {
                headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
                redirect: "follow",
                signal: AbortSignal.timeout(6000),
            },
        );
        if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data)) {
                console.log("[scrape-brand] Detected: WooCommerce (Store API v1)");
                return {
                    platform: "woocommerce",
                    apiBase: `${origin}/wp-json/wc/store/v1`,
                };
            }
        }
    } catch {
        /* not WooCommerce v1 */
    }

    // Try WooCommerce Store API (without v1 prefix)
    try {
        const resp = await fetch(
            `${origin}/wp-json/wc/store/products?per_page=1`,
            {
                headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
                redirect: "follow",
                signal: AbortSignal.timeout(6000),
            },
        );
        if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data)) {
                console.log("[scrape-brand] Detected: WooCommerce (Store API)");
                return {
                    platform: "woocommerce",
                    apiBase: `${origin}/wp-json/wc/store`,
                };
            }
        }
    } catch {
        /* not WooCommerce */
    }

    console.log("[scrape-brand] Platform: unknown");
    return { platform: "unknown" };
}

// ── Shopify Import ────────────────────────────────────────────

async function importFromShopify(origin: string): Promise<ExtractedPeptide[]> {
    const products: ExtractedPeptide[] = [];
    let page = 1;

    while (page <= 10) {
        try {
            const resp = await fetch(
                `${origin}/products.json?limit=250&page=${page}`,
                {
                    headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
                    signal: AbortSignal.timeout(15000),
                },
            );
            if (!resp.ok) break;

            const data = await resp.json();
            if (!data.products || data.products.length === 0) break;

            for (const p of data.products) {
                const price = p.variants?.[0]?.price
                    ? parseFloat(p.variants[0].price)
                    : null;
                products.push({
                    name: p.title || "",
                    price,
                    description: stripHtml(p.body_html || "").slice(0, 500),
                    image_url: p.images?.[0]?.src || "",
                    confidence: 1.0,
                    source: "shopify",
                });
            }

            console.log(
                `[scrape-brand] Shopify page ${page}: ${data.products.length} products`,
            );
            if (data.products.length < 250) break;
            page++;
        } catch (err) {
            console.warn(
                `[scrape-brand] Shopify page ${page} failed: ${(err as Error).message}`,
            );
            break;
        }
    }

    console.log(`[scrape-brand] Shopify total: ${products.length} products`);
    return products;
}

// ── WooCommerce Import ────────────────────────────────────────

async function importFromWooCommerce(
    apiBase: string,
): Promise<ExtractedPeptide[]> {
    const products: ExtractedPeptide[] = [];
    let page = 1;

    while (page <= 10) {
        try {
            const resp = await fetch(
                `${apiBase}/products?per_page=100&page=${page}`,
                {
                    headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
                    signal: AbortSignal.timeout(15000),
                },
            );
            if (!resp.ok) break;

            const data = await resp.json();
            if (!Array.isArray(data) || data.length === 0) break;

            for (const p of data) {
                let price: number | null = null;
                if (p.prices?.price) {
                    const minorUnit = p.prices.currency_minor_unit ?? 2;
                    price =
                        parseInt(p.prices.price, 10) /
                        Math.pow(10, minorUnit);
                } else if (p.price) {
                    price = parseFloat(p.price);
                }

                products.push({
                    name: p.name || "",
                    price: price && price > 0 ? price : null,
                    description: stripHtml(
                        p.short_description || p.description || "",
                    ).slice(0, 500),
                    image_url:
                        p.images?.[0]?.src || p.images?.[0]?.thumbnail || "",
                    confidence: 1.0,
                    source: "woocommerce",
                });
            }

            console.log(
                `[scrape-brand] WooCommerce page ${page}: ${data.length} products`,
            );
            const totalPages = parseInt(
                resp.headers.get("X-WP-TotalPages") || "1",
                10,
            );
            if (page >= totalPages || data.length < 100) break;
            page++;
        } catch (err) {
            console.warn(
                `[scrape-brand] WooCommerce page ${page} failed: ${(err as Error).message}`,
            );
            break;
        }
    }

    console.log(
        `[scrape-brand] WooCommerce total: ${products.length} products`,
    );
    return products;
}

// ── Sitemap Discovery ─────────────────────────────────────────

async function discoverFromSitemap(baseUrl: string): Promise<string[]> {
    const origin = new URL(baseUrl).origin;
    const sitemapUrls = [
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
        `${origin}/sitemap-products.xml`,
        `${origin}/product-sitemap.xml`,
    ];

    const allUrls: string[] = [];

    for (const sitemapUrl of sitemapUrls) {
        try {
            const resp = await fetch(sitemapUrl, {
                headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
                redirect: "follow",
                signal: AbortSignal.timeout(8000),
            });
            if (!resp.ok) continue;

            const xml = await resp.text();
            const locMatches = xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
            for (const m of locMatches) {
                const u = m[1].trim();
                if (u && u.startsWith("http")) allUrls.push(u);
            }

            // Handle sitemap index (nested sitemaps)
            if (xml.includes("<sitemapindex")) {
                console.log(
                    `[scrape-brand] Found sitemap index with ${allUrls.length} child sitemaps`,
                );
                const childSitemaps = allUrls
                    .filter((u) => u.endsWith(".xml"))
                    .slice(0, 5);
                for (const childUrl of childSitemaps) {
                    try {
                        const childResp = await fetch(childUrl, {
                            headers: {
                                "User-Agent": "ThePeptideAI-Bot/1.0",
                            },
                            signal: AbortSignal.timeout(6000),
                        });
                        if (!childResp.ok) continue;
                        const childXml = await childResp.text();
                        const childLocs = childXml.matchAll(
                            /<loc>\s*(.*?)\s*<\/loc>/gi,
                        );
                        for (const cm of childLocs) {
                            const cu = cm[1].trim();
                            if (cu && cu.startsWith("http")) allUrls.push(cu);
                        }
                    } catch {
                        /* skip broken child sitemap */
                    }
                }
            }

            if (allUrls.length > 0) {
                console.log(
                    `[scrape-brand] Sitemap: ${allUrls.length} URLs from ${sitemapUrl}`,
                );
                break;
            }
        } catch {
            /* sitemap unavailable */
        }
    }

    return [...new Set(allUrls)];
}

// ── Firecrawl Map ─────────────────────────────────────────────

async function discoverViaFirecrawl(url: string): Promise<string[]> {
    if (!FIRECRAWL_API_KEY) return [];

    try {
        const resp = await fetch("https://api.firecrawl.dev/v1/map", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ url, limit: 200 }),
            signal: AbortSignal.timeout(15000),
        });

        if (!resp.ok) {
            console.warn(`[scrape-brand] Map failed: ${resp.status}`);
            return [];
        }

        const data = await resp.json();
        return data.links || [];
    } catch (err) {
        console.warn(
            `[scrape-brand] Map error: ${(err as Error).message}`,
        );
        return [];
    }
}

// ── Combined URL Discovery ────────────────────────────────────

async function discoverSiteUrls(url: string): Promise<string[]> {
    const sitemapUrls = await discoverFromSitemap(url);
    if (sitemapUrls.length > 10) {
        console.log(
            `[scrape-brand] Using sitemap (${sitemapUrls.length} URLs)`,
        );
        return sitemapUrls;
    }

    const firecrawlUrls = await discoverViaFirecrawl(url);
    const combined = [...new Set([...sitemapUrls, ...firecrawlUrls])];
    console.log(
        `[scrape-brand] Combined: ${sitemapUrls.length} sitemap + ${firecrawlUrls.length} Firecrawl = ${combined.length}`,
    );
    return combined;
}

// ── Product URL Filtering ─────────────────────────────────────

function filterProductUrls(urls: string[], baseUrl: string): string[] {
    const origin = new URL(baseUrl).origin;

    const productPatterns = [
        /\/product\//i,
        /\/products\//i,
        /\/shop\//i,
        /\/peptides?\//i,
        /\/collections\/[^/]+/i,
        /\/shop\/?$/i,
        /\/products\/?$/i,
        /\/all-products/i,
        /\/our-products/i,
        /\/catalog/i,
        /\/store\/?$/i,
        /\/peptides\/?$/i,
        /\/popular-peptides/i,
        /\/bundles/i,
        /\/browse/i,
        /\/inventory/i,
    ];

    const excludePatterns = [
        /\.(jpg|jpeg|png|gif|svg|css|js|pdf|xml|json|ico|woff2?|ttf|eot)$/i,
        /\/(cart|checkout|account|login|register|contact|about|faq|blog|privacy|terms|refund|shipping|my-account|wp-admin|wp-content|wp-includes|feed|author|tag$|page\/\d)/i,
    ];

    return [
        ...new Set(
            urls.filter((rawUrl) => {
                try {
                    const parsed = new URL(rawUrl);
                    if (parsed.origin !== origin) return false;
                    if (parsed.pathname === "/" || parsed.pathname === "")
                        return false;
                    if (excludePatterns.some((p) => p.test(parsed.pathname)))
                        return false;
                    return productPatterns.some((p) =>
                        p.test(parsed.pathname),
                    );
                } catch {
                    return false;
                }
            }),
        ),
    ];
}

// ── Homepage Scrape ───────────────────────────────────────────

async function scrapeHomepage(url: string): Promise<HomepageResult> {
    // Try Firecrawl first for clean markdown
    if (FIRECRAWL_API_KEY) {
        try {
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
                signal: AbortSignal.timeout(20000),
            });

            if (resp.ok) {
                const data = await resp.json();
                if (data.success) {
                    return {
                        markdown: data.data?.markdown || "",
                        metadata: data.data?.metadata || {},
                    };
                }
            }
        } catch {
            /* fallback below */
        }
    }

    // Raw fetch fallback
    const resp = await fetch(url, {
        headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
    });
    const html = await resp.text();

    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const descMatch = html.match(
        /<meta\s+name="description"\s+content="([^"]*?)"/i,
    );
    const ogImageMatch = html.match(
        /<meta\s+property="og:image"\s+content="([^"]*?)"/i,
    );
    const faviconMatch = html.match(
        /<link[^>]+rel="(?:shortcut )?icon"[^>]+href="([^"]*?)"/i,
    );

    const textContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 20000);

    return {
        markdown: textContent,
        metadata: {
            title: titleMatch?.[1]?.trim() || "",
            description: descMatch?.[1]?.trim() || "",
            ogImage: ogImageMatch?.[1]?.trim() || "",
            favicon: faviconMatch?.[1]?.trim() || "",
        },
    };
}

// ── CSS Color Extraction ──────────────────────────────────────

async function extractColorsFromUrl(url: string): Promise<string[]> {
    try {
        const resp = await fetch(url, {
            headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
            redirect: "follow",
            signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) return [];
        const html = await resp.text();

        const hexColors = new Set<string>();
        const hexPattern = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
        let match;
        while ((match = hexPattern.exec(html)) !== null) {
            hexColors.add(match[0].toLowerCase());
        }

        const ignore = new Set([
            "#000000",
            "#ffffff",
            "#fff",
            "#000",
            "#333",
            "#666",
            "#999",
            "#ccc",
            "#eee",
            "#ddd",
            "#aaa",
            "#bbb",
        ]);
        return [...hexColors].filter((c) => !ignore.has(c)).slice(0, 10);
    } catch {
        return [];
    }
}

// ── Brand Extraction (GPT-4o-mini) ────────────────────────────

async function extractBrand(
    homepageContent: string,
    metadata: Record<string, string>,
    colors: string[],
    url: string,
): Promise<ExtractedBrand> {
    const prompt = `Extract brand identity from this website.

Website: ${url}
Title: ${metadata.title || "Unknown"}
Description: ${metadata.description || "None"}
OG Image: ${metadata.ogImage || "None"}
Favicon: ${metadata.favicon || "None"}
Detected Colors: ${colors.join(", ") || "None"}

Homepage content:
${homepageContent.slice(0, 15000)}

Return ONLY valid JSON:
{
  "company_name": "Business Name",
  "primary_color": "#hex",
  "secondary_color": "#hex",
  "font_family": "Font Name",
  "logo_url": "url or empty string",
  "favicon_url": "url or empty string",
  "tagline": "Their slogan or empty string"
}`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
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
                    content:
                        "You extract brand identity from website content. Return only valid JSON. Pick colors from the detected list when possible.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) throw new Error(`Brand extraction failed: ${resp.status}`);

    const data = await resp.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    // Resolve relative URLs
    const origin = new URL(url).origin;
    if (parsed.logo_url && !parsed.logo_url.startsWith("http")) {
        parsed.logo_url = `${origin}${parsed.logo_url.startsWith("/") ? "" : "/"}${parsed.logo_url}`;
    }
    if (parsed.favicon_url && !parsed.favicon_url.startsWith("http")) {
        parsed.favicon_url = `${origin}${parsed.favicon_url.startsWith("/") ? "" : "/"}${parsed.favicon_url}`;
    } else if (!parsed.favicon_url && metadata.favicon) {
        const fav = metadata.favicon;
        parsed.favicon_url = fav.startsWith("http")
            ? fav
            : `${origin}${fav.startsWith("/") ? "" : "/"}${fav}`;
    }

    return parsed;
}

// ── Quick Catalog Scrape (fallback for unknown platforms) ─────

async function quickCatalogScrape(
    productUrls: string[],
    homepageMarkdown: string,
): Promise<ExtractedPeptide[]> {
    // Scrape up to 6 pages quickly via raw fetch
    const pagesToScrape = productUrls.slice(0, 6);
    const contents: string[] = [
        `=== HOMEPAGE ===\n${homepageMarkdown.slice(0, 12000)}`,
    ];

    const results = await Promise.allSettled(
        pagesToScrape.map(async (pageUrl) => {
            const resp = await fetch(pageUrl, {
                headers: { "User-Agent": "ThePeptideAI-Bot/1.0" },
                redirect: "follow",
                signal: AbortSignal.timeout(8000),
            });
            if (!resp.ok) return null;
            const html = await resp.text();
            return html
                .replace(/<script[\s\S]*?<\/script>/gi, "")
                .replace(/<style[\s\S]*?<\/style>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 10000);
        }),
    );

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === "fulfilled" && r.value) {
            contents.push(
                `\n=== PAGE: ${pagesToScrape[i]} ===\n${r.value}`,
            );
        }
    }

    const combined = contents.join("\n\n").slice(0, 80000);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Extract ALL peptide/research chemical products from website content. For EACH product:
- name: Clean product name (e.g., "BPC-157", "TB-500")
- price: Price as number (null if not found)
- description: Brief description (max 200 chars)
- image_url: Product image URL if found

Return ONLY valid JSON: { "products": [{ "name": "", "price": null, "description": "", "image_url": "" }] }

Include EVERY product mentioned anywhere — navigation, sidebars, grids, lists. Do NOT miss any.`,
                },
                {
                    role: "user",
                    content: `Content from ${contents.length} pages:\n\n${combined}`,
                },
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(45000),
    });

    if (!resp.ok) {
        console.error(
            `[scrape-brand] Quick catalog extraction failed: ${resp.status}`,
        );
        return [];
    }

    const data = await resp.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return (parsed.products || []).map(
        (p: { name: string; price: number | null; description: string; image_url: string }) => ({
            name: p.name || "",
            price: p.price,
            description: p.description || "",
            image_url: p.image_url || "",
            confidence: p.price ? 0.8 : 0.5,
            source: "catalog" as const,
        }),
    );
}

// ── Firecrawl v2 Batch Scrape (async, fire-and-forget) ────────

async function startBatchScrape(urls: string[]): Promise<string | null> {
    if (!FIRECRAWL_API_KEY || urls.length === 0) return null;

    try {
        // Cap at 100 URLs to stay within reasonable credit usage
        const batchUrls = urls.slice(0, 100);

        const resp = await fetch("https://api.firecrawl.dev/v2/batch/scrape", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                urls: batchUrls,
                formats: ["markdown"],
            }),
            signal: AbortSignal.timeout(10000),
        });

        if (!resp.ok) {
            const err = await resp.text();
            console.error(
                `[scrape-brand] Batch scrape start failed: ${resp.status} ${err}`,
            );
            return null;
        }

        const data = await resp.json();
        if (data.success && data.id) {
            console.log(
                `[scrape-brand] Batch scrape started: ${data.id} (${batchUrls.length} URLs)`,
            );
            return data.id;
        }
        return null;
    } catch (err) {
        console.error(
            `[scrape-brand] Batch scrape error: ${(err as Error).message}`,
        );
        return null;
    }
}

// ── Deduplication ─────────────────────────────────────────────

function deduplicatePeptides(
    peptides: ExtractedPeptide[],
): ExtractedPeptide[] {
    const seen = new Map<string, ExtractedPeptide>();
    for (const p of peptides) {
        const key = p.name
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
        if (!key) continue;

        const existing = seen.get(key);
        if (
            !existing ||
            p.confidence > existing.confidence ||
            (p.price && !existing.price)
        ) {
            seen.set(key, p);
        }
    }
    return [...seen.values()];
}

// ── Main Handler ──────────────────────────────────────────────

Deno.serve(
    withErrorReporting("scrape-brand", async (req) => {
        const corsHeaders = getCorsHeaders(req);
        const preflight = handleCors(req);
        if (preflight) return preflight;

        try {
            const { orgId, supabase } = await authenticateRequest(req, {
                requireRole: ["admin", "super_admin"],
            });

            const body = await req.json();
            const rawUrl = sanitizeString(body.url, 2000);
            if (!rawUrl) {
                return jsonResponse(
                    { error: "url is required" },
                    400,
                    corsHeaders,
                );
            }

            let parsedUrl: URL;
            try {
                parsedUrl = new URL(
                    rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`,
                );
            } catch {
                return jsonResponse(
                    { error: "Invalid URL format" },
                    400,
                    corsHeaders,
                );
            }

            const url = parsedUrl.toString();
            const origin = parsedUrl.origin;
            const persist = body.persist !== false;

            console.log(
                `[scrape-brand] v4 starting: ${url} (org: ${orgId}, persist: ${persist})`,
            );

            // ══════════════════════════════════════════════════════
            // Phase 1: Parallel discovery
            // ══════════════════════════════════════════════════════

            const [platformInfo, siteUrls, homepage, colors] =
                await Promise.all([
                    detectPlatform(origin),
                    discoverSiteUrls(url),
                    scrapeHomepage(url),
                    extractColorsFromUrl(url),
                ]);

            const { platform, apiBase } = platformInfo;
            console.log(
                `[scrape-brand] Platform: ${platform} | URLs: ${siteUrls.length} | Colors: ${colors.length}`,
            );

            // ══════════════════════════════════════════════════════
            // Phase 2: Import products (native API or catalog scrape)
            // ══════════════════════════════════════════════════════

            let nativeProducts: ExtractedPeptide[] = [];

            if (platform === "shopify") {
                nativeProducts = await importFromShopify(origin);
            } else if (platform === "woocommerce" && apiBase) {
                nativeProducts = await importFromWooCommerce(apiBase);
            }

            const productUrls = filterProductUrls(siteUrls, url);

            // For unknown platforms, quick-scrape for immediate results
            if (platform === "unknown" && nativeProducts.length === 0) {
                console.log(
                    `[scrape-brand] Unknown platform — quick catalog scrape (${productUrls.length} product URLs found)`,
                );
                nativeProducts = await quickCatalogScrape(
                    productUrls,
                    homepage.markdown,
                );
            }

            console.log(
                `[scrape-brand] Native products: ${nativeProducts.length}`,
            );

            // ══════════════════════════════════════════════════════
            // Phase 3: Brand extraction (GPT-4o-mini, fast + cheap)
            // ══════════════════════════════════════════════════════

            const brand = await extractBrand(
                homepage.markdown,
                homepage.metadata,
                colors,
                url,
            );
            console.log(`[scrape-brand] Brand: ${brand.company_name}`);

            // ══════════════════════════════════════════════════════
            // Phase 4: Start async batch scrape for verification
            // ══════════════════════════════════════════════════════

            const crawlJobId = await startBatchScrape(productUrls);

            // ══════════════════════════════════════════════════════
            // Phase 5: Deduplicate + persist
            // ══════════════════════════════════════════════════════

            const peptides = deduplicatePeptides(nativeProducts);

            if (persist && orgId) {
                // Update brand in tenant_config
                const brandUpdates: Record<string, unknown> = {
                    website_url: url,
                    scraped_brand_data: {
                        brand,
                        peptides,
                        platform,
                        crawlJobId,
                        scrapedAt: new Date().toISOString(),
                    },
                };

                if (brand.primary_color)
                    brandUpdates.primary_color = brand.primary_color;
                if (brand.secondary_color)
                    brandUpdates.secondary_color = brand.secondary_color;
                if (brand.font_family)
                    brandUpdates.font_family = brand.font_family;
                if (brand.favicon_url)
                    brandUpdates.favicon_url = brand.favicon_url;
                if (brand.logo_url)
                    brandUpdates.logo_url = brand.logo_url;
                if (brand.company_name)
                    brandUpdates.brand_name = brand.company_name;

                await supabase
                    .from("tenant_config")
                    .update(brandUpdates)
                    .eq("org_id", orgId);

                // Insert products for review
                if (peptides.length > 0) {
                    const rows = peptides.map((p) => ({
                        org_id: orgId,
                        name: p.name,
                        price: p.price,
                        description: p.description || "",
                        image_url: p.image_url || "",
                        source_url: url,
                        confidence: p.confidence,
                        status: "pending",
                        raw_data: { ...p, platform, crawlJobId },
                    }));

                    const { error } = await supabase
                        .from("scraped_peptides")
                        .insert(rows);
                    if (error)
                        console.error(
                            "[scrape-brand] Insert error:",
                            error,
                        );
                }

                console.log(
                    `[scrape-brand] Persisted: brand + ${peptides.length} products`,
                );
            }

            return jsonResponse(
                {
                    brand,
                    peptides,
                    platform,
                    crawlJobId,
                    metadata: {
                        url,
                        title: homepage.metadata.title || "",
                        persisted: persist,
                        platform,
                        nativeProductCount: nativeProducts.length,
                        deduplicatedCount: peptides.length,
                        productUrlsFound: productUrls.length,
                        siteUrlsDiscovered: siteUrls.length,
                        colorsDetected: colors.length,
                        crawlJobStarted: !!crawlJobId,
                    },
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
            console.error("[scrape-brand]", err);
            return jsonResponse(
                { error: (err as Error).message || "Internal error" },
                500,
                corsHeaders,
            );
        }
    }),
);
