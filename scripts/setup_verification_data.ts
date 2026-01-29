
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupVerificationData() {
    console.log("Starting Verification Setup...");
    const email = 'client_test_thread@test.com';

    // 1. Get User ID
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) throw userError;

    const user = users.find(u => u.email === email);
    if (!user) {
        console.error(`User ${email} not found. Please run create_client_user.ts first or create manually.`);
        return;
    }
    console.log(`Found User: ${user.id}`);

    // 2. Need Org ID
    const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single();
    if (!orgData) { console.error("No Org Found"); return; }
    const orgId = orgData.id;

    // 3. Check/Create Contact
    const { data: existingContact } = await supabase
        .from('contacts')
        .select('*')
        .eq('email', email)
        .maybeSingle();

    let contactId;

    if (existingContact) {
        console.log(`Found Existing Contact: ${existingContact.id}`);
        contactId = existingContact.id;

        // Ensure linked
        if (existingContact.linked_user_id !== user.id) {
            await supabase.from('contacts').update({ linked_user_id: user.id }).eq('id', contactId);
            console.log("Linked Contact to User.");
        }
    } else {
        console.log("Creating Contact...");
        const { data: newContact, error: createError } = await supabase
            .from('contacts')
            .insert({
                name: 'Test Client Thread',
                email: email,
                type: 'customer',
                org_id: orgId,
                tier: 'family',
                linked_user_id: user.id
            })
            .select()
            .single();

        if (createError) throw createError;
        contactId = newContact.id;
        console.log(`Created Contact: ${contactId}`);
    }

    // 3. Ensure Inventory or Protocol Data (so Regimen page isn't empty)
    // We'll add a dummy peptide to their inventory
    const { data: peptides } = await supabase.from('peptides').select('id').limit(1);
    if (peptides && peptides.length > 0) {
        const peptideId = peptides[0].id;

        const { data: existingInv } = await supabase
            .from('client_inventory')
            .select('*')
            .eq('contact_id', contactId);

        if (!existingInv || existingInv.length === 0) {
            console.log("Seeding Inventory...");
            await supabase.from('client_inventory').insert({
                contact_id: contactId,
                peptide_id: peptideId,
                vial_size_mg: 10,
                water_added_ml: 2,
                current_quantity_mg: 10,
                status: 'active' // Important for Regimen display
            });
            console.log("Inventory Seeded.");
        } else {
            console.log("Inventory already exists.");
        }
    }

    console.log("Setup Complete. Ready for Browser Verification.");
}

setupVerificationData().catch(console.error);
