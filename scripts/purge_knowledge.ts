
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function purgeAll() {
    console.log('🧹 Purging ALL knowledge from the Brain...');

    const { error, count } = await supabase
        .from('embeddings')
        .delete({ count: 'exact' })
        .not('id', 'is', null); // Delete all rows where ID is distinct from null (all rows)

    if (error) {
        console.error('❌ Purge Error:', error.message);
    } else {
        console.log(`✅ Brain Wiped. Deleted ${count} records.`);
        console.log('   The AI is now a blank slate (Tabula Rasa).');
        console.log('   Ready for "Exact Video" ingestion.');
    }
}

purgeAll();
