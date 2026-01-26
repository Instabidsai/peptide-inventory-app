
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU";


const supabase = createClient(supabaseUrl, supabaseKey);

async function debugJordan() {
    console.log("--- Debugging Contacts ---");

    // 1. Find the contact
    const { data: contacts, error: contactError } = await supabase
        .from('contacts')
        .select('*');

    if (contactError || !contacts || contacts.length === 0) {
        console.error("Contacts not found:", contactError?.message);
        return;
    }

    console.log(`Total contacts found: ${contacts.length}`);
    const contact = contacts.find(c => c.name.toLowerCase().includes('jordan')) || contacts[0];

    console.log(`Selected Contact: ${contact.name} (${contact.id})`);
    console.log(`Linked User ID: ${contact.linked_user_id}`);

    // 2. Check Movements
    const { data: movements } = await supabase
        .from('movements')
        .select('*, movement_items(*)')
        .eq('contact_id', contact.id);

    console.log(`Movements found: ${movements?.length || 0}`);
    movements?.forEach(m => {
        console.log(`- ${m.type} on ${m.movement_date}, items: ${m.movement_items?.length}`);
    });

    // 3. Check Client Inventory
    const { data: inventory } = await supabase
        .from('client_inventory')
        .select('*, peptide:peptides(name)')
        .eq('contact_id', contact.id);

    console.log(`Inventory records found: ${inventory?.length || 0}`);
    inventory?.forEach(inv => {
        console.log(`- ${inv.peptide?.name}, Status: ${inv.status}, Qty: ${inv.current_quantity_mg}mg`);
    });

    // 4. Check Protocols
    const { data: protocols } = await supabase
        .from('protocols')
        .select('*, protocol_items(*)')
        .eq('contact_id', contact.id);

    console.log(`Protocols found: ${protocols?.length || 0}`);
    protocols?.forEach(p => {
        console.log(`- ${p.name}, Items: ${p.protocol_items?.length}`);
    });
}

debugJordan();
