import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

                // Match contact
                const contactMatch = await matchContact(supabase, senderName, orgId);

                // Match unpaid movement
                let movementId: string | null = null;
                if (contactMatch.contactId) {
                    movementId = await matchUnpaidMovement(supabase, contactMatch.contactId, amount, orgId);
                }

                // Determine final confidence
                let confidence = contactMatch.confidence;
                if (confidence === 'high' && movementId) {
                    confidence = 'high'; // Name + amount match on unpaid movement
                } else if (confidence === 'high' && !movementId) {
                    confidence = 'medium'; // Name matches but no matching unpaid movement
                }

                // Auto-post if high confidence + movement match
                const shouldAutoPost = confidence === 'high' && movementId;

                if (shouldAutoPost && movementId) {
                    // Update movement payment fields
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

                    // Insert queue record as auto_posted
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
                    });

                    autoPosted++;
                } else {
                    // Queue for review
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
