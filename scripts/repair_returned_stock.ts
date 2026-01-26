import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

async function repairData() {
    console.log('--- START REPAIR ---');

    // 1. Find the movement for the 2 Semax vials from today (or recently)
    // The user said they returning 2 Semax and balance is $13.
    const { data: movements, error: mError } = await supabase
        .from('movements')
        .select(`
            id, 
            status, 
            payment_status,
            contact_id,
            movement_items (
                id, 
                bottle_id,
                price_at_sale,
                bottles (
                    id, 
                    uid, 
                    status,
                    lots (peptide_id, peptides (name))
                )
            )
        `)
        .eq('type', 'sale')
        .order('created_at', { ascending: false })
        .limit(5);

    if (mError) {
        console.error('Error fetching movements:', mError);
        return;
    }

    const targetMovement = movements?.find(m =>
        m.movement_items?.some((mi: any) => mi.bottles?.lots?.peptides?.name.includes('Semax')) &&
        m.movement_items?.length >= 2
    );

    if (!targetMovement) {
        console.log('Could not find a recent Semax movement with 2+ items.');
        console.log('All recent movements:', JSON.stringify(movements, null, 2));
        return;
    }

    console.log(`Found Target Movement: ${targetMovement.id} (Status: ${targetMovement.status})`);

    // 2. Check if these bottles are in client_inventory
    const bottleIds = targetMovement.movement_items.map((mi: any) => mi.bottle_id);

    // Actually, client_inventory doesn't have bottle_id (as suspected).
    // We check if there are ANY entries in client_inventory for this movement.
    const { data: inventory } = await supabase
        .from('client_inventory')
        .select('*')
        .eq('movement_id', targetMovement.id);

    console.log(`Inventory items remaining for this movement: ${inventory?.length || 0}`);

    if (inventory?.length === 0) {
        console.log('All items were removed from fridge. Ensuring bottles are restocked...');

        // 3. Update all bottles in this movement to 'in_stock'
        const { error: bError } = await supabase
            .from('bottles')
            .update({ status: 'in_stock' })
            .in('id', bottleIds);

        if (bError) console.error('Error updating bottles:', bError);
        else console.log('✅ Successfully restored bottles to stock.');

        // 4. Mark movement as 'returned' to clear balance
        const { error: statusError } = await supabase
            .from('movements')
            .update({ status: 'returned' })
            .eq('id', targetMovement.id);

        if (statusError) console.error('Error updating movement status:', statusError);
        else console.log('✅ Successfully marked movement as returned.');

    } else {
        console.log('Some items still remain in fridge. Please investigate manually or trigger return from UI.');
    }

    console.log('--- END REPAIR ---');
}

repairData();
