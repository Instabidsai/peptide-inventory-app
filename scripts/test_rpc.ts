
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testRPC() {
    console.log("Testing 'get_peptide_stock_counts'...");

    const { data, error } = await supabase.rpc('get_peptide_stock_counts');

    if (error) {
        console.error("❌ RPC Failed:", error.message);
    } else {
        console.log(`✅ RPC Success! Received ${data.length} records.`);
        console.log("Sample:", data.slice(0, 3));

        // Check for Semax specifically
        // Note: RPC returns plain objects, keys might be lowercase
        const semaxId = 'c88d6990-cd75-4a9a-9051-d09260afd4dd'; // From previous logs
        const semax = data.find((d: any) => d.peptide_id === semaxId);
        if (semax) {
            console.log(`\nSemax Count from RPC: ${semax.stock_count}`);
        } else {
            console.log("\nSemax not found in RPC output (maybe 0 stock?)");
        }
    }
}

testRPC();
