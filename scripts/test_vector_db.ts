
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try multiple paths
dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(__dirname, '../.env.local') }); // Also try .local

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

console.log('--- Env Debug ---');
console.log('Trying to resolve env from:', resolve(__dirname, '../'));
console.log('Available Keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
console.log('Supabase URL Found:', !!supabaseUrl);
console.log('Supabase Key Found:', !!supabaseKey);
console.log('-----------------');

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase env vars. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY are set in .env or .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testVectorDB() {
    console.log('🧪 Testing Vector Database connection...');

    // 1. Create a dummy vector (1536 dimensions, all 0.1)
    // We use 0.01 to match the float format expected
    const dummyVector = Array(1536).fill(0.01);

    // 2. Insert dummy row
    const { data, error } = await supabase
        .from('embeddings')
        .insert({
            content: 'System Smoke Test',
            metadata: { type: 'test', timestamp: new Date().toISOString() },
            embedding: dummyVector
        })
        .select()
        .single();

    if (error) {
        console.error('❌ Insert Failed:', error.message);
        console.error('Details:', error);
        return;
    }

    console.log('✅ Insert Successful! ID:', data.id);

    // 3. Clean up
    const { error: deleteError } = await supabase
        .from('embeddings')
        .delete()
        .eq('id', data.id);

    if (deleteError) {
        console.warn('⚠️ Cleanup Failed:', deleteError.message);
    } else {
        console.log('✅ Cleanup Successful');
    }

    console.log('🎉 Vector Database is fully operational!');
}

testVectorDB();
