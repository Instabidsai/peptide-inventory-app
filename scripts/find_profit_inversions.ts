
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

const OVERHEAD = 4.00;

async function run() {
    console.log("Checking for Profit Inversions...");

    const { data: peptides } = await supabase
        .from('peptides')
        .select('id, name, retail_price, active')
        .eq('active', true);

    if (!peptides) return;

    console.log(`Analyzing ${peptides.length} peptides...`);
    console.log(`| Peptide | 3x Price | 3x Profit | MSRP | MSRP Profit | Diff |`);
    console.log(`|---|---|---|---|---|---|`);

    let count = 0;

    for (const p of peptides) {
        const { data: lots } = await supabase.from('lots').select('cost_per_unit').eq('peptide_id', p.id);
        const costs = lots?.map(l => Number(l.cost_per_unit)) || [];
        const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : (p.retail_price || 0) * 0.3;

        const baseCost = avgCost + OVERHEAD;
        const msrp = p.retail_price || 0;

        if (msrp === 0) continue;

        // Calculate 3x Scenario (10% Comm)
        const price3x = baseCost * 3;
        // Only relevant if 3x is actually LOWER than MSRP (otherwise we hide it anyway)
        if (price3x >= msrp) continue;

        const comm3x = price3x * 0.10;
        const profit3x = price3x - avgCost - comm3x;
        // Note: Profit formula: Revenue - (InventoryCost) - Commission. 
        // (InventoryCost is avgCost, NOT baseCost. BaseCost includes overhead which is part of profit).

        // Calculate MSRP Scenario (15% Comm)
        const commMsrp = msrp * 0.15;
        const profitMsrp = msrp - avgCost - commMsrp;

        if (profitMsrp < profit3x) {
            count++;
            const diff = profit3x - profitMsrp;
            console.log(`| ${p.name} | $${price3x.toFixed(2)} | $${profit3x.toFixed(2)} | $${msrp.toFixed(2)} | $${profitMsrp.toFixed(2)} | -$${diff.toFixed(2)} |`);
        }
    }

    if (count === 0) console.log("No inversions found.");
}

run();
