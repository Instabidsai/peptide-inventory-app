
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

const EXPECTED_INVENTORY = [
    { name: "Tirzepatide 10mg", qty: 30, cost: 11.5 },
    { name: "Tirzepatide 20mg", qty: 30, cost: 14.5 },
    { name: "Tirzepatide 30mg", qty: 20, cost: 24.5 },
    { name: "Retatrutide 10mg", qty: 50, cost: 13 },
    { name: "Retatrutide 20mg", qty: 50, cost: 19 },
    { name: "Retatrutide 30mg", qty: 20, cost: 26 },
    { name: "Retatrutide 60mg", qty: 20, cost: 40 },
    { name: "TB500 10mg", qty: 20, cost: 17 },
    { name: "TB500 20mg", qty: 30, cost: 24 },
    { name: "BPC-157 10mg", qty: 20, cost: 10.5 },
    { name: "BPC-157 20mg", qty: 50, cost: 13 },
    { name: "BPC/TB500 Blend 5mg/5mg", qty: 20, cost: 14 },
    { name: "BPC/TB500 Blend 10mg/10mg", qty: 50, cost: 18.5 },
    { name: "Tesamorelin/Ipamorelin Blnd 11mg/6mg", qty: 20, cost: 21.5 },
    { name: "CJC (no DAC)/Ipamorelin 5mg/5mg", qty: 20, cost: 14.5 },
    { name: "CJC (no DAC) 5mg", qty: 20, cost: 12.5 },
    { name: "Cagriniltide 10mg", qty: 20, cost: 19 },
    { name: "DSIP 10mg", qty: 20, cost: 11.5 },
    { name: "Epithalon 40mg", qty: 20, cost: 19 },
    { name: "FOXO4 10mg", qty: 20, cost: 38 },
    { name: "GHK-CU 100mg", qty: 50, cost: 8 },
    { name: "Glutathione 1500mg", qty: 20, cost: 14 },
    { name: "Ipamorelin 10mg", qty: 20, cost: 12 },
    { name: "Kisspeptin 10mg", qty: 20, cost: 12.5 },
    { name: "KPV 10mg", qty: 50, cost: 9 },
    { name: "LL-37 5mg", qty: 20, cost: 14.5 },
    { name: "Melanotan 2 10mg", qty: 20, cost: 10 },
    { name: "MOTS-C 40mg", qty: 50, cost: 22 },
    { name: "NAD+ 1000mg", qty: 50, cost: 15.5 },
    { name: "Oxytocin 10mg", qty: 20, cost: 11 },
    { name: "PT-141 10mg", qty: 20, cost: 10 },
    { name: "SS-31 50mg", qty: 30, cost: 39 },
    { name: "Selank 10mg", qty: 50, cost: 9 },
    { name: "Semax 10mg", qty: 50, cost: 9 },
    { name: "Sermorelin 10mg", qty: 20, cost: 17 },
    { name: "Tesamorelin 10mg", qty: 20, cost: 18 },
    { name: "Tesamorelin 20mg", qty: 20, cost: 30 },
    { name: "Thy Alpha 1 10mg", qty: 20, cost: 18 },
    { name: "VIP 10mg", qty: 20, cost: 20 },
    { name: "5-Amino 1MQ 50mg", qty: 20, cost: 13 },
    { name: "ARA-290 10mg", qty: 50, cost: 9 }
];

async function auditInventory() {
    console.log("Auditing Inventory Value...");

    // 1. Get all peptides
    const { data: peptides } = await supabase.from('peptides').select('id, name');
    if (!peptides) return;

    // 2. Map peptide names to IDs using fuzzy matching or direct lookup
    const peptideMap: Record<string, string> = {};
    peptides.forEach(p => {
        peptideMap[p.name.trim().toLowerCase()] = p.id;
    });

    console.log("\n--- DISCREPANCY REPORT ---");
    console.log("Name | Exp Qty | Act Qty | Sold | Used | Missing | Value Diff");
    console.log("-----|---------|---------|------|------|---------|-----------");

    let totalExpValue = 0;
    let totalActValue = 0;
    let totalSoldValue = 0;
    let totalUsedValue = 0;
    const totalMissingValue = 0;

    for (const item of EXPECTED_INVENTORY) {
        // Find peptide ID
        let pid = peptideMap[item.name.toLowerCase()];
        if (!pid) {
            // Try simpler match
            const match = peptides.find(p => p.name.toLowerCase().includes(item.name.toLowerCase().split(' ')[0]) && p.name.includes(item.name.split(' ').pop()!));
            if (match) pid = match.id;
        }

        if (!pid) {
            console.log(`[?] ${item.name} not found in DB`);
            continue;
        }

        // Get Stock Counts via RPC (since we know limit issue exists)
        // Actually, we can just query lots and bottles for this specific peptide

        // Fetch all bottles for this peptide
        const { data: bottles } = await supabase
            .from('bottles')
            .select('id, status')
            .eq('lot_id', (await supabase.from('lots').select('id').eq('peptide_id', pid)).data![0]?.id); // This is risky if multiple lots.

        // Better: join lots
        const { data: allBottles } = await supabase
            .from('bottles')
            .select('status, lots!inner(peptide_id)')
            .eq('lots.peptide_id', pid);

        const inStock = allBottles?.filter(b => b.status === 'in_stock').length || 0;
        const sold = allBottles?.filter(b => b.status === 'sold').length || 0;
        const used = allBottles?.filter(b => ['internal_use', 'giveaway'].includes(b.status)).length || 0;
        const totalInDB = (allBottles?.length || 0);

        const diff = item.qty - totalInDB; // Difference between Invoice and Total Records (Did we even receive them?)

        const valueDiff = (item.qty - inStock) * item.cost; // Value of what is NOT in stock (Sold + Used + Missing)
        const soldVal = sold * item.cost;
        const usedVal = used * item.cost;
        const missingVal = (item.qty - totalInDB) * item.cost;
        const stockVal = inStock * item.cost;

        totalExpValue += item.qty * item.cost;
        totalActValue += stockVal;
        totalSoldValue += soldVal;
        totalUsedValue += usedVal;

        if (stockVal !== item.qty * item.cost) {
            console.log(`${item.name.padEnd(25)} | ${item.qty} | ${inStock} | ${sold} | ${used} | ${item.qty - totalInDB} | -$${valueDiff.toFixed(2)}`);
        }
    }

    console.log("\n--- SUMMARY ---");
    console.log(`Total Invoice Value:   $${totalExpValue.toLocaleString()}`);
    console.log(`Current Stock Value:   $${totalActValue.toLocaleString()}`);
    console.log(`Difference:            -$${(totalExpValue - totalActValue).toLocaleString()}`);
    console.log("--------------------------------");
    console.log(`Value Sold:            $${totalSoldValue.toLocaleString()}`);
    console.log(`Value Given/Used:      $${totalUsedValue.toLocaleString()}`);
    console.log(`Value Never Entered:   $${(totalExpValue - totalActValue - totalSoldValue - totalUsedValue).toLocaleString()}`);
}

auditInventory();
