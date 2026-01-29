
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

async function testRAG(question: string) {
    console.log(`\n🤔 Question: "${question}"`);
    console.log('1️⃣  Generating Embedding...');

    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: question.replace(/\n/g, ' '),
    });
    const embedding = embeddingResponse.data[0].embedding;

    console.log('2️⃣  Searching Vector DB...');
    const { data: documents, error } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 5,
    });

    if (error) {
        console.error('❌ Search Error:', error.message);
        return;
    }

    if (!documents || documents.length === 0) {
        console.log('⚠️  No relevant documents found.');
        return;
    }

    console.log(`   Found ${documents.length} relevant chunks.`);
    documents.forEach((doc: any) => console.log(`   - [${doc.similarity.toFixed(2)}] ${doc.content.substring(0, 50)}...`));

    console.log('3️⃣  Generating AI Response...');
    const contextText = documents.map((doc: any) => doc.content).join('\n---\n');
    const systemPrompt = `You are an expert Peptide AI. Use the context to answer. Context:\n${contextText}`;

    const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question }
        ],
        temperature: 0.5,
    });

    console.log('\n🤖 AI Answer:');
    console.log(chatResponse.choices[0].message.content);
}

async function main() {
    await testRAG("Why does Retatrutide need carbs?");
    await testRAG("Is Metformin good for longevity?");
}

main();
