
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://mckkegmkpqdicudnfhor.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function diagnose() {
    console.log("Checking movements for sales...");
    const { data: movements, error } = await supabase
        .from('movements')
        .select('id, contact_id, type, amount_paid, contacts(id, name)')
        .eq('type', 'sale')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error fetching movements:", error);
        return;
    }

    console.log("\nRecent Sales Movements:");
    movements.forEach(m => {
        console.log(`ID: ${m.id}, ContactID: ${m.contact_id}, ContactName: ${(m as any).contacts?.name || 'MISSING'}, Amount: ${m.amount_paid}`);
    });

    console.log("\nChecking for Jordan Thompson specifically...");
    const { data: jordan, error: jError } = await supabase
        .from('contacts')
        .select('id, name')
        .ilike('name', '%Jordan%');

    if (jError) {
        console.error("Error fetching Jordan:", jError);
        return;
    }

    if (jordan && jordan.length > 0) {
        console.log("Found contacts matching 'Jordan':", jordan);
        const jordanId = jordan[0].id;

        const { data: jordanMovements, error: jmError } = await supabase
            .from('movements')
            .select('id, type, contact_id, contacts(id, name)')
            .eq('contact_id', jordanId);

        if (jmError) console.error("Error fetching Jordan movements:", jmError);
        console.log(`\nMovements for Jordan (${jordanId}):`, jordanMovements?.length || 0);
        jordanMovements?.forEach(jm => {
            console.log(`  Movement ID: ${jm.id}, Type: ${jm.type}, ContactName: ${(jm as any).contacts?.name || 'MISSING'}`);
        });

    } else {
        console.log("No contacts found matching 'Jordan'.");
    }

    console.log("\nChecking for missing names in movements_items -> movements -> contacts...");
    const { data: history, error: hError } = await supabase
        .from("movement_items")
        .select(`
          id,
          movements!inner (
            id,
            type,
            contacts (
              name
            )
          )
        `)
        .eq("movements.type", "sale")
        .limit(10);

    if (hError) {
        console.error("Error fetching history join:", hError);
    } else {
        console.log("\nHistory Join Check:");
        history.forEach((h: any) => {
            console.log(`Item ID: ${h.id}, Move ID: ${h.movements.id}, Contact Name: ${h.movements.contacts?.name || 'MISSING'}`);
        });
    }
}

diagnose();
