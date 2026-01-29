
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
    console.log("Setting up Admin Credit Test...");

    // 1. Get Admin Profile
    // We assume the first user in 'profiles' with role 'admin'
    // Or just find by email if known. Env vars usually don't have email.
    // Let's grab the first admin.
    const { data: admins, error: err1 } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'admin')
        .limit(1);

    if (err1 || !admins || admins.length === 0) {
        console.error("No admin profile found.", err1);
        return;
    }
    const admin = admins[0];
    console.log(`Found Admin: ${admin.full_name} (${admin.id})`);

    // 2. Give Credit
    const { error: err2 } = await supabase
        .from('profiles')
        .update({ credit_balance: 100.00 })
        .eq('id', admin.id);

    if (err2) { console.error("Update Credit Failed", err2); return; }
    console.log("Admin Credit set to $100.00");

    // 3. Get a Contact
    const { data: contacts } = await supabase.from('contacts').select('id').limit(1);
    const contactId = contacts?.[0]?.id;

    if (!contactId) { console.error("No contacts found"); return; }

    // 4. Create Unpaid Order
    const { data: order, error: err3 } = await supabase
        .from('sales_orders')
        .insert({
            org_id: admin.org_id,
            client_id: contactId,
            status: 'draft',
            total_amount: 10.00,
            payment_status: 'unpaid'
        })
        .select()
        .single();

    if (err3) { console.error("Create Order Failed", err3); return; }

    console.log(`Created Test Order: ${order.id}`);
    console.log(`Navigate to: /sales/${order.id}`);
}

run();
