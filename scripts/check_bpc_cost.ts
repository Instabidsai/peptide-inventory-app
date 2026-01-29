
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
    console.log("Fetching BPC-157 Data...");

    // 1. Get Peptide
    const { data: peptide, error: pErr } = await supabase
        .from('peptides')
        .select('*')
        .ilike('name', '%BPC-157 10mg%')
        .single();

    if (pErr) { console.error("Peptide Error:", pErr); return; }
    console.log(`Product: ${peptide.name} (Retail: $${peptide.retail_price})`);

    // 2. Get Average Cost
    const { data: lots, error: lErr } = await supabase
        .from('lots')
        .select('cost_per_unit')
        .eq('peptide_id', peptide.id);

    if (lErr) { console.error("Lot Error:", lErr); return; }

    const costs = lots.map(l => Number(l.cost_per_unit));
    const avgCost = costs.length > 0
        ? costs.reduce((a, b) => a + b, 0) / costs.length
        : (peptide.retail_price || 0) * 0.3; // Fallback

    console.log(`Avg Cost: $${avgCost.toFixed(2)}`);
}

run();
