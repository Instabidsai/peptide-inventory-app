
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

async function diagnoseARA() {
    console.log("Analyzing ARA-290 Inventory...");

    // 1. Get Peptide ID
    const { data: peptides } = await supabase
        .from('peptides')
        .select('id, name')
        .ilike('name', '%ARA-290%');

    if (!peptides || peptides.length === 0) {
        console.error("ARA-290 not found!");
        return;
    }

    const peptide = peptides[0];
    console.log(`Found Peptide: ${peptide.name} (${peptide.id})`);

    // 2. Get All Lots
    const { data: lots } = await supabase
        .from('lots')
        .select('*')
        .eq('peptide_id', peptide.id);

    console.log("\n--- LOTS ---");
    let totalReceived = 0;
    lots?.forEach(l => {
        console.log(`Lot ${l.lot_number} (ID: ${l.id}): Received ${l.quantity_received} on ${l.created_at}`);
        totalReceived += l.quantity_received;
    });
    console.log(`Total Received: ${totalReceived}`);

    // 3. Get All Bottles and their Status
    const { data: bottles } = await supabase
        .from('bottles')
        .select('id, status, lot_id, created_at')
        .in('lot_id', lots!.map(l => l.id));

    console.log("\n--- BOTTLE STATUS BREAKDOWN ---");
    const statusCounts: Record<string, number> = {};
    const bottlesByLot: Record<string, number> = {};

    bottles?.forEach(b => {
        statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
        bottlesByLot[b.lot_id] = (bottlesByLot[b.lot_id] || 0) + 1;
    });

    console.log(JSON.stringify(statusCounts, null, 2));

    console.log("\n--- BOTTLES PER LOT ---");
    Object.entries(bottlesByLot).forEach(([lotId, count]) => {
        const lot = lots?.find(l => l.id === lotId);
        console.log(`Lot ${lot?.lot_number} (${lotId}): ${count} bottles`);
    });

    console.log(`\nTotal Bottles in DB: ${bottles?.length}`);

    // 4. Check query limit simulation
    console.log("\n--- QUERY LIMIT CHECK ---");
    // Simulate what usePeptides does
    const { data: limitedBottles, count } = await supabase
        .from('bottles')
        .select('id', { count: 'exact' })
        .eq('status', 'in_stock')
        .limit(5000); // The new limit

    console.log(`Total 'in_stock' bottles in ENTIRE SYSTEM (Limit 5000): ${limitedBottles?.length}`);
    console.log(`Real Total count from DB: ${count}`);

    if (limitedBottles && limitedBottles.length >= 5000) {
        console.error("⚠️  WARNING: We are hitting the 5000 limit! That explains why bottles are missing.");
    } else {
        console.log("✅ We are under the 5000 limit.");
    }
}

diagnoseARA();
