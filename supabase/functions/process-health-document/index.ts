
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import OpenAI from "https://esm.sh/openai@4.28.0";
import { withErrorReporting } from "../_shared/error-reporter.ts";

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
    };
}

serve(withErrorReporting("process-health-document", async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Auth: require valid JWT
        const authHeader = req.headers.get('Authorization') ?? '';
        const supabaseAuth = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        );
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
            authHeader.replace('Bearer ', '')
        );
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            });
        }

        const { document_id } = await req.json();
        if (!document_id) throw new Error('document_id required');

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

        if (!openaiKey) throw new Error('Missing OpenAI Key');

        const supabase = createClient(supabaseUrl, supabaseKey);
        const openai = new OpenAI({ apiKey: openaiKey });

        // 1. Get document record
        const { data: doc, error: docError } = await supabase
            .from('ai_documents')
            .select('*')
            .eq('id', document_id)
            .single();

        if (docError || !doc) throw new Error('Document not found');

        // Verify document ownership
        if (doc.user_id !== user.id) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            });
        }

        // Mark as processing
        await supabase.from('ai_documents')
            .update({ status: 'processing' })
            .eq('id', document_id);

        // 2. Download file from storage
        const { data: fileData, error: dlError } = await supabase.storage
            .from('health-documents')
            .download(doc.storage_path);

        if (dlError || !fileData) throw new Error('Failed to download file');

        // 3. Extract text using GPT-4o vision
        let extractedText = '';
        const isImage = ['image/jpeg', 'image/png', 'image/webp', 'jpg', 'jpeg', 'png', 'webp']
            .some(t => doc.file_type.includes(t));

        if (isImage || doc.file_type.includes('pdf')) {
            const arrayBuffer = await fileData.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            const mimeType = doc.file_type.includes('pdf') ? 'application/pdf' : `image/${doc.file_type.split('/').pop() || 'jpeg'}`;
            const dataUrl = `data:${mimeType};base64,${base64}`;

            const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'system',
                            content: 'Extract ALL text, numbers, lab values, dates, and health data from this document. Be thorough — include every value, reference range, and note. Format clearly.',
                        },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: 'Extract all text and data from this health document.' },
                                { type: 'image_url', image_url: { url: dataUrl } },
                            ],
                        },
                    ],
                    max_tokens: 4000,
                }),
            });

            if (!visionResponse.ok) {
                throw new Error(`Vision API error: ${visionResponse.statusText}`);
            }

            const visionData = await visionResponse.json();
            extractedText = visionData.choices[0].message.content || '';
        }

        if (!extractedText) {
            await supabase.from('ai_documents')
                .update({ status: 'failed' })
                .eq('id', document_id);
            throw new Error('Could not extract text from document');
        }

        // 4. Generate summary
        const summaryResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Summarize this health document in 1-2 sentences. Focus on what type of document it is and key findings.' },
                { role: 'user', content: extractedText.slice(0, 3000) },
            ],
            max_tokens: 100,
        });
        const summary = summaryResponse.choices[0].message.content || '';

        // 5. Chunk text and generate embeddings
        const chunks = chunkText(extractedText, 1000, 100);
        let chunkCount = 0;

        for (const chunk of chunks) {
            const embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: chunk.replace(/\n/g, ' '),
            });

            await supabase.from('embeddings').insert({
                content: chunk,
                embedding: embeddingResponse.data[0].embedding,
                metadata: {
                    type: 'user_document',
                    client_id: doc.user_id,
                    document_id: doc.id,
                    file_name: doc.file_name,
                },
            });
            chunkCount++;
        }

        // 6. Update document record
        await supabase.from('ai_documents').update({
            status: 'completed',
            extracted_text: extractedText,
            summary,
            chunk_count: chunkCount,
        }).eq('id', document_id);

        // 7. Extract lab values and insights from document
        try {
            const labExtraction = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'Extract health data from this document. Return JSON with: lab_values (key-value pairs like {"Testosterone": "450 ng/dL"}), insights (array of {category, title, content} where category is one of: research, protocol_note, lab_interpretation, side_effect, interaction, recommendation). Only include actual data found.',
                    },
                    { role: 'user', content: extractedText.slice(0, 4000) },
                ],
                response_format: { type: 'json_object' },
                max_tokens: 500,
            });

            const extracted = JSON.parse(labExtraction.choices[0].message.content || '{}');

            // Merge lab values into health profile
            if (extracted.lab_values && Object.keys(extracted.lab_values).length) {
                const { data: existing } = await supabase
                    .from('ai_health_profiles')
                    .select('*')
                    .eq('user_id', doc.user_id)
                    .single();

                if (existing) {
                    await supabase.from('ai_health_profiles').update({
                        lab_values: { ...(existing.lab_values as object || {}), ...extracted.lab_values },
                        updated_at: new Date().toISOString(),
                    }).eq('user_id', doc.user_id);
                } else {
                    await supabase.from('ai_health_profiles').insert({
                        user_id: doc.user_id,
                        lab_values: extracted.lab_values,
                    });
                }
            }

            // Insert insights
            if (extracted.insights?.length) {
                const insightRows = extracted.insights.map((ins: any) => ({
                    user_id: doc.user_id,
                    category: ins.category,
                    title: ins.title,
                    content: ins.content,
                    source: 'document',
                }));
                await supabase.from('ai_learned_insights').insert(insightRows);
            }
        } catch (e) {
            console.error('Lab extraction error:', e);
        }

        return new Response(JSON.stringify({
            status: 'completed',
            summary,
            chunk_count: chunkCount,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
    }
}));

/** Chunk text with overlap */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end));
        start += chunkSize - overlap;
    }
    return chunks;
}
