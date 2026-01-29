
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testCommissionFlow() {
    console.log("🚀 Starting End-to-End Partner Commission Test...\n");

    // 1. Identify Actors
    // Justin (Level 2) -> Don (Level 1) -> Admin (Root)
    const { data: justin } = await supabase.from('profiles').select('id, full_name, org_id').ilike('full_name', '%Justin Thompson%').limit(1).single();
    if (!justin) { console.error("❌ Justin not found."); return; }
    console.log(`Actor (Rep): ${justin.full_name} (${justin.id})`);

    const { data: don } = await supabase.from('profiles').select('id, full_name').ilike('full_name', '%Don%').limit(1).single();
    if (!don) { console.error("❌ Don not found."); return; }
    console.log(`Actor (Upline): ${don.full_name} (${don.id})`);

    // 2. Find a Test Client (Contact)
    const { data: client } = await supabase.from('contacts').select('id, name').limit(1).single();
    if (!client) { console.error("❌ No client contact found."); return; }
    console.log(`Actor (Client): ${client.name} (${client.id})`);

    // 3. Create a Test Order
    console.log("\n🛒 Creating Test Sales Order...");
    const { data: order, error: orderError } = await supabase
        .from('sales_orders')
        .insert({
            org_id: justin.org_id,
            client_id: client.id,
            rep_id: justin.id,
            status: 'draft',
            payment_status: 'unpaid',
            total_amount: 100.00,
            commission_amount: 20.00,
            notes: 'AUTOMATED TEST ORDER - PARTNER COMMISSION'
        })
        .select()
        .single();

    if (orderError) { console.error("❌ Order Creation Failed:", orderError); return; }
    console.log(`✅ Created Order #${order.id} (Amount: $100.00)`);

    // 3. Mark as Paid (Simulate Frontend Action)
    console.log("💳 Marking Order as PAID...");
    const { error: updateError } = await supabase
        .from('sales_orders')
        .update({ payment_status: 'paid', amount_paid: 100.00 })
        .eq('id', order.id);

    if (updateError) { console.error("❌ Order Update Failed:", updateError); return; }

    // 4. Trigger Commission RPC (Simulate Frontend/Hook Hook trigger)
    console.log("⚙️  Triggering Commission Calculation RPC...");
    const { error: rpcError } = await supabase.rpc('process_sale_commission', { p_sale_id: order.id });

    if (rpcError) {
        console.error("❌ RPC Failed:", rpcError);
        // Cleanup
        await supabase.from('sales_orders').delete().eq('id', order.id);
        return;
    }
    console.log("✅ RPC Executed.");

    // 5. Verify Commissions Table
    console.log("\n🔍 Verifying Commission Records...");
    const { data: commissions, error: commError } = await supabase
        .from('commissions')
        .select('partner_id, amount, type, commission_rate')
        .eq('sale_id', order.id);

    if (commError) { console.error("❌ Fetch Commissions Failed:", commError); return; }

    // Expected:
    // 1. Justin: Direct (15% of 100 = $15.00)
    // 2. Don: Override (5% of 100 = $5.00)

    let directPass = false;
    let overridePass = false;

    commissions?.forEach(c => {
        const partnerName = c.partner_id === justin.id ? justin.full_name : (c.partner_id === don.id ? don.full_name : 'Unknown');
        console.log(` - Record: ${partnerName} | Type: ${c.type} | Amount: $${c.amount} | Rate: ${c.commission_rate}`);

        if (c.partner_id === justin.id && c.type === 'direct' && Number(c.amount) === 15.00) directPass = true;
        if (c.partner_id === don.id && (c.type === 'second_tier_override' || c.type === 'override') && Number(c.amount) === 5.00) overridePass = true;
    });

    if (directPass && overridePass) {
        console.log("\n✅ SUCCESS: Both Direct and Override commissions generated correctly!");
    } else {
        console.log("\n❌ FAILURE: Commission logic did not match expectations.");
        if (!directPass) console.log("   - Direct Commission missing or incorrect.");
        if (!overridePass) console.log("   - Override Commission missing or incorrect.");
    }

    // 6. Cleanup
    console.log("\n🧹 Cleaning up test data...");
    await supabase.from('commissions').delete().eq('sale_id', order.id);
    await supabase.from('sales_orders').delete().eq('id', order.id);
    console.log("✅ Cleanup complete.");
}

testCommissionFlow();
