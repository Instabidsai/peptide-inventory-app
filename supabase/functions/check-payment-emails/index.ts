import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.86.1";

import { authenticateCron, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * check-payment-emails — Cron-triggered payment email scanner.
 * Auth: CRON_SECRET header.
 * Scans Gmail via Composio for payment emails (Venmo, CashApp, Zelle, Psifi),
 * matches them to contacts, and auto-posts or queues for review.
 */

// ── Email sender patterns ──────────────────────────────────────────
interface SenderPattern {
    method: string;
    fromAddresses: string[];
    gmailFrom: string;
}

const SENDER_PATTERNS: SenderPattern[] = [
    {
        method: 'venmo',
        fromAddresses: ['venmo@venmo.com'],
        gmailFrom: 'venmo@venmo.com',
    },
    {
        method: 'cashapp',
        fromAddresses: ['cash@square.com', 'cashapp@cash.app', 'no-reply@cash.app'],
        gmailFrom: 'cash@square.com OR cashapp@cash.app OR no-reply@cash.app',
    },
    {
        method: 'zelle',
        fromAddresses: ['no-reply@zellepay.com', 'alerts@notify.zelle.com', 'alerts@notify.wellsfargo.com'],
        gmailFrom: 'no-reply@zellepay.com OR alerts@notify.zelle.com OR alerts@notify.wellsfargo.com',
    },
    {
        method: 'psifi',
        fromAddresses: ['no-reply@psifi.app', 'payments@psifi.app'],
        gmailFrom: 'no-reply@psifi.app OR payments@psifi.app',
    },
];

// ── Parsing helpers ────────────────────────────────────────────────

function detectMethod(from: string): string | null {
    const lower = from.toLowerCase();
    for (const sp of SENDER_PATTERNS) {
        if (sp.fromAddresses.some(addr => lower.includes(addr))) return sp.method;
    }
    return null;
}

function extractAmount(text: string): number | null {
    const match = text.match(/\$\s?([\d,]+\.\d{2})/);
    if (!match) return null;
    return parseFloat(match[1].replace(/,/g, ''));
}

function extractSenderName(text: string, method: string): string | null {
    const cleaned = text.replace(/\s+/g, ' ').trim();

    if (method === 'venmo') {
        let m = cleaned.match(/^(.+?)\s+paid you/i);
        if (m) return m[1].trim();
        m = cleaned.match(/paid .+? by\s+(.+?)(?:\s+on|\s+\$|$)/i);
        if (m) return m[1].trim();
        m = cleaned.match(/(.+?)\s+paid\s+you/i);
        if (m) return m[1].trim();
    }

    if (method === 'cashapp') {
        let m = cleaned.match(/(.+?)\s+sent you/i);
        if (m) return m[1].trim();
        m = cleaned.match(/received .+? from\s+(.+?)(?:\s+on|\.|$)/i);
        if (m) return m[1].trim();
    }

    if (method === 'zelle') {
        const wfCleaned = cleaned
            .replace(/You received money with Zelle\s*\(R\)\s*/i, '')
            .replace(/Wells Fargo home page\s*/i, '');
        let m = wfCleaned.match(/^(.+?)\s+sent you\s+\$/i);
        if (m) return m[1].trim();
        m = cleaned.match(/received .+? from\s+(.+?)(?:\s+on|\.|$)/i);
        if (m) return m[1].trim();
        m = cleaned.match(/(.+?)\s+sent you/i);
        if (m) return m[1].trim();
        m = cleaned.match(/payment from\s+(.+?)(?:\s+on|\.|$)/i);
        if (m) return m[1].trim();
    }

    if (method === 'psifi') {
        let m = cleaned.match(/from\s+(@\S+)/i);
        if (m) return m[1].trim();
        m = cleaned.match(/payment from\s+(.+?)(?:\s+|\.|!|$)/i);
        if (m) return m[1].trim();
    }

    return null;
}

// ── Contact matching ───────────────────────────────────────────────

interface MatchResult {
    contactId: string | null;
    confidence: 'high' | 'medium' | 'low';
}

async function matchContact(
    supabase: ReturnType<typeof createClient>,
    senderName: string | null,
    orgId: string,
): Promise<MatchResult> {
    if (!senderName) return { contactId: null, confidence: 'low' };

    const name = senderName.trim();

    const { data: exact } = await supabase
        .from('contacts')
        .select('id')
        .eq('org_id', orgId)
        .ilike('name', name)
        .limit(1);

    if (exact?.length) {
        return { contactId: exact[0].id, confidence: 'high' };
    }

    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
        const firstName = parts[0];
        const lastName = parts[parts.length - 1];
        const { data: partial } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('org_id', orgId)
            .or(`name.ilike.%${firstName}%${lastName}%,name.ilike.%${lastName}%${firstName}%`)
            .limit(3);

        if (partial?.length === 1) {
            return { contactId: partial[0].id, confidence: 'high' };
        }
        if (partial?.length) {
            return { contactId: partial[0].id, confidence: 'medium' };
        }
    }

    if (parts.length >= 1) {
        const { data: firstOnly } = await supabase
            .from('contacts')
            .select('id')
            .eq('org_id', orgId)
            .ilike('name', `${parts[0]}%`)
            .limit(3);

        if (firstOnly?.length === 1) {
            return { contactId: firstOnly[0].id, confidence: 'medium' };
        }
    }

    return { contactId: null, confidence: 'low' };
}

// ── Movement matching ──────────────────────────────────────────────

async function matchUnpaidMovement(
    supabase: ReturnType<typeof createClient>,
    contactId: string,
    amount: number,
    orgId: string,
): Promise<string | null> {
    const { data: movements } = await supabase
        .from('movements')
        .select('id, movement_items(price_at_sale)')
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .in('payment_status', ['unpaid', 'partial'])
        .order('movement_date', { ascending: false })
        .limit(10);

    if (!movements?.length) return null;

    for (const mov of movements) {
        const movTotal = ((mov.movement_items as { price_at_sale: number }[]) || []).reduce(
            (sum: number, item) => sum + (Number(item.price_at_sale) || 0),
            0,
        );
        if (Math.abs(movTotal - amount) <= 0.50) {
            return mov.id;
        }
    }

    return null;
}

// ── Alias lookup ──────────────────────────────────────────────────

async function matchAlias(
    supabase: ReturnType<typeof createClient>,
    senderName: string | null,
    orgId: string,
): Promise<MatchResult> {
    if (!senderName) return { contactId: null, confidence: 'low' };

    const { data: alias } = await supabase
        .from('sender_aliases')
        .select('contact_id')
        .eq('org_id', orgId)
        .ilike('sender_name', senderName.trim())
        .limit(1);

    if (alias?.length) {
        return { contactId: alias[0].contact_id, confidence: 'high' };
    }
    return { contactId: null, confidence: 'low' };
}

// ── Fuzzy matching ───────────────────────────────────────────────

function normalizeName(name: string): string {
    return name
        .replace(/,?\s*(LLC|INC|CORP|LTD|CO)\b\.?/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

async function fuzzyMatchContact(
    supabase: ReturnType<typeof createClient>,
    senderName: string | null,
    orgId: string,
): Promise<MatchResult> {
    if (!senderName) return { contactId: null, confidence: 'low' };

    const normalized = normalizeName(senderName);
    const parts = normalized.split(/\s+/);

    const { data: companyMatch } = await supabase
        .from('contacts')
        .select('id, name, company')
        .eq('org_id', orgId)
        .ilike('company', `%${normalized}%`)
        .limit(3);

    if (companyMatch?.length === 1) {
        return { contactId: companyMatch[0].id, confidence: 'high' };
    }

    if (parts.length >= 1 && parts[0].length >= 4) {
        const prefix = parts[0].substring(0, 4);
        const lastName = parts.length >= 2 ? parts[parts.length - 1] : null;

        let query = supabase
            .from('contacts')
            .select('id, name')
            .eq('org_id', orgId)
            .ilike('name', `${prefix}%`);

        if (lastName) {
            query = query.ilike('name', `%${lastName}%`);
        }

        const { data: prefixMatch } = await query.limit(3);

        if (prefixMatch?.length === 1) {
            return { contactId: prefixMatch[0].id, confidence: 'high' };
        }
        if (prefixMatch?.length && prefixMatch.length <= 3) {
            return { contactId: prefixMatch[0].id, confidence: 'medium' };
        }
    }

    return { contactId: null, confidence: 'low' };
}

// ── AI matching (GPT-4o-mini) ─────────────────────────────────────

interface AiMatchResult {
    contactId: string | null;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
}

async function aiMatchContact(
    senderName: string | null,
    amount: number,
    method: string,
    contacts: { id: string; name: string; company: string | null }[],
): Promise<AiMatchResult> {
    if (!senderName || !contacts.length) {
        return { contactId: null, confidence: 'low', reasoning: 'No sender name or no contacts' };
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
        return { contactId: null, confidence: 'low', reasoning: 'OPENAI_API_KEY not set' };
    }

    try {
        const openai = new OpenAI({ apiKey: openaiKey });
        const contactList = contacts.map(c => ({
            id: c.id,
            name: c.name,
            company: c.company || undefined,
        }));

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You match payment email sender names to a list of known contacts. Sender names may be ALL CAPS, have nicknames (e.g. "ROCK" = "Rocky"), or be company names. Return JSON: {"contact_id": "the-uuid-or-null", "confidence": "high|medium|low", "reasoning": "one sentence why"}. Return null if no reasonable match.`,
                },
                {
                    role: 'user',
                    content: `Payment sender: "${senderName}" ($${amount} via ${method})\n\nKnown contacts:\n${JSON.stringify(contactList)}`,
                },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 150,
            temperature: 0,
        });

        const content = completion.choices?.[0]?.message?.content;
        if (!content) return { contactId: null, confidence: 'low', reasoning: 'Empty AI response' };

        const parsed = JSON.parse(content);
        const matchedId = parsed.contact_id || null;
        const conf = (['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low') as 'high' | 'medium' | 'low';
        const reasoning = parsed.reasoning || '';

        if (matchedId && !contacts.some(c => c.id === matchedId)) {
            return { contactId: null, confidence: 'low', reasoning: 'AI returned invalid contact ID' };
        }

        return { contactId: matchedId, confidence: conf, reasoning };
    } catch (err: unknown) {
        console.error('[check-payment-emails] AI match error:', (err as Error).message);
        return { contactId: null, confidence: 'low', reasoning: `AI error: ${(err as Error).message}` };
    }
}

// ── Main handler ───────────────────────────────────────────────────

Deno.serve(withErrorReporting("check-payment-emails", async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    try {
        // Auth: CRON_SECRET only
        const supabase = authenticateCron(req);

        // Rate limit: 1 req/min (cron)
        const rl = checkRateLimit('cron:check-payment-emails', { maxRequests: 1, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

        const composioApiKey = Deno.env.get('COMPOSIO_API_KEY');
        if (!composioApiKey) return jsonResponse({ error: 'COMPOSIO_API_KEY not configured' }, 500, corsHeaders);

        // Get all orgs with payment_scanner enabled
        const { data: modules, error: modErr } = await supabase
            .from('automation_modules')
            .select('*')
            .eq('module_type', 'payment_scanner')
            .eq('enabled', true);

        if (modErr) return jsonResponse({ error: modErr.message }, 500, corsHeaders);
        if (!modules?.length) return jsonResponse({ message: 'No orgs have payment scanner enabled', processed: 0 }, 200, corsHeaders);

        const allResults: {
            org_id: string;
            emails_found?: number;
            processed?: number;
            auto_posted?: number;
            queued?: number;
            skipped?: number;
            error?: string;
        }[] = [];

        for (const mod of modules) {
            const orgId = mod.org_id;
            const config = mod.config || {};
            const composioEntityId = config.composio_entity_id || 'default';

            const allFromAddresses = SENDER_PATTERNS.flatMap(sp => sp.fromAddresses);
            const fromFilter = allFromAddresses.map(a => `from:${a}`).join(' OR ');
            const gmailQuery = `(${fromFilter}) newer_than:7d`;

            let emails: { messageId?: string; id?: string; message_id?: string; sender?: string; from?: string; subject?: string; preview?: { body?: string } | string; snippet?: string; body?: string; text?: string; messageTimestamp?: string; internalDate?: string; date?: string }[] = [];
            try {
                const composioRes = await fetch(
                    'https://backend.composio.dev/api/v2/actions/GMAIL_FETCH_EMAILS/execute',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-API-KEY': composioApiKey,
                        },
                        body: JSON.stringify({
                            connectedAccountId: composioEntityId,
                            input: { query: gmailQuery, max_results: 20 },
                        }),
                    },
                );

                if (!composioRes.ok) {
                    const errText = await composioRes.text();
                    console.error(`[check-payment-emails] Composio error for org ${orgId}: ${errText}`);
                    allResults.push({ org_id: orgId, error: `Composio API error: ${composioRes.status}` });
                    continue;
                }

                const composioData = await composioRes.json();
                emails = composioData?.data?.emails
                    || composioData?.data?.messages
                    || composioData?.response_data?.emails
                    || composioData?.response_data?.messages
                    || [];

                if (!Array.isArray(emails)) {
                    if (composioData?.data && Array.isArray(composioData.data)) {
                        emails = composioData.data;
                    } else {
                        emails = [];
                    }
                }
            } catch (fetchErr: unknown) {
                console.error(`[check-payment-emails] Fetch error:`, (fetchErr as Error).message);
                allResults.push({ org_id: orgId, error: (fetchErr as Error).message });
                continue;
            }

            let processed = 0;
            let autoPosted = 0;
            let queued = 0;
            let skipped = 0;

            // Cache contacts for this org (avoids N+1 in AI match)
            let orgContacts: { id: string; name: string; company: string | null }[] | null = null;

            for (const email of emails) {
                const messageId = email.messageId || email.id || email.message_id;
                if (!messageId) continue;

                const { data: existing } = await supabase
                    .from('payment_email_queue')
                    .select('id')
                    .eq('org_id', orgId)
                    .eq('gmail_message_id', messageId)
                    .limit(1);

                if (existing?.length) { skipped++; continue; }

                const from = email.sender || email.from || '';
                const subject = email.subject || '';
                const previewBody = typeof email.preview === 'object' ? (email.preview?.body || '') : (email.preview || '');
                const snippet = previewBody || email.snippet || email.body || email.text || '';
                const emailDate = email.messageTimestamp
                    || (email.internalDate ? new Date(Number(email.internalDate)).toISOString() : null)
                    || email.date
                    || new Date().toISOString();

                const method = detectMethod(from);
                if (!method) { skipped++; continue; }

                const combinedText = `${subject} ${snippet}`;
                if (method === 'zelle' && /You sent money/i.test(subject)) { skipped++; continue; }

                const amount = extractAmount(combinedText);
                if (!amount || amount <= 0) { skipped++; continue; }

                const senderName = extractSenderName(combinedText, method);

                // Matching pipeline: alias -> exact -> fuzzy -> AI
                let contactMatch = await matchAlias(supabase, senderName, orgId);

                if (!contactMatch.contactId) {
                    contactMatch = await matchContact(supabase, senderName, orgId);
                }

                if (!contactMatch.contactId || contactMatch.confidence === 'low') {
                    const fuzzy = await fuzzyMatchContact(supabase, senderName, orgId);
                    if (fuzzy.contactId && (!contactMatch.contactId || fuzzy.confidence !== 'low')) {
                        contactMatch = fuzzy;
                    }
                }

                let aiSuggestedContactId: string | null = null;
                let aiReasoning: string | null = null;

                if (!contactMatch.contactId || contactMatch.confidence === 'low') {
                    if (!orgContacts) {
                        const { data: allContacts } = await supabase
                            .from('contacts')
                            .select('id, name, company')
                            .eq('org_id', orgId);
                        orgContacts = allContacts || [];
                    }

                    if (orgContacts.length) {
                        const aiResult = await aiMatchContact(senderName, amount, method, orgContacts);
                        aiSuggestedContactId = aiResult.contactId;
                        aiReasoning = aiResult.reasoning;

                        if (aiResult.contactId && aiResult.confidence === 'high' && !contactMatch.contactId) {
                            contactMatch = { contactId: aiResult.contactId, confidence: 'high' };
                        }
                    }
                }

                let movementId: string | null = null;
                if (contactMatch.contactId) {
                    movementId = await matchUnpaidMovement(supabase, contactMatch.contactId, amount, orgId);
                }

                let confidence = contactMatch.confidence;
                if (confidence === 'high' && !movementId) {
                    confidence = 'medium';
                }

                const shouldAutoPost = confidence === 'high' && movementId;

                if (shouldAutoPost && movementId) {
                    const { error: updateErr } = await supabase
                        .from('movements')
                        .update({
                            payment_status: 'paid',
                            payment_method: method,
                            amount_paid: amount,
                            payment_date: emailDate,
                        })
                        .eq('id', movementId);

                    if (updateErr) {
                        console.error(`[check-payment-emails] Failed to update movement ${movementId}:`, updateErr.message);
                    }

                    await supabase.from('payment_email_queue').upsert({
                        org_id: orgId,
                        gmail_message_id: messageId,
                        sender_name: senderName,
                        amount,
                        payment_method: method,
                        email_subject: subject.slice(0, 500),
                        email_snippet: snippet.slice(0, 1000),
                        email_date: emailDate,
                        matched_contact_id: contactMatch.contactId,
                        matched_movement_id: movementId,
                        status: 'auto_posted',
                        confidence,
                        auto_posted_at: new Date().toISOString(),
                        ai_suggested_contact_id: aiSuggestedContactId,
                        ai_reasoning: aiReasoning,
                    }, { onConflict: 'org_id,gmail_message_id', ignoreDuplicates: true });

                    autoPosted++;
                } else {
                    await supabase.from('payment_email_queue').upsert({
                        org_id: orgId,
                        gmail_message_id: messageId,
                        sender_name: senderName,
                        amount,
                        payment_method: method,
                        email_subject: subject.slice(0, 500),
                        email_snippet: snippet.slice(0, 1000),
                        email_date: emailDate,
                        matched_contact_id: contactMatch.contactId,
                        matched_movement_id: movementId,
                        status: 'pending',
                        confidence,
                        ai_suggested_contact_id: aiSuggestedContactId,
                        ai_reasoning: aiReasoning,
                    }, { onConflict: 'org_id,gmail_message_id', ignoreDuplicates: true });

                    queued++;
                }

                processed++;
            }

            await supabase
                .from('automation_modules')
                .update({
                    last_run_at: new Date().toISOString(),
                    run_count: (mod.run_count || 0) + 1,
                })
                .eq('id', mod.id);

            allResults.push({
                org_id: orgId,
                emails_found: emails.length,
                processed,
                auto_posted: autoPosted,
                queued,
                skipped,
            });
        }

        console.log(`[check-payment-emails] Scan complete:`, JSON.stringify(allResults));

        return jsonResponse({
            message: `Scanned ${modules.length} org(s)`,
            results: allResults,
        }, 200, corsHeaders);

    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error('[check-payment-emails]', err);
        return jsonResponse({ error: (err as Error).message || 'Internal error' }, 500, corsHeaders);
    }
}));
