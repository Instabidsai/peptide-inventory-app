
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

const OVERHEAD = 4.00;

async function run() {
    console.log("Fetching ALL Peptides...");

    // 1. Fetch Peptides
    const { data: peptides, error } = await supabase
        .from('peptides')
        .select('id, name, retail_price, active')
        .eq('active', true)
        .order('name');

    if (error || !peptides) { console.error("Error fetching peptides:", error); return; }

    let report = `# Full Inventory Commission Report\n\n`;
    report += `**Generated:** ${new Date().toLocaleString()}\n`;
    report += `**Parameters:** Overhead $${OVERHEAD.toFixed(2)} | Comm Tiers: 0%, 5%, 10%, 15%\n\n`;

    console.log(`Processing ${peptides.length} peptides...`);

    for (const p of peptides) {
        // 2. Get Avg Cost
        const { data: lots } = await supabase
            .from('lots')
            .select('cost_per_unit')
            .eq('peptide_id', p.id);

        const costs = lots?.map(l => Number(l.cost_per_unit)) || [];
        // Weighted avg is better if we had counts, but simple avg is okay for now or fallback
        const avgCost = costs.length > 0
            ? costs.reduce((a, b) => a + b, 0) / costs.length
            : (p.retail_price || 0) * 0.3;

        const baseCost = avgCost + OVERHEAD;
        const retail = p.retail_price || 0;

        report += `### ${p.name}\n`;
        report += `- **Avg Cost:** $${avgCost.toFixed(2)} | **Base Cost:** $${baseCost.toFixed(2)} | **MSRP:** $${retail.toFixed(2)}\n\n`;

        report += `| Tier | Sell Price | Comm % | Partner Earns | Admin Profit | Admin Margin % |\n`;
        report += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

        // Scenarios
        const tiers = [
            { name: "At Cost", price: baseCost, commRate: 0.00 },
            { name: "2x Cost", price: baseCost * 2, commRate: 0.05 },
            { name: "3x Cost", price: baseCost * 3, commRate: 0.10 },
            { name: "MSRP", price: retail, commRate: 0.15 }
        ];

        for (const t of tiers) {
            // Logic: if MSRP < Cost, handle gracefully? 
            if (t.name === "MSRP" && t.price <= baseCost) continue; // Skip if MSRP is broken

            const commAmt = t.price * t.commRate;
            const netProfit = t.price - commAmt - avgCost; // Profit = Revenue - Comm - InventoryCost
            // Note: Admin Profit in previous logic included Overhead recovery? 
            // Previous: Profit = $4.00 at Cost. 
            // Math: $14.50 (Price) - $0 (Comm) - $10.50 (Inv) = $4.00. Correct.

            const margin = t.price > 0 ? (netProfit / t.price) * 100 : 0;

            report += `| ${t.name} | $${t.price.toFixed(2)} | ${(t.commRate * 100).toFixed(0)}% | $${commAmt.toFixed(2)} | $${netProfit.toFixed(2)} | **${margin.toFixed(1)}%** |\n`;
        }
        report += `\n---\n\n`;
    }

    // Write to file
    const outPath = path.resolve(process.cwd(), 'full_commission_report.md');
    fs.writeFileSync(outPath, report);
    console.log(`Report written to ${outPath}`);
}

run();
