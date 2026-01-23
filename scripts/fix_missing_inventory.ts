
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

// Load .env explicitly from root
const envPath = path.resolve(process.cwd(), '.env');
config({ path: envPath });

console.log(`Loading env from ${envPath}`);

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
// Try all likely service key names
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase URL or Service Role Key in .env");
    console.log("Keys found:", Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log("Starting inventory repair...");

    // 1. Get recent sale movements (last 24 hours)
    // Using service role, we see all.
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
        if (!movement.contact_id) {
            console.log(`Skipping movement ${movement.id} (No contact)`);
            continue;
        }

        // Get bottle IDs
        const bottleIds = movement.movement_items.map((i: any) => i.bottle_id);
        if (bottleIds.length === 0) {
            console.log(`Skipping movement ${movement.id} (No items)`);
            continue;
        }

        // 2. Fetch bottle details
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
            if (!peptideId) {
                console.log(`Skipping bottle ${bottle.uid} (No peptide linked)`);
                continue;
            }

            // Check if inventory exists for this peptide created recently
            // Note: client_inventory has no unique constraint on (contact_id, peptide_id) usually, so we check for recent creation.
            const { data: existingInv, error: invError } = await supabase
                .from('client_inventory')
                .select('id, created_at')
                .eq('contact_id', movement.contact_id)
                .eq('peptide_id', peptideId)
                // Look for inventory created AFTER the movement started (approx)
                .gt('created_at', new Date(new Date(movement.created_at).getTime() - 60000).toISOString());

            if (invError) {
                console.error("Error checking inventory:", invError);
                continue;
            }

            if (existingInv && existingInv.length > 0) {
                // Check timestamp proximity more closely if needed, but existence is usually enough proof
                console.log(`- Inventory OK: ${peptideName} (Found ${existingInv.length})`);
                continue;
            }

            console.log(`[FIX] Creating missing inventory for ${peptideName} (Contact: ${movement.contact_id})...`);

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

            // Create it using Service Role
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
                console.log("-> SUCCESS: Restored Item.");
            }
        }
    }
    console.log("Repair complete.");
}

main();
