
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

async function diagnoseSemax() {
    console.log("Analyzing Semax Inventory...");

    // 1. Get Peptide ID
    const { data: peptides } = await supabase
        .from('peptides')
        .select('id, name')
        .ilike('name', '%Semax%');

    if (!peptides || peptides.length === 0) {
        console.error("Semax not found!");
        return;
    }

    const semax = peptides[0];
    console.log(`Found Peptide: ${semax.name} (${semax.id})`);

    // 2. Get All Lots
    const { data: lots } = await supabase
        .from('lots')
        .select('*')
        .eq('peptide_id', semax.id);

    console.log("\n--- LOTS ---");
    let totalReceived = 0;
    lots?.forEach(l => {
        console.log(`Lot ${l.lot_number}: Received ${l.quantity_received} on ${l.created_at}`);
        totalReceived += l.quantity_received;
    });
    console.log(`Total Received: ${totalReceived}`);

    // 3. Get All Bottles and their Status
    const { data: bottles } = await supabase
        .from('bottles')
        .select(`
            id, 
            status, 
            lot_id, 
            created_at,
            movement_items (
                id,
                movement_id,
                movements (
                    id, type, movement_date, contacts(name)
                )
            )
        `)
        .in('lot_id', lots!.map(l => l.id));

    console.log("\n--- BOTTLE STATUS BREAKDOWN ---");
    const statusCounts: Record<string, number> = {};
    const ghostBottles: any[] = [];
    const validSold: any[] = [];

    bottles?.forEach(b => {
        statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;

        if (b.status === 'sold') {
            const hasMovement = b.movement_items && b.movement_items.length > 0;
            const validMovement = hasMovement && b.movement_items[0].movements;

            if (!validMovement) {
                ghostBottles.push(b);
            } else {
                validSold.push(b);
            }
        }
    });

    console.log(JSON.stringify(statusCounts, null, 2));

    console.log(`\nTotal Bottles in DB: ${bottles?.length}`);
    console.log(`Expected (from Lots): ${totalReceived}`);

    if (ghostBottles.length > 0) {
        console.log("\n--- 👻 GHOST BOTTLES DETECTED (Status 'Sold' but no valid Movement) ---");
        console.log(`Count: ${ghostBottles.length}`);
        ghostBottles.forEach(b => {
            console.log(`Bottle ID: ${b.id} | Lot: ${b.lot_id}`);
        });
    } else {
        console.log("\nNo 'Ghost' bottles found (all sold bottles have valid movements).");
    }

    // 4. Check specifically for 'D Coach' deletions
    // If the user said they deleted 'D Coach' orders, but we still see them in history...
    // Let's see if we can find any "Deleted" movements that still have items? 
    // (Supabase doesn't interpret soft deletes unless we implemented them. We assume hard delete).

    // Let's list the most recent sales to see what's actually there
    console.log("\n--- RECENT VALID SALES ---");
    validSold.sort((a, b) => new Date(b.movement_items[0].movements.movement_date).getTime() - new Date(a.movement_items[0].movements.movement_date).getTime());
    validSold.slice(0, 15).forEach(b => {
        const m = b.movement_items[0].movements;
        console.log(`${m.movement_date}: Sold to ${m.contacts?.name} (Bottle: ${b.id})`);
    });

}

diagnoseSemax();
