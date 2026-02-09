
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

async function debugFinancials() {
    console.log("Debugging Financial Metrics...");

    // 1. Sales & COGS
    const { data: sales } = await supabase
        .from('movements')
        .select('id, amount_paid')
        .eq('type', 'sale');

    const salesRevenue = sales?.reduce((sum, s) => sum + (s.amount_paid || 0), 0) || 0;
    console.log(`Sales Revenue: $${salesRevenue.toFixed(2)}`);

    // Calculate COGS
    // We'll skip the full COGS complex logic here and just trust the hook? 
    // No, better to try to approximate or replicate if possible. 
    // Let's assume COGS is roughly Revenue / 2 for now, or just look at previous dashboard.
    // Dashboard implies COGS + Overhead = Loss + Revenue. 
    // $5489 (Loss) + $701 (Rev) = $6190 (Total Cost).
    // Ops Overhead is $5053.
    // So COGS = $6190 - $5053 = $1137.

    // 2. Internal Overhead
    const { data: overheadMoves } = await supabase
        .from('movements')
        .select('id')
        .in('type', ['internal_use', 'giveaway', 'loss']);

    // We need to calculate value of these.
    // ... skipping deep calculation logic for brevity, assuming small number.

    // 3. Expenses Table
    const { data: expenses } = await supabase
        .from('expenses')
        .select('*');

    let inventoryExp = 0;
    let operatingExp = 0;

    console.log("\n--- Expenses ---");
    expenses?.forEach(e => {
        const amt = Number(e.amount);
        console.log(`- ${e.date} [${e.category}] ${e.description}: $${amt}`);
        if (e.category === 'inventory') {
            inventoryExp += amt;
        } else {
            operatingExp += amt;
        }
    });

    console.log("\n--- Totals ---");
    console.log(`Operating Expenses (Cash): $${operatingExp.toFixed(2)}`);
    console.log(`Inventory Expenses (Cash): $${inventoryExp.toFixed(2)}`);

    const internalOverheadEst = 0; // Placeholder

    const opsOverheadTotal = operatingExp + internalOverheadEst;
    const opsProfit = salesRevenue - opsOverheadTotal; // Ignoring COGS for a sec

    console.log(`\nEst. Ops Profit (excl COGS): $${salesRevenue} - $${opsOverheadTotal} = $${opsProfit.toFixed(2)}`);

    const totalCashFlow = salesRevenue - (opsOverheadTotal + inventoryExp);
    console.log(`Est. Net Cash Flow (excl COGS): $${totalCashFlow.toFixed(2)}`);
}

debugFinancials();
