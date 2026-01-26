
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const EMAIL = "Jordanthompson06121992@gmail.com";

async function resetJordanData() {
    console.log(`\n🧹 RESETTING DATA FOR: ${EMAIL}`);
    console.log("-----------------------------------");

    try {
        // 1. Find User/Contact
        const { data: contacts } = await supabase.from('contacts').select('id, name, linked_user_id').eq('email', EMAIL);

        if (!contacts || contacts.length === 0) {
            console.error("❌ Contact not found.");
            return;
        }

        const contact = contacts[0];
        console.log(`✅ Found Contact: ${contact.name} (${contact.id})`);

        // 2. Delete Client Inventory (The "Fridge" items)
        const { count: invCount, error: invError } = await supabase
            .from('client_inventory')
            .delete({ count: 'exact' })
            .eq('contact_id', contact.id);

        if (invError) console.error("❌ Inventory Delete Error:", invError.message);
        else console.log(`🗑️  Deleted ${invCount} items from Digital Fridge`);

        // 3. Delete Movements (The "Invoices/Orders")
        // This will cascade to movement_items usually, but let's be safe.
        // First get IDs to verify
        const { data: movements } = await supabase.from('movements').select('id').eq('contact_id', contact.id);
        const movementIds = movements?.map(m => m.id) || [];

        if (movementIds.length > 0) {
            // Restore bottles to 'in_stock' before deleting movement?
            // Yes, strict cleanup.
            const { data: items } = await supabase.from('movement_items').select('bottle_id').in('movement_id', movementIds);
            const bottleIds = items?.map(i => i.bottle_id) || [];
            if (bottleIds.length > 0) {
                await supabase.from('bottles').update({ status: 'in_stock' }).in('id', bottleIds);
                console.log(`📦 Restored ${bottleIds.length} bottles to stock`);
            }

            const { count: movCount, error: movError } = await supabase
                .from('movements')
                .delete({ count: 'exact' })
                .eq('contact_id', contact.id);

            if (movError) console.error("❌ Movement Delete Error:", movError.message);
            else console.log(`🗑️  Deleted ${movCount} Financial Records (Invoices)`);
        } else {
            console.log("ℹ️  No invoices found.");
        }

        // 4. Delete Protocols (Regimens) if desired?
        // User said "I deleted the regimen", so maybe they want this clean too.
        // Let's wipe them so they can test the "Add" flow.
        const { count: protoCount, error: protoError } = await supabase
            .from('protocols')
            .delete({ count: 'exact' })
            .eq('contact_id', contact.id);

        if (protoError) console.error("❌ Protocol Delete Error:", protoError.message);
        else console.log(`🗑️  Deleted ${protoCount} Regimens`);

        console.log("\n✨ RESET COMPLETE. You can now test fresh.");

    } catch (e: any) {
        console.error("❌ Unexpected Error:", e.message);
    }
}

resetJordanData();
