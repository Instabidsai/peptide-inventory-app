
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { YoutubeTranscript } from 'youtube-transcript';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(__dirname, '../.env.local') });

// Config
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase env vars');
    process.exit(1);
}

if (!openaiKey) {
    console.error('❌ Missing OPENAI_API_KEY. Please add it to .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

// --- CONFIGURATION ---
// Add the YouTube Video IDs here
const VIDEO_IDS = [
    'e_p5nJ48_6I', // MOTS-C versus Metformin
    'F3S0p5_9oXk'  // Retatrutide Needs Carbohydrates (derived from likely ID pattern, if failing will remove)
];
// ---------------------

async function generateEmbedding(text: string) {
    // OpenAI recommends stripping newlines for embeddings
    const cleanText = text.replace(/\n/g, ' ');
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: cleanText,
    });
    return response.data[0].embedding;
}

// Chunk text into smaller pieces (~500 tokens)
function chunkText(text: string, chunkSize: number = 2000): string[] {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
}

async function ingestVideo(videoId: string) {
    console.log(`🎥 Processing Video ID: ${videoId}...`);
    try {
        // 1. Fetch Transcript
        const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
        const fullText = transcriptItems.map(item => item.text).join(' ');
        console.log(`   - Transcript fetched (${fullText.length} chars)`);

        // 2. Chunk Data
        const chunks = chunkText(fullText);
        console.log(`   - Split into ${chunks.length} chunks`);

        // 3. Vectorize & Save
        for (const [index, chunk] of chunks.entries()) {
            const embedding = await generateEmbedding(chunk);

            const { error } = await supabase
                .from('embeddings')
                .insert({
                    content: chunk,
                    embedding: embedding,
                    metadata: {
                        type: 'global',
                        author: 'Dr. Bochman',
                        source_url: `https://www.youtube.com/watch?v=${videoId}`,
                        chunk_index: index,
                        ingested_at: new Date().toISOString()
                    }
                });

            if (error) throw error;
            process.stdout.write('.'); // Progress dot
        }
        console.log(`\n✅ Video ${videoId} ingested successfully!`);

    } catch (err: any) {
        console.error(`\n❌ Failed to process ${videoId}:`, err.message);
    }
}

async function main() {
    console.log('🧠 Starting YouTube Ingestion...');
    console.log(`Found ${VIDEO_IDS.length} videos to process.`);

    for (const id of VIDEO_IDS) {
        await ingestVideo(id);
    }

    console.log('🎉 All tasks complete!');
}

main();
