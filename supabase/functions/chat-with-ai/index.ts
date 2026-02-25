import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.86.1";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { sanitizeString } from "../_shared/validate.ts";

const APP_ORIGINS = [
    'https://thepeptideai.com',
    'https://app.thepeptideai.com',
    'https://www.thepeptideai.com',
    'http://localhost:5173',
    'http://localhost:8080',
];
const envOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...APP_ORIGINS, ...envOrigins])];

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

const BRAND_NAME = Deno.env.get('BRAND_NAME') || 'Peptide AI';

const SYSTEM_PROMPT = `You are ${BRAND_NAME} — an expert peptide protocol consultant and personal health assistant.

## Who You Are
You are a knowledgeable, proactive research partner who helps users optimize their peptide protocols. You actively cross-reference symptoms, bloodwork, and side effects against what they're running. You search for studies, mechanisms of action, and interactions when you need deeper information. You remember everything they tell you.

## How You Operate
- When a user reports a symptom or side effect, CHECK their active protocol first — correlate it
- When they share bloodwork, INTERPRET it in context of their current peptides and goals
- When asked about a peptide or compound, SEARCH for the latest research and mechanisms
- Be direct and actionable — "Your blood pressure increase could be related to the BPC-157 dose timing. Studies suggest..."
- Proactively notice things in their data — "I see your TB-500 vial is running low, you've got about 3 doses left"
- Reference training content when relevant — cite Dr. Bachmeyer's guidance with [Source: Title]

## What You Can Do (Tools)
You have tools to take ACTIONS on behalf of the user — not just answer questions:
- **Log doses**: When they say "I just took my BPC" or "log my dose", use log_dose to record it and decrement the vial
- **Check inventory**: Show their current vials, remaining quantities, and dosing schedules
- **View orders**: Look up their recent orders and shipping status
- **Submit requests**: Help them request products, reorders, regimen assistance, or submit inquiries to the vendor
- **Log body composition**: Record weight, body fat, and measurements when they share them
- **View protocols**: Show their assigned peptide protocols with dosing details
- **Log meals**: Record nutrition data when they describe what they ate

ALWAYS use the appropriate tool when the user's intent matches — don't just describe what they could do, DO IT for them. If you need to confirm details (like which vial or dose amount), ask first, then execute. When logging a dose, call view_my_inventory first to get the correct vial_id.

## Escalation
Only flag genuinely concerning health markers — severely elevated blood pressure, signs of serious adverse reactions, symptoms suggesting emergency medical attention. For routine protocol questions, dosing adjustments, and general health optimization, you ARE the consultant. Help them directly.`;

const CLIENT_TOOLS: any[] = [
    {
        type: "function",
        function: {
            name: "log_dose",
            description: "Log a peptide dose for the user. Decrements the vial quantity. Call view_my_inventory first if you need the vial_id.",
            parameters: {
                type: "object",
                properties: {
                    vial_id: { type: "string", description: "The vial UUID to log the dose from" },
                    dose_mg: { type: "number", description: "Dose amount in mg. Use the vial's configured dose_amount_mg if user doesn't specify." },
                },
                required: ["vial_id", "dose_mg"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "view_my_inventory",
            description: "View the user's active peptide inventory with vial IDs, remaining quantities, concentrations, and dosing schedules.",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    {
        type: "function",
        function: {
            name: "view_my_orders",
            description: "View the user's recent sales orders with status, items, totals, and tracking info.",
            parameters: {
                type: "object",
                properties: {
                    status: { type: "string", description: "Filter by order status", enum: ["pending", "confirmed", "fulfilled", "shipped", "delivered", "void"] },
                    limit: { type: "number", description: "Max orders to return (default 10)" },
                },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "submit_request",
            description: "Submit a request to the vendor — product inquiry, reorder, regimen help, or general question.",
            parameters: {
                type: "object",
                properties: {
                    type: { type: "string", enum: ["general_inquiry", "product_request", "regimen_help"], description: "Type of request" },
                    subject: { type: "string", description: "Brief subject line" },
                    message: { type: "string", description: "Detailed message body" },
                    peptide_name: { type: "string", description: "Peptide name if requesting a product (will look up the ID)" },
                    requested_quantity: { type: "number", description: "Quantity requested if applicable" },
                },
                required: ["type", "subject", "message"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "log_body_composition",
            description: "Log body composition measurements — weight, body fat percentage, notes.",
            parameters: {
                type: "object",
                properties: {
                    weight_lbs: { type: "number", description: "Weight in pounds" },
                    body_fat_pct: { type: "number", description: "Body fat percentage" },
                    notes: { type: "string", description: "Notes about the measurement" },
                },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "view_my_protocols",
            description: "View the user's assigned peptide protocols with dosing details.",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    {
        type: "function",
        function: {
            name: "log_meal",
            description: "Log a meal or food intake for nutrition tracking.",
            parameters: {
                type: "object",
                properties: {
                    description: { type: "string", description: "What they ate" },
                    calories: { type: "number", description: "Total calories" },
                    protein_g: { type: "number", description: "Protein in grams" },
                    carbs_g: { type: "number", description: "Carbs in grams" },
                    fat_g: { type: "number", description: "Fat in grams" },
                },
                required: ["description"],
            },
        },
    },
];

async function executeTool(
    supabase: any,
    toolName: string,
    args: any,
    contactId: string,
    orgId: string,
): Promise<string> {
    try {
        switch (toolName) {
            case 'log_dose': {
                const { vial_id, dose_mg } = args;
                const { data: vial } = await supabase
                    .from('client_inventory')
                    .select('id, current_quantity_mg, peptide:peptides(name)')
                    .eq('id', vial_id)
                    .eq('contact_id', contactId)
                    .single();
                if (!vial) return JSON.stringify({ error: 'Vial not found or does not belong to you' });

                const { data: result, error } = await supabase.rpc('decrement_vial', {
                    p_vial_id: vial_id,
                    p_dose_mg: dose_mg,
                });
                if (error) return JSON.stringify({ error: error.message });
                const remaining = result?.new_quantity_mg ?? (vial.current_quantity_mg - dose_mg);
                const pctLeft = vial.current_quantity_mg > 0
                    ? Math.round((remaining / vial.current_quantity_mg) * 100) : 0;
                return JSON.stringify({
                    success: true,
                    peptide: vial.peptide?.name,
                    dose_mg,
                    remaining_mg: remaining,
                    pct_remaining: pctLeft,
                    message: `Logged ${dose_mg}mg dose of ${vial.peptide?.name || 'peptide'}. ${remaining}mg remaining.`,
                });
            }

            case 'view_my_inventory': {
                const { data: inventory } = await supabase
                    .from('client_inventory')
                    .select('id, current_quantity_mg, vial_size_mg, water_added_ml, concentration_mg_ml, dose_amount_mg, dose_frequency, dose_time_of_day, status, reconstituted_at, peptide:peptides(name)')
                    .eq('contact_id', contactId)
                    .in('status', ['active', 'reconstituted']);
                if (!inventory?.length) return JSON.stringify({ message: 'No active inventory found' });
                return JSON.stringify(inventory.map((v: any) => ({
                    vial_id: v.id,
                    peptide: v.peptide?.name,
                    remaining_mg: v.current_quantity_mg,
                    vial_size_mg: v.vial_size_mg,
                    pct_remaining: v.vial_size_mg > 0 ? Math.round((v.current_quantity_mg / v.vial_size_mg) * 100) : 0,
                    concentration: v.concentration_mg_ml ? `${v.concentration_mg_ml} mg/ml` : null,
                    dose_amount_mg: v.dose_amount_mg,
                    frequency: v.dose_frequency,
                    time_of_day: v.dose_time_of_day,
                    status: v.status,
                })));
            }

            case 'view_my_orders': {
                let query = supabase
                    .from('sales_orders')
                    .select('id, status, total, created_at, tracking_number, sales_order_items(quantity, unit_price, peptide:peptides(name))')
                    .eq('client_id', contactId)
                    .order('created_at', { ascending: false })
                    .limit(args.limit || 10);
                if (args.status) query = query.eq('status', args.status);
                const { data: orders } = await query;
                if (!orders?.length) return JSON.stringify({ message: 'No orders found' });
                return JSON.stringify(orders.map((o: any) => ({
                    order_id: o.id,
                    status: o.status,
                    total: o.total,
                    date: o.created_at,
                    tracking: o.tracking_number,
                    items: (o.sales_order_items || []).map((i: any) => ({
                        peptide: i.peptide?.name,
                        qty: i.quantity,
                        price: i.unit_price,
                    })),
                })));
            }

            case 'submit_request': {
                const { type, subject, message, peptide_name, requested_quantity } = args;
                let peptide_id = null;
                if (peptide_name) {
                    const { data: peptide } = await supabase
                        .from('peptides')
                        .select('id')
                        .ilike('name', `%${peptide_name}%`)
                        .limit(1)
                        .single();
                    if (peptide) peptide_id = peptide.id;
                }
                const { error } = await supabase.from('requests').insert({
                    contact_id: contactId,
                    org_id: orgId,
                    type,
                    subject,
                    message,
                    peptide_id,
                    requested_quantity: requested_quantity || null,
                    status: 'new',
                });
                if (error) return JSON.stringify({ error: error.message });
                return JSON.stringify({ success: true, message: `Request submitted: "${subject}"` });
            }

            case 'log_body_composition': {
                const { weight_lbs, body_fat_pct, notes } = args;
                const { error } = await supabase.from('body_composition_logs').insert({
                    contact_id: contactId,
                    weight_lbs: weight_lbs || null,
                    body_fat_pct: body_fat_pct || null,
                    notes: notes || null,
                });
                if (error) return JSON.stringify({ error: error.message });
                const parts = [];
                if (weight_lbs) parts.push(`${weight_lbs} lbs`);
                if (body_fat_pct) parts.push(`${body_fat_pct}% BF`);
                return JSON.stringify({ success: true, message: `Logged body composition: ${parts.join(', ')}` });
            }

            case 'view_my_protocols': {
                const { data: protocols } = await supabase
                    .from('protocols')
                    .select('id, name, description, status, protocol_items(dosage_amount, dosage_unit, frequency, route, notes, peptide:peptides(name))')
                    .eq('contact_id', contactId);
                if (!protocols?.length) return JSON.stringify({ message: 'No protocols assigned' });
                return JSON.stringify(protocols.map((p: any) => ({
                    name: p.name,
                    description: p.description,
                    status: p.status,
                    items: (p.protocol_items || []).map((i: any) => ({
                        peptide: i.peptide?.name,
                        dosage: `${i.dosage_amount}${i.dosage_unit}`,
                        frequency: i.frequency,
                        route: i.route,
                        notes: i.notes,
                    })),
                })));
            }

            case 'log_meal': {
                const { description, calories, protein_g, carbs_g, fat_g } = args;
                const { error } = await supabase.from('meal_logs').insert({
                    contact_id: contactId,
                    description,
                    calories: calories || null,
                    protein_g: protein_g || null,
                    carbs_g: carbs_g || null,
                    fat_g: fat_g || null,
                    log_date: new Date().toISOString().split('T')[0],
                });
                if (error) return JSON.stringify({ error: error.message });
                return JSON.stringify({ success: true, message: `Logged meal: ${description}` });
            }

            default:
                return JSON.stringify({ error: `Unknown tool: ${toolName}` });
        }
    } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
    }
}

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const message = sanitizeString(body.message, 5000);
        if (!message) {
            return new Response(JSON.stringify({ error: 'message is required (max 5000 chars)' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        const conversation_id = body.conversation_id;

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

        if (!openaiKey) throw new Error('Missing OpenAI Key');

        // Extract user from JWT
        const authHeader = req.headers.get('Authorization') ?? '';
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
            authHeader.replace('Bearer ', '')
        );
        if (authError || !user) throw new Error('Unauthorized');
        // Rate limit: 15 requests per minute per user (client-facing, tighter limit)
        const rl = checkRateLimit(user.id, { maxRequests: 15, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

        const supabase = createClient(supabaseUrl, supabaseKey);
        const openai = new OpenAI({ apiKey: openaiKey });

        // Resolve contact linked to this user (for tool actions)
        const { data: userContact } = await supabase
            .from('contacts')
            .select('id, name, org_id')
            .eq('linked_user_id', user.id)
            .single();

        // 1. Get or create conversation
        let activeConversationId = conversation_id;
        if (!activeConversationId) {
            // Find most recent conversation or create one
            const { data: existing } = await supabase
                .from('ai_conversations')
                .select('id')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false })
                .limit(1)
                .single();

            if (existing) {
                activeConversationId = existing.id;
            } else {
                const { data: newConvo, error: convoError } = await supabase
                    .from('ai_conversations')
                    .insert({ user_id: user.id })
                    .select('id')
                    .single();
                if (convoError) throw convoError;
                activeConversationId = newConvo.id;
            }
        }

        // 2. Save user message
        await supabase.from('ai_messages').insert({
            conversation_id: activeConversationId,
            role: 'user',
            content: message,
        });

        // Update conversation timestamp
        await supabase.from('ai_conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', activeConversationId);

        // 3. Load conversation history (last 20 messages)
        const { data: historyRows } = await supabase
            .from('ai_messages')
            .select('role, content')
            .eq('conversation_id', activeConversationId)
            .order('created_at', { ascending: true })
            .limit(20);

        const conversationHistory = (historyRows || []).map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }));

        // 4. Generate embedding for RAG
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: message.replace(/\n/g, ' '),
        });
        const embedding = embeddingResponse.data[0].embedding;

        // 5. Search knowledge base
        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding,
            match_threshold: 0.5,
            match_count: 5,
        });

        const ragContext = documents?.map((doc: any) => {
            const meta = doc.metadata;
            let citation = '';
            if (meta?.video_url) {
                const topic = meta.topic || meta.title || '';
                citation = `[Source: Dr. Bachmeyer — ${topic} (${meta.video_url})]`;
            } else if (meta?.title) {
                citation = `[Source: ${meta.title} by ${meta.author || 'Dr. Bachmeyer'}]`;
            }
            return `${citation}\n${doc.content}`;
        }).join('\n\n') || '';

        // 6. Load health profile (if exists)
        const { data: profile } = await supabase
            .from('ai_health_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();

        let healthProfileText = '';
        if (profile) {
            const parts: string[] = [];
            if (profile.conditions?.length) parts.push(`Conditions: ${(profile.conditions as string[]).join(', ')}`);
            if (profile.goals?.length) parts.push(`Goals: ${(profile.goals as string[]).join(', ')}`);
            if (profile.medications?.length) parts.push(`Medications: ${(profile.medications as string[]).join(', ')}`);
            if (profile.allergies?.length) parts.push(`Allergies: ${(profile.allergies as string[]).join(', ')}`);
            if (profile.supplements?.length) parts.push(`Supplements: ${(profile.supplements as string[]).join(', ')}`);
            if (profile.lab_values && Object.keys(profile.lab_values as object).length > 0) {
                const labs = Object.entries(profile.lab_values as Record<string, string>)
                    .map(([k, v]) => `${k}: ${v}`).join(', ');
                parts.push(`Lab Values: ${labs}`);
            }
            if (profile.notes) parts.push(`Notes: ${profile.notes}`);
            healthProfileText = parts.join('\n');
        }

        // 7. Load learned insights (last 20)
        const { data: insights } = await supabase
            .from('ai_learned_insights')
            .select('category, title, content')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        let insightsText = '';
        if (insights?.length) {
            const grouped: Record<string, string[]> = {};
            for (const ins of insights) {
                if (!grouped[ins.category]) grouped[ins.category] = [];
                grouped[ins.category].push(`- ${ins.title}: ${ins.content}`);
            }
            insightsText = Object.entries(grouped)
                .map(([cat, items]) => `### ${cat}\n${items.join('\n')}`)
                .join('\n\n');
        }

        // 8. Build live health data context
        let healthContext = '';
        try {
            healthContext = userContact
                ? await buildHealthContext(supabase, userContact)
                : '';
        } catch (e) {
            console.error('Health context error:', e);
        }

        // 9. Assemble system prompt
        const fullSystemPrompt = [
            SYSTEM_PROMPT,
            healthProfileText && `\n## What You Know About This User\n${healthProfileText}`,
            insightsText && `\n## Research & Insights You've Accumulated\n${insightsText}`,
            healthContext && `\n## Their Current Protocol & Data\n${healthContext}`,
            ragContext && `\n## Expert Knowledge Base\n${ragContext}`,
        ].filter(Boolean).join('\n');

        // 10. Call GPT-4o with function calling tools
        const chatMessages: any[] = [
            { role: 'system', content: fullSystemPrompt },
            ...conversationHistory,
        ];

        let reply = '';
        let iterations = 0;
        const MAX_TOOL_ITERATIONS = 6;

        while (iterations < MAX_TOOL_ITERATIONS) {
            iterations++;
            const chatResponse = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: chatMessages,
                tools: userContact ? CLIENT_TOOLS : undefined,
                tool_choice: userContact ? 'auto' as const : undefined,
                temperature: 0.3,
            });

            const choice = chatResponse.choices[0];
            const assistantMessage = choice.message;

            if (assistantMessage.tool_calls?.length) {
                // Add the assistant's tool call message to history
                chatMessages.push(assistantMessage);

                // Execute each tool call and add results
                for (const toolCall of assistantMessage.tool_calls) {
                    let args = {};
                    try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch { /* empty */ }
                    const result = await executeTool(
                        supabase,
                        toolCall.function.name,
                        args,
                        userContact?.id || '',
                        userContact?.org_id || '',
                    );
                    chatMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: result,
                    });
                }
                continue; // Loop back to get the AI's response to tool results
            }

            // No tool calls — this is the final response
            reply = assistantMessage.content || "I couldn't generate a response.";
            break;
        }

        if (!reply) {
            reply = "I completed the requested actions. Check your inventory or orders for the latest updates.";
        }

        // 11. Save assistant response
        await supabase.from('ai_messages').insert({
            conversation_id: activeConversationId,
            role: 'assistant',
            content: reply,
        });

        // 12. Background: Extract health profile + insights (fire and forget)
        extractKnowledge(supabase, openai, user.id, message, reply).catch(e =>
            console.error('Knowledge extraction error:', e)
        );

        return new Response(JSON.stringify({
            reply,
            conversation_id: activeConversationId,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('chat-with-ai error:', errMsg, error);
        return new Response(JSON.stringify({ error: errMsg }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

/** Build live health data context from the user's protocols, inventory, etc. */
async function buildHealthContext(supabase: any, contact: { id: string; name: string }): Promise<string> {
    if (!contact) return '';

    const parts: string[] = [];

    // Active inventory
    const { data: inventory } = await supabase
        .from('client_inventory')
        .select('*, peptide:peptides(name)')
        .eq('contact_id', contact.id)
        .eq('status', 'active');

    if (inventory?.length) {
        const vialLines = inventory.map((v: any) => {
            const name = v.peptide?.name || 'Unknown';
            const pct = v.vial_size_mg > 0 ? Math.round((v.current_quantity_mg / v.vial_size_mg) * 100) : 0;
            let line = `- ${name}: ${v.current_quantity_mg}mg remaining (${pct}%)`;
            if (v.dose_amount_mg) line += `, ${v.dose_amount_mg}mg dose`;
            if (v.dose_frequency) line += `, ${v.dose_frequency}`;
            if (v.dose_time_of_day) line += ` (${v.dose_time_of_day})`;
            return line;
        });
        parts.push(`### Active Inventory\n${vialLines.join('\n')}`);
    }

    // Protocols
    const { data: protocols } = await supabase
        .from('protocols')
        .select('name, protocol_items(dosage_amount, dosage_unit, frequency, peptide:peptides(name))')
        .eq('contact_id', contact.id);

    if (protocols?.length) {
        const protoLines = protocols.flatMap((p: any) =>
            (p.protocol_items || []).map((item: any) =>
                `- ${item.peptide?.name || 'Unknown'}: ${item.dosage_amount}${item.dosage_unit} ${item.frequency} (${p.name})`
            )
        );
        if (protoLines.length) parts.push(`### Current Protocols\n${protoLines.join('\n')}`);
    }

    // Recent body composition
    const { data: bodyComp } = await supabase
        .from('body_composition_logs')
        .select('*')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (bodyComp) {
        const bcParts: string[] = [];
        if (bodyComp.weight_lbs) bcParts.push(`Weight: ${bodyComp.weight_lbs} lbs`);
        if (bodyComp.body_fat_pct) bcParts.push(`BF: ${bodyComp.body_fat_pct}%`);
        if (bcParts.length) parts.push(`### Body Composition\n${bcParts.join(', ')}`);
    }

    // Recent meal logs
    const { data: meals } = await supabase
        .from('meal_logs')
        .select('*')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(3);

    if (meals?.length) {
        const mealLines = meals.map((m: any) => {
            const msgParts: string[] = [];
            if (m.calories) msgParts.push(`${m.calories} cal`);
            if (m.protein_g) msgParts.push(`${m.protein_g}g protein`);
            return `- ${m.log_date || 'Recent'}: ${msgParts.join(', ')}`;
        });
        parts.push(`### Recent Nutrition\n${mealLines.join('\n')}`);
    }

    return parts.join('\n\n');
}

/** Extract health profile updates and learned insights from the conversation */
async function extractKnowledge(
    supabase: any,
    openai: any,
    userId: string,
    userMessage: string,
    assistantReply: string
): Promise<void> {
    const extractionPrompt = `Analyze this conversation exchange and extract any new health information.

User said: "${userMessage}"
Assistant replied: "${assistantReply}"

Return JSON with exactly this structure:
{
  "profile_updates": {
    "conditions": [],       // string array of medical conditions, e.g. ["type 2 diabetes", "hypertension"]
    "goals": [],            // string array, e.g. ["fat loss", "muscle preservation"]
    "medications": [],      // string array, e.g. ["metformin 500mg daily"]
    "allergies": [],        // string array, e.g. ["sulfa drugs"]
    "supplements": [],      // string array, e.g. ["BPC-157", "TB-500"]
    "lab_values": {},       // object with string values, e.g. {"testosterone": "450 ng/dL", "fasting_glucose": "105 mg/dL"}
    "notes": ""             // string, any other relevant info
  },
  "insights": []            // array of {category, title, content} objects
}

RULES:
- conditions, goals, medications, allergies, supplements MUST be string arrays (never objects)
- lab_values MUST be an object with string values
- notes MUST be a string (never an object)
- Only include fields with NEW information. Use empty arrays/objects/strings for fields with no updates.
- insights category must be one of: research, protocol_note, lab_interpretation, side_effect, interaction, recommendation
- Each insight needs: category (string), title (short string), content (1-2 sentence string)
- If the exchange is casual/greeting, return all empty values.`;

    try {
        const extraction = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You extract structured health data from conversations. Return only valid JSON.' },
                { role: 'user', content: extractionPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
            max_tokens: 500,
        });

        const result = JSON.parse(extraction.choices[0].message.content || '{}');

        // Normalize profile updates — coerce to correct types
        const updates = result.profile_updates;
        if (updates) {
            // Ensure array fields are actually arrays of strings
            for (const field of ['conditions', 'goals', 'medications', 'allergies', 'supplements']) {
                if (updates[field] && !Array.isArray(updates[field])) {
                    // If it's an object, try to extract values
                    if (typeof updates[field] === 'object') {
                        updates[field] = Object.values(updates[field]).map(String);
                    } else if (typeof updates[field] === 'string') {
                        updates[field] = [updates[field]];
                    } else {
                        updates[field] = [];
                    }
                }
            }
            // Ensure lab_values is an object with string values
            if (updates.lab_values && typeof updates.lab_values !== 'object') {
                updates.lab_values = {};
            }
            if (Array.isArray(updates.lab_values)) {
                updates.lab_values = {};
            }
            // Ensure notes is a string
            if (updates.notes && typeof updates.notes !== 'string') {
                updates.notes = String(updates.notes);
                if (updates.notes === '[object Object]') updates.notes = '';
            }
        }

        const hasUpdates = updates && Object.keys(updates).some(k => {
            const v = updates[k];
            return Array.isArray(v) ? v.length > 0 : (typeof v === 'object' ? Object.keys(v).length > 0 : !!v);
        });

        if (hasUpdates) {
            const { data: existing } = await supabase
                .from('ai_health_profiles')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (existing) {
                const merged: any = {};
                for (const field of ['conditions', 'goals', 'medications', 'allergies', 'supplements']) {
                    if (updates[field]?.length) {
                        const existingArr = Array.isArray(existing[field]) ? existing[field] : [];
                        merged[field] = [...new Set([...existingArr, ...updates[field]])];
                    }
                }
                if (updates.lab_values && Object.keys(updates.lab_values).length) {
                    const existingLabs = (typeof existing.lab_values === 'object' && !Array.isArray(existing.lab_values))
                        ? existing.lab_values : {};
                    merged.lab_values = { ...existingLabs, ...updates.lab_values };
                }
                if (updates.notes && updates.notes.trim()) {
                    const existingNotes = (typeof existing.notes === 'string') ? existing.notes : '';
                    merged.notes = existingNotes ? `${existingNotes}\n${updates.notes}` : updates.notes;
                }
                merged.updated_at = new Date().toISOString();

                await supabase.from('ai_health_profiles')
                    .update(merged)
                    .eq('user_id', userId);
            } else {
                await supabase.from('ai_health_profiles').insert({
                    user_id: userId,
                    conditions: updates.conditions || [],
                    goals: updates.goals || [],
                    medications: updates.medications || [],
                    allergies: updates.allergies || [],
                    supplements: updates.supplements || [],
                    lab_values: updates.lab_values || {},
                    notes: updates.notes || '',
                    updated_at: new Date().toISOString(),
                });
            }
        }

        // Insert learned insights
        if (result.insights?.length) {
            const insightRows = result.insights.map((ins: any) => ({
                user_id: userId,
                category: ins.category,
                title: ins.title,
                content: ins.content,
                source: 'conversation',
            }));
            await supabase.from('ai_learned_insights').insert(insightRows);
        }

    } catch (e) {
        console.error('Knowledge extraction failed:', e);
    }
}
