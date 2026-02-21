import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.86.1";

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

// ── Email sender patterns ──────────────────────────────────────────
interface SenderPattern {
    method: string;
    fromAddresses: string[];
    // Gmail search filter fragment
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
    // Match $1,234.56 or $123.45
    const match = text.match(/\$\s?([\d,]+\.\d{2})/);
    if (!match) return null;
    return parseFloat(match[1].replace(/,/g, ''));
}

function extractSenderName(text: string, method: string): string | null {
    const cleaned = text.replace(/\s+/g, ' ').trim();

    if (method === 'venmo') {
        // "John Smith paid you $150.00"
        let m = cleaned.match(/^(.+?)\s+paid you/i);
        if (m) return m[1].trim();
        m = cleaned.match(/paid .+? by\s+(.+?)(?:\s+on|\s+\$|$)/i);
        if (m) return m[1].trim();
        m = cleaned.match(/(.+?)\s+paid\s+you/i);
        if (m) return m[1].trim();
    }

    if (method === 'cashapp') {
        // "X sent you $Y" or "You received $Y from X"
        let m = cleaned.match(/(.+?)\s+sent you/i);
        if (m) return m[1].trim();
        m = cleaned.match(/received .+? from\s+(.+?)(?:\s+on|\.|$)/i);
        if (m) return m[1].trim();
    }

    if (method === 'zelle') {
        // Wells Fargo format: subject "You received money with Zelle(R)" + body "Wells Fargo home page NAME sent you $X.XX"
        // Strip both prefixes from combined subject+snippet text
        const wfCleaned = cleaned
            .replace(/You received money with Zelle\s*\(R\)\s*/i, '')
            .replace(/Wells Fargo home page\s*/i, '');
        let m = wfCleaned.match(/^(.+?)\s+sent you\s+\$/i);
        if (m) return m[1].trim();
        // Generic: "You received $Y from X" or "X sent you $Y"
        m = cleaned.match(/received .+? from\s+(.+?)(?:\s+on|\.|$)/i);
        if (m) return m[1].trim();
        m = cleaned.match(/(.+?)\s+sent you/i);
        if (m) return m[1].trim();
        m = cleaned.match(/payment from\s+(.+?)(?:\s+on|\.|$)/i);
        if (m) return m[1].trim();
    }

    if (method === 'psifi') {
        // Subject: "You received $47.79 from @username"
        // Body: "You've received a payment from @username"
        let m = cleaned.match(/from\s+(@\S+)/i);
        if (m) return m[1].trim();
        m = cleaned.match(/payment from\s+(.+?)(?:\s+|\.|\!|$)/i);
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
    supabase: any,
    senderName: string | null,
    orgId: string
): Promise<MatchResult> {
    if (!senderName) return { contactId: null, confidence: 'low' };

    const name = senderName.trim();

    // 1. Exact full name match (case-insensitive)
    const { data: exact } = await supabase
        .from('contacts')
        .select('id')
        .eq('org_id', orgId)
        .ilike('name', name)
        .limit(1);

    if (exact?.length) {
        return { contactId: exact[0].id, confidence: 'high' };
    }

    // 2. Try first + last name separately
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

    // 3. First name only (very loose)
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
    supabase: any,
    contactId: string,
    amount: number,
    orgId: string
): Promise<string | null> {
    // Find unpaid movements for this contact where total ≈ amount (±$0.50)
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
        const movTotal = (mov.movement_items || []).reduce(
            (sum: number, item: any) => sum + (Number(item.price_at_sale) || 0),
            0
        );
        if (Math.abs(movTotal - amount) <= 0.50) {
            return mov.id;
        }
    }

    return null;
}

// ── Alias lookup ──────────────────────────────────────────────────

async function matchAlias(
    supabase: any,
    senderName: string | null,
    orgId: string
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

// ── Improved fuzzy matching ───────────────────────────────────────

function normalizeName(name: string): string {
    return name
        .replace(/,?\s*(LLC|INC|CORP|LTD|CO)\b\.?/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

async function fuzzyMatchContact(
    supabase: any,
    senderName: string | null,
    orgId: string
): Promise<MatchResult> {
    if (!senderName) return { contactId: null, confidence: 'low' };

    const normalized = normalizeName(senderName);
    const parts = normalized.split(/\s+/);

    // Try company field match
    const { data: companyMatch } = await supabase
        .from('contacts')
        .select('id, name, company')
        .eq('org_id', orgId)
        .ilike('company', `%${normalized}%`)
        .limit(3);

    if (companyMatch?.length === 1) {
        return { contactId: companyMatch[0].id, confidence: 'high' };
    }

    // Try starts-with on first 4 chars of first name (catches Rock→Rocky, etc.)
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
    contacts: { id: string; name: string; company: string | null }[]
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

        // Validate the contact_id actually exists in our list
        if (matchedId && !contacts.some(c => c.id === matchedId)) {
            return { contactId: null, confidence: 'low', reasoning: 'AI returned invalid contact ID' };
        }

        return { contactId: matchedId, confidence: conf, reasoning };
    } catch (err: any) {
        console.error('[check-payment-emails] AI match error:', err.message);
        return { contactId: null, confidence: 'low', reasoning: `AI error: ${err.message}` };
    }
}

// ── Main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const json = (body: object, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    try {
        const sbUrl = Deno.env.get('SUPABASE_URL')!;
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const composioApiKey = Deno.env.get('COMPOSIO_API_KEY');

        if (!composioApiKey) return json({ error: 'COMPOSIO_API_KEY not configured' }, 500);

        const supabase = createClient(sbUrl, sbServiceKey);

        // Parse request body (may have org_id for manual trigger, or scan_all_orgs for cron)
        let body: any = {};
        try { body = await req.json(); } catch { /* empty body OK for cron */ }

        // Get all orgs with payment_scanner enabled
        const { data: modules, error: modErr } = await supabase
            .from('automation_modules')
            .select('*')
            .eq('module_type', 'payment_scanner')
            .eq('enabled', true);

        if (modErr) return json({ error: modErr.message }, 500);
        if (!modules?.length) return json({ message: 'No orgs have payment scanner enabled', processed: 0 });

        const allResults: any[] = [];

        for (const mod of modules) {
            const orgId = mod.org_id;
            const config = mod.config || {};
            const composioEntityId = config.composio_entity_id || 'default';

            // Build Gmail search query
            const allFromAddresses = SENDER_PATTERNS.flatMap(sp => sp.fromAddresses);
            const fromFilter = allFromAddresses.map(a => `from:${a}`).join(' OR ');
            const gmailQuery = `(${fromFilter}) newer_than:7d`;

            // Call Composio to search Gmail
            let emails: any[] = [];
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
                            input: {
                                query: gmailQuery,
                                max_results: 20,
                            },
                        }),
                    }
                );

                if (!composioRes.ok) {
                    const errText = await composioRes.text();
                    console.error(`[check-payment-emails] Composio error for org ${orgId}: ${errText}`);
                    allResults.push({ org_id: orgId, error: `Composio API error: ${composioRes.status}` });
                    continue;
                }

                const composioData = await composioRes.json();
                // Composio returns data in various formats, normalize
                emails = composioData?.data?.emails
                    || composioData?.data?.messages
                    || composioData?.response_data?.emails
                    || composioData?.response_data?.messages
                    || [];

                if (!Array.isArray(emails)) {
                    // Try extracting from nested structure
                    if (composioData?.data && Array.isArray(composioData.data)) {
                        emails = composioData.data;
                    } else {
                        emails = [];
                    }
                }
            } catch (fetchErr: any) {
                console.error(`[check-payment-emails] Fetch error:`, fetchErr.message);
                allResults.push({ org_id: orgId, error: fetchErr.message });
                continue;
            }

            let processed = 0;
            let autoPosted = 0;
            let queued = 0;
            let skipped = 0;

            for (const email of emails) {
                const messageId = email.messageId || email.id || email.message_id;
                if (!messageId) continue;

                // Deduplicate
                const { data: existing } = await supabase
                    .from('payment_email_queue')
                    .select('id')
                    .eq('org_id', orgId)
                    .eq('gmail_message_id', messageId)
                    .limit(1);

                if (existing?.length) {
                    skipped++;
                    continue;
                }

                // Extract email fields — Composio returns preview.body with text, messageTimestamp
                const from = email.sender || email.from || '';
                const subject = email.subject || '';
                const previewBody = typeof email.preview === 'object' ? (email.preview?.body || '') : (email.preview || '');
                const snippet = previewBody || email.snippet || email.body || email.text || '';
                const emailDate = email.messageTimestamp
                    || (email.internalDate ? new Date(Number(email.internalDate)).toISOString() : null)
                    || email.date
                    || new Date().toISOString();

                // Detect payment method
                const method = detectMethod(from);
                if (!method) { skipped++; continue; }

                // Skip outgoing payments (we only want received)
                const combinedText = `${subject} ${snippet}`;
                if (method === 'zelle' && /You sent money/i.test(subject)) { skipped++; continue; }

                // Extract amount
                const searchText = combinedText;
                const amount = extractAmount(searchText);
                if (!amount || amount <= 0) { skipped++; continue; }

                // Extract sender name
                const senderName = extractSenderName(searchText, method);

                // ── Matching pipeline: alias → exact → fuzzy → AI ──

                // Step 1: Check learned aliases (instant match from past approvals)
                let contactMatch = await matchAlias(supabase, senderName, orgId);

                // Step 2: Exact name match
                if (!contactMatch.contactId) {
                    contactMatch = await matchContact(supabase, senderName, orgId);
                }

                // Step 3: Fuzzy match (company name, name prefix)
                if (!contactMatch.contactId || contactMatch.confidence === 'low') {
                    const fuzzy = await fuzzyMatchContact(supabase, senderName, orgId);
                    if (fuzzy.contactId && (!contactMatch.contactId || fuzzy.confidence !== 'low')) {
                        contactMatch = fuzzy;
                    }
                }

                // Step 4: AI match (GPT-4o-mini) for remaining unmatched
                let aiSuggestedContactId: string | null = null;
                let aiReasoning: string | null = null;

                if (!contactMatch.contactId || contactMatch.confidence === 'low') {
                    // Fetch all contacts once per org (cached above the email loop would be better,
                    // but typically <100 contacts so this is fine)
                    const { data: allContacts } = await supabase
                        .from('contacts')
                        .select('id, name, company')
                        .eq('org_id', orgId);

                    if (allContacts?.length) {
                        const aiResult = await aiMatchContact(senderName, amount, method, allContacts);
                        aiSuggestedContactId = aiResult.contactId;
                        aiReasoning = aiResult.reasoning;

                        // If AI is highly confident and we had no match, use it
                        if (aiResult.contactId && aiResult.confidence === 'high' && !contactMatch.contactId) {
                            contactMatch = { contactId: aiResult.contactId, confidence: 'high' };
                        }
                    }
                }

                // Match unpaid movement
                let movementId: string | null = null;
                if (contactMatch.contactId) {
                    movementId = await matchUnpaidMovement(supabase, contactMatch.contactId, amount, orgId);
                }

                // Determine final confidence
                let confidence = contactMatch.confidence;
                if (confidence === 'high' && movementId) {
                    confidence = 'high';
                } else if (confidence === 'high' && !movementId) {
                    confidence = 'medium';
                }

                // Auto-post if high confidence + movement match
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

                    await supabase.from('payment_email_queue').insert({
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
                    });

                    autoPosted++;
                } else {
                    await supabase.from('payment_email_queue').insert({
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
                    });

                    queued++;
                }

                processed++;
            }

            // Update last_run_at
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

        return json({
            message: `Scanned ${modules.length} org(s)`,
            results: allResults,
        });
    } catch (err: any) {
        console.error('[check-payment-emails]', err);
        return json({ error: err.message || 'Internal error' }, 500);
    }
});
