
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// fast-check to ensure we can read .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!; // use service role if possible? No, I only have anon usually. checking env.
// Actually, I should check if I have service role.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey!);

async function main() {
    console.log("Starting inventory repair...");

    // 1. Get recent sale movements (last 24 hours)
    const { data: movements, error: mvError } = await supabase
        .from('movements')
        .select(`
            id, 
            contact_id, 
            type, 
            created_at, 
            movement_items (
                bottle_id, 
                price_at_sale
            )
        `)
        .eq('type', 'sale')
        .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (mvError) {
        console.error("Error fetching movements:", mvError);
        return;
    }

    console.log(`Found ${movements?.length} sale movements in last 24h.`);

    for (const movement of movements || []) {
        if (!movement.contact_id) continue;

        // Get bottle IDs
        const bottleIds = movement.movement_items.map((i: any) => i.bottle_id);
        if (bottleIds.length === 0) continue;

        // 2. Check if inventory exists for these bottles? 
        // Client inventory doesn't link to bottle_id directly usually? 
        // Wait, schema check. `client_inventory` has `peptide_id`.
        // It doesn't allow tracking "which exact bottle".
        // But we can check if *any* inventory was created for this contact & peptide around this time.

        // Fetch bottle details to know what peptides they are
        // We use service role so we should see them even if sold.
        const { data: bottles, error: bError } = await supabase
            .from('bottles')
            .select('id, uid, lots(id, lot_number, peptide_id, peptides(id, name))')
            .in('id', bottleIds);

        if (bError) {
            console.error("Error fetching bottles:", bError);
            continue;
        }

        for (const bottle of bottles || []) {
            const peptideId = bottle.lots?.peptide_id;
            const peptideName = bottle.lots?.peptides?.name;
            if (!peptideId) continue;

            // Check if user has inventory for this peptide created recently
            const { data: existingInv, error: invError } = await supabase
                .from('client_inventory')
                .select('id')
                .eq('contact_id', movement.contact_id)
                .eq('peptide_id', peptideId)
                .gt('created_at', new Date(new Date(movement.created_at).getTime() - 5000).toISOString()) // Created after movement start
                .lt('created_at', new Date(new Date(movement.created_at).getTime() + 60000).toISOString()); // Created within 1 min

            if (invError) {
                console.error("Error checking inventory:", invError);
                continue;
            }

            if (existingInv && existingInv.length > 0) {
                console.log(`Inventory exists for ${peptideName} (Contact: ${movement.contact_id})`);
                continue;
            }

            console.log(`MISSING inventory for ${peptideName} (Contact: ${movement.contact_id}). creating...`);

            // Parse size
            const parseVialSize = (name: string): number => {
                const match = name.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|iu)/i);
                if (!match) return 5;
                const val = parseFloat(match[1]);
                const unit = match[2].toLowerCase();
                if (unit === 'mcg') return val / 1000;
                return val;
            };
            const vialSizeMg = parseVialSize(peptideName || '');

            // Create it
            const { error: insertError } = await supabase
                .from('client_inventory')
                .insert({
                    contact_id: movement.contact_id,
                    peptide_id: peptideId,
                    batch_number: bottle.lots?.lot_number,
                    vial_size_mg: vialSizeMg,
                    water_added_ml: 2.0, // Default
                    current_quantity_mg: vialSizeMg,
                    concentration_mg_ml: vialSizeMg / 2.0,
                    status: 'active'
                });

            if (insertError) {
                console.error("Failed to insert inventory:", insertError);
            } else {
                console.log("-> Restored.");
            }
        }
    }
    console.log("Done.");
}

main();
