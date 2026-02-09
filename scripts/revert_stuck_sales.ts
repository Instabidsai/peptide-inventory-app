
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

async function revertRecentSales() {
    console.log("Searching for recent sales to Don / D Coach...");

    // 1. Find the contact ID(s) for "Don" or "D Coach"
    const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name')
        .or('name.ilike.%Don%,name.ilike.%Coach%'); // Fuzzy search

    if (!contacts || contacts.length === 0) {
        console.error("Context 'Don' or 'D Coach' not found!");
        return;
    }

    console.log("Found Contacts:", contacts.map(c => `${c.name} (${c.id})`).join(', '));
    const contactIds = contacts.map(c => c.id);

    // 2. Find Sales Movements within the last 3 days
    const { data: movements } = await supabase
        .from('movements')
        .select(`
            id, 
            movement_date, 
            type,
            contact_id,
            contacts(name),
            movement_items(
                id, 
                bottle_id, 
                bottles(
                    id, 
                    lot_id, 
                    lots(peptide_id, peptides(name))
                )
            )
        `)
        .in('contact_id', contactIds)
        .eq('type', 'sale')
        .gt('movement_date', '2026-02-05') // Filter since Feb 6
        .order('movement_date', { ascending: false });

    if (!movements || movements.length === 0) {
        console.log("No recent sales found for these contacts.");
        return;
    }

    // Filter mainly for Semax if possible, or just list all
    const targetMovements = movements.filter(m =>
        m.movement_items?.some(i => i.bottles?.lots?.peptides?.name.includes('Semax'))
    );

    console.log(`\nFound ${targetMovements.length} sales movements for Semax involving Don/Coach.`);

    if (targetMovements.length === 0) {
        console.log("No Semax sales found to revert.");
        // Maybe they sold something else? Just listing what we found.
        movements.forEach(m => {
            console.log(`Found sale of ${m.movement_items?.[0]?.bottles?.lots?.peptides?.name} on ${m.movement_date}`);
        });
        return;
    }

    // 3. Delete and Restore
    for (const m of targetMovements) {
        console.log(`\nProcessing Movement ${m.id} (${m.movement_date}) - Contact: ${m.contacts?.name}`);

        const bottleIds = m.movement_items.map(i => i.bottle_id).filter(Boolean);
        console.log(`-> Bottles to restore: ${bottleIds.length}`);

        // Restore Status
        if (bottleIds.length > 0) {
            const { error: restoreError } = await supabase
                .from('bottles')
                .update({ status: 'in_stock' })
                .in('id', bottleIds);

            if (restoreError) {
                console.error("Failed to restore bottles:", restoreError);
                continue;
            }
            console.log("-> Bottles set to 'in_stock'.");
        }

        // Delete from Client Inventory (FK Constraint)
        const { error: invError } = await supabase
            .from('client_inventory')
            .delete()
            .eq('movement_id', m.id);

        if (invError) {
            console.error("Failed to delete client inventory:", invError);
            continue;
        }
        console.log("-> Client Inventory records deleted.");

        // Delete Movement
        const { error: deleteError } = await supabase
            .from('movements')
            .delete()
            .eq('id', m.id);

        if (deleteError) {
            console.error("Failed to delete movement:", deleteError);
        } else {
            console.log("-> Movement deleted.");
        }
    }

    console.log("\nRevert Complete.");
}

revertRecentSales();
