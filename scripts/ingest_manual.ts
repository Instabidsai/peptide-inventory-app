
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey || !openaiKey) {
    console.error('❌ Missing Env Vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

// Manual Knowledge Base (Dr. Bachmeyer Summaries)
const KNOWLEDGE_BASE = [
    {
        title: "Retatrutide Needs Carbs",
        content: "Retatrutide is a 'Triple-G' agonist acting on GLP-1, GIP, and Glucagon receptors. Dr. Bachmeyer explains that for Retatrutide to work effectively, it requires carbohydrates. The mechanisms (specifically GLP-1 and GIP) are glucose-dependent signaling pathways. Severely restricting carbs (Keto/Carnivore) can mute the signal and reduce efficacy. He suggests improved outcomes with moderate carb intake because insulin secretion—which Retatrutide enhances—needs a glucose substrate to function optimally. It turns fat burning on via Glucagon while preserving lean mass."
    },
    {
        title: "MOTS-C vs Metformin",
        content: "Dr. Bachmeyer argues MOTS-C is superior to Metformin for longevity. Metformin works by poisoning the mitochondria slightly (hormesis) to reduce liver glucose output, but this can blunt exercise adaptation and reduce mitochondrial efficiency over time. MOTS-C, a mitochondrial-derived peptide, acts as a 'system update' for metabolism, improving insulin sensitivity, reducing systemic inflammation, and acting directly on skeletal muscle to enhance glucose uptake without the downsides of Metformin. He calls Metformin a 'band-aid' while MOTS-C fixes the root metabolic signaling."
    }
];

async function generateEmbedding(text: string) {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.replace(/\n/g, ' '),
    });
    return response.data[0].embedding;
}

async function main() {
    console.log('🧠 Starting Manual Ingestion...');

    for (const item of KNOWLEDGE_BASE) {
        console.log(`Processing: ${item.title}...`);
        const embedding = await generateEmbedding(item.content);

        const { error } = await supabase
            .from('embeddings')
            .insert({
                content: item.content,
                embedding: embedding,
                metadata: {
                    type: 'global',
                    author: 'Dr. Bachmeyer',
                    source: 'Manual Summary',
                    title: item.title,
                    ingested_at: new Date().toISOString()
                }
            });

        if (error) console.error('Error inserting:', error.message);
        else console.log('✅ Saved.');
    }
}

main();
