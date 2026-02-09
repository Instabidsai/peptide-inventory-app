
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInventory() {
    console.log("----------------------------------------------------------------");
    console.log("AUDITING INVENTORY: Semax & Selank");
    console.log("----------------------------------------------------------------");

    // 1. Get Peptide IDs
    const { data: peptides } = await supabase
        .from('peptides')
        .select('id, name')
        .or('name.ilike.%Semax%,name.ilike.%Selank%'); // Loose match for variety

    if (!peptides || peptides.length === 0) {
        console.log("No peptides found matching 'Semax' or 'Selank'.");
        return;
    }

    for (const p of peptides) {
        console.log(`\nPEPTIDE: ${p.name} (${p.id})`);

        // 2. Check Lots (Received Inventory)
        const { data: lots } = await supabase
            .from('lots')
            .select('*')
            .eq('peptide_id', p.id)
            .order('created_at', { ascending: true });

        console.log(`  LOTS FOUND: ${lots?.length || 0}`);
        let totalReceived = 0;
        lots?.forEach(l => {
            console.log(`    - Lot: ${l.lot_number} | Qty: ${l.quantity_received} | Date: ${l.created_at}`);
            totalReceived += l.quantity_received;
        });
        console.log(`  TOTAL RECEIVED (Acc. to Lots): ${totalReceived}`);

        // 3. Check Bottles (Actual Units in System)
        const { count: bottleCount, error: bError } = await supabase
            .from('bottles')
            .select('*', { count: 'exact', head: true })
            .in('lot_id', lots?.map(l => l.id) || []);

        if (bError) console.error("    Error counting bottles:", bError.message);
        console.log(`  TOTAL BOTTLES CREATED: ${bottleCount}`);

        // 4. Check Current Status
        const { data: statusCounts } = await supabase
            .from('bottles')
            .select('status')
            .in('lot_id', lots?.map(l => l.id) || []);

        const inStock = statusCounts?.filter(b => b.status === 'in_stock').length || 0;
        const sold = statusCounts?.filter(b => b.status === 'sold').length || 0;
        const other = (statusCounts?.length || 0) - inStock - sold;

        console.log(`  CURRENT STATUS:`);
        console.log(`    - In Stock: ${inStock}`);
        console.log(`    - Sold: ${sold}`);
        console.log(`    - Other: ${other}`);

        if (bottleCount !== totalReceived) {
            console.log(`  ⚠️ MISMATCH: Lots say ${totalReceived} received, but only ${bottleCount} bottles exist!`);
            console.log(`     Likely cause: 'create_bottles_for_lot' trigger failed or RLS blocked insert.`);
        }
    }
}

checkInventory();
