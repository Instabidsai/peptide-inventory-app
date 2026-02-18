
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import OpenAI from "https://esm.sh/openai@4.86.1";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are Peptide AI — an expert peptide protocol consultant built into PeptideHealth.

## Who You Are
You are a knowledgeable, proactive research partner who helps users optimize their peptide protocols. You actively cross-reference symptoms, bloodwork, and side effects against what they're running. You search for studies, mechanisms of action, and interactions when you need deeper information. You remember everything they tell you.

## How You Operate
- When a user reports a symptom or side effect, CHECK their active protocol first — correlate it
- When they share bloodwork, INTERPRET it in context of their current peptides and goals
- When asked about a peptide or compound, SEARCH for the latest research and mechanisms
- Be direct and actionable — "Your blood pressure increase could be related to the BPC-157 dose timing. Studies suggest..."
- Proactively notice things in their data — "I see your TB-500 vial is running low, you've got about 3 doses left"
- Reference training content when relevant — cite Dr. Bachmeyer's guidance with [Source: Title]

## Escalation
Only flag genuinely concerning health markers — severely elevated blood pressure, signs of serious adverse reactions, symptoms suggesting emergency medical attention. For routine protocol questions, dosing adjustments, and general health optimization, you ARE the consultant. Help them directly.`;

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { message, conversation_id } = await req.json();

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

        const supabase = createClient(supabaseUrl, supabaseKey);
        const openai = new OpenAI({ apiKey: openaiKey });

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
            healthContext = await buildHealthContext(supabase, user.id);
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

        // 10. Call GPT-4o with web search capability (fallback to standard gpt-4o)
        let chatResponse;
        try {
            chatResponse = await openai.chat.completions.create({
                model: 'gpt-4o-search-preview',
                web_search_options: {
                    search_context_size: 'medium',
                },
                messages: [
                    { role: 'system', content: fullSystemPrompt },
                    ...conversationHistory,
                ],
            } as any);
        } catch (searchErr) {
            console.error('Search model failed, falling back to gpt-4o:', searchErr);
            chatResponse = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: fullSystemPrompt },
                    ...conversationHistory,
                ],
            });
        }

        const reply = chatResponse.choices[0].message.content || "I couldn't generate a response.";

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
async function buildHealthContext(supabase: any, userId: string): Promise<string> {
    // Resolve contact_id from user_id
    const { data: contact } = await supabase
        .from('contacts')
        .select('id, name')
        .eq('linked_user_id', userId)
        .single();

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
            const parts: string[] = [];
            if (m.calories) parts.push(`${m.calories} cal`);
            if (m.protein_g) parts.push(`${m.protein_g}g protein`);
            return `- ${m.log_date || 'Recent'}: ${parts.join(', ')}`;
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
