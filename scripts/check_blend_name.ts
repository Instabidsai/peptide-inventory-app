
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

async function checkBlend() {
    console.log("Checking BPC/TB500 Blend...");

    const { data: peptides } = await supabase
        .from('peptides')
        .select('id, name')
        .ilike('name', '%Blend%');

    console.log("Found Blends:");
    peptides?.forEach(p => console.log(`- '${p.name}' (ID: ${p.id})`));

    // Check bottles for them
    for (const p of peptides || []) {
        const { count } = await supabase
            .from('bottles')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'in_stock')
            .eq('lot_id', (await supabase.from('lots').select('id').eq('peptide_id', p.id)).data?.[0]?.id || '00000000-0000-0000-0000-000000000000');
        // Wait, query above is flawed if multiple lots.

        // Better count query
        const { data: stock } = await supabase.rpc('get_peptide_stock_counts');
        const myStock = stock?.find((s: any) => s.peptide_id === p.id);
        console.log(`  > Stock: ${myStock?.stock_count || 0}`);
    }
}

checkBlend();
