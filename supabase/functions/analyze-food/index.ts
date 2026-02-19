
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
}

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
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

        const { image } = await req.json()

        if (!image) {
            throw new Error('Image data is required')
        }

        const openAiKey = Deno.env.get('OPENAI_API_KEY')
        if (!openAiKey) {
            throw new Error('Missing OPENAI_API_KEY')
        }

        console.log(`Analyzing food image for user ${user.id}`)

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert nutritionist and food analyst.
                        Analyze the provided image and identify all food items.
                        Estimate the portion size and nutritional content (Calories, Protein, Carbs, Fat) for each item.

                        Return ONLY valid JSON in the following format, with no markdown formatting:
                        {
                            "foods": [
                                {
                                    "name": "Food Name",
                                    "quantity": "Estimated Quantity (e.g. 6oz, 1 cup)",
                                    "calories": 100,
                                    "protein": 10,
                                    "carbs": 20,
                                    "fat": 5
                                }
                            ],
                            "total_calories": 0,
                            "total_protein": 0,
                            "total_carbs": 0,
                            "total_fat": 0
                        }

                        If you cannot identify food, return an empty "foods" array.`
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Analyze this meal." },
                            {
                                type: "image_url",
                                image_url: {
                                    "url": image
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 1000
            })
        })

        if (!response.ok) {
            const err = await response.text()
            console.error("OpenAI API Error:", err)
            throw new Error(`OpenAI API Error: ${response.statusText}`)
        }

        const data = await response.json()
        const content = data.choices[0].message.content

        const cleanJson = content.replace(/```json\n?|```/g, '').trim()
        const parsedData = JSON.parse(cleanJson)

        return new Response(
            JSON.stringify(parsedData),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            },
        )

    } catch (error) {
        console.error('Error:', error.message)
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            },
        )
    }
})
