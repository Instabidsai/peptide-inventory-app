
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import OpenAI from "https://esm.sh/openai@4.28.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { message } = await req.json();

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

        if (!openaiKey) {
            throw new Error('Missing OpenAI Key');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const openai = new OpenAI({ apiKey: openaiKey });

        // 1. Generate Embedding for User Message
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: message.replace(/\n/g, ' '),
        });
        const embedding = embeddingResponse.data[0].embedding;

        // 2. Search for Context
        const { data: documents, error: searchError } = await supabase.rpc('match_documents', {
            query_embedding: embedding,
            match_threshold: 0.5, // Similarity threshold
            match_count: 5,       // Top 5 chunks
        });

        if (searchError) {
            console.error('Search Error:', searchError);
            // Fallback: Proceed without context if DB search fails (e.g. migration not run)
        }

        const contextText = documents?.map((doc: any) => {
            const meta = doc.metadata;
            let citation = '';
            if (meta && meta.title) citation = `[Source: ${meta.title} by ${meta.author || 'Dr. Bachmeyer'}]`;
            return `${citation}\n${doc.content}`;
        }).join('\n\n') || '';

        // 3. Generate Response
        const systemPrompt = `You are Dr. Bochman's AI Assistant for the Peptide Inventory App.

    Instructions:
    1. Use the provided Context to answer the user's question.
    2. ALWAYS cite your source using the [Source: Title] format provided in the context.
    3. If the answer isn't in the context, say "I don't have that information in my current knowledge base."
    4. Do not make up facts.

    Context:
    ${contextText}
    `;

        const chatResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Fast & Cheap
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ],
            temperature: 0.5,
        });

        const reply = chatResponse.choices[0].message.content;

        return new Response(JSON.stringify({ reply }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
