
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
    console.log("Fetching 5 Example Peptides...");

    // 1. Fetch 5 Random Active Peptides
    const { data: peptides, error } = await supabase
        .from('peptides')
        .select('id, name, retail_price')
        .eq('active', true)
        .limit(5);

    if (error || !peptides) { console.error("Error fetching peptides:", error); return; }

    console.log("Analyzing...");

    for (const p of peptides) {
        // 2. Get Avg Cost for each
        const { data: lots } = await supabase
            .from('lots')
            .select('cost_per_unit')
            .eq('peptide_id', p.id);

        const costs = lots?.map(l => Number(l.cost_per_unit)) || [];
        const avgCost = costs.length > 0
            ? costs.reduce((a, b) => a + b, 0) / costs.length
            : (p.retail_price || 0) * 0.3; // Fallback

        // 3. Output Data for Agent to Process
        console.log(JSON.stringify({
            name: p.name,
            retail: p.retail_price || 0,
            avg_cost: avgCost
        }));
    }
}

run();
