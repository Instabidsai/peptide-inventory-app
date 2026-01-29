
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Fix for Windows environment if .env didn't load automatically in some contexts
// usages in scripts usually require manual dotenv config
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

if (!supabaseUrl) {
    console.error("Missing SUPABASE_URL");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Seeding pending commission...");

    // 1. Get Don's ID
    const { data: don, error: donError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', 'Dzlby111@yahoo.com') // Don's email
        .single();

    if (donError || !don) {
        console.error("Don not found", donError);
        return;
    }

    // 2. Insert Commission (we need a valid sales order ID usually, or null if allowed)
    // The schema enforces sale_id FK? Let's check. 
    // Yes, usually. I'll fetch *any* sales order or create a dummy one.

    // Fetch latest sales order
    const { data: order } = await supabase
        .from('sales_orders')
        .select('id')
        .limit(1)
        .single();

    let orderId = order?.id;

    if (!orderId) {
        // Create dummy order
        console.log("Creating dummy order...");
        const { data: newOrder, error: orderErr } = await supabase
            .from('sales_orders')
            .insert({
                org_id: don.org_id || '00000000-0000-0000-0000-000000000000', // Need logic here
                // actually let's skip org_id if nullable? usually not.
                // Let's assume there's at least 1 order in the system from "test_partner_commission_flow".
                // If not, we might fail constraint.
                // Let's try inserting with a made-up UUID if no FK constraint strictly checks existance of org?
                // Safest: Use existing order or fail.
            })
            .select()
            .single();
        // Actually, let's just create a commission with NO sale_id if column is nullable?
        // In `use-partner.ts` interface: `sale_id: string;` (not optional).
        // So it is likely required.
    }

    // If we have an order, proceed.
    if (!orderId) {
        // Try to find ANY order
        const { data: list } = await supabase.from('sales_orders').select('id').limit(1);
        if (list && list.length > 0) orderId = list[0].id;
    }

    if (!orderId) {
        console.error("No sales orders found to link commission to. Please create an order first.");
        return;
    }

    const { error } = await supabase.from('commissions').insert({
        partner_id: don.id,
        sale_id: orderId,
        amount: 50.00,
        commission_rate: 0.15,
        type: 'direct',
        status: 'pending'
    });

    if (error) {
        console.error("Error inserting:", error);
    } else {
        console.log("Successfully seeded pending commission for Don.");
    }
}

run();
