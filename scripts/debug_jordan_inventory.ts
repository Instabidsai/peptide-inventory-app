
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugJordan() {
    console.log("--- Debugging Final Root Cause ---");

    // 1. Find the contact
    const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .ilike('name', '%Jordan Thompson%')
        .single();

    if (!contact) {
        console.error("Jordan not found");
        return;
    }

    // 2. Find movements
    const { data: movements } = await supabase
        .from('movements')
        .select('*, movement_items(*)')
        .eq('contact_id', contact.id);

    if (!movements || movements.length === 0) {
        console.log("No movements found.");
        return;
    }

    const movement = movements[0];
    console.log(`Movement: ${movement.type} on ${movement.movement_date}`);

    for (const item of movement.movement_items) {
        console.log(`Checking Item with Bottle ID: ${item.bottle_id}`);

        // Check Bottle
        const { data: bottle } = await supabase
            .from('bottles')
            .select('*, lots(*, peptides(name))')
            .eq('id', item.bottle_id)
            .single();

        if (bottle) {
            console.log(`Bottle found: ${bottle.uid}, Status: ${bottle.status}`);
            console.log(`Lot data: ${bottle.lots ? JSON.stringify(bottle.lots) : 'NULL'}`);
        } else {
            console.log("Bottle NOT FOUND in table!");
        }
    }

    // 3. Check client_inventory one last time
    const { data: inventory } = await supabase
        .from('client_inventory')
        .select('*')
        .eq('contact_id', contact.id);

    console.log(`Inventory records for Jordan: ${inventory?.length || 0}`);
}

debugJordan();
