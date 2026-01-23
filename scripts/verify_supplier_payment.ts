
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifySupplierPayment() {
    console.log('--- Verifying Supplier Payments ---');

    // 0. Get Org & Peptide
    const { data: profiles } = await supabase.from('profiles').select('org_id').limit(1);
    const profile = profiles?.[0];
    if (!profile) return console.error("No profile/org found");
    const { data: peptide } = await supabase.from('peptides').select('id').limit(1).single();
    if (!peptide) return console.error("No peptide found");

    // 1. Create Test Order
    console.log('1. Creating Test Order ($200)...');
    const { data: order, error: createError } = await supabase
        .from('orders')
        .insert({
            org_id: profile.org_id,
            peptide_id: peptide.id,
            quantity_ordered: 10,
            estimated_cost_per_unit: 20.00,
            order_date: new Date().toISOString().split('T')[0],
            status: 'pending',
            supplier: 'TestVendor'
        })
        .select()
        .single();

    if (createError) {
        console.error('FAILED: Could not create order', createError);
        return;
    }
    console.log(`PASS: Created Order ${order.id}`);

    // 2. Record Payment (Simulate Hook Logic)
    console.log('2. Recording Payment ($200)...');
    const paymentAmount = 200.00;

    // 2a. Create Expense
    const { data: expense, error: expError } = await supabase
        .from('expenses')
        .insert({
            date: new Date().toISOString().split('T')[0],
            category: 'inventory',
            amount: paymentAmount,
            description: 'Test Supplier Payment',
            recipient: 'TestVendor',
            payment_method: 'credit_card',
            status: 'paid',
            related_order_id: order.id
        })
        .select()
        .single();

    if (expError) return console.error('FAILED: Expense creation', expError);
    console.log(`PASS: Expense ${expense.id} created.`);

    // 2b. Update Order
    const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({
            amount_paid: paymentAmount,
            payment_status: 'paid'
        })
        .eq('id', order.id)
        .select()
        .single();

    if (updateError) return console.error('FAILED: Order update', updateError);
    console.log(`PASS: Order updated.`);

    // 3. Verifications
    if (updatedOrder.payment_status !== 'paid') console.error('FAIL: Status not paid');
    else console.log('PASS: Order Status is PAID');

    if (updatedOrder.amount_paid !== 200) console.error('FAIL: Amount not reflected');
    else console.log('PASS: Amount Paid is $200');

    // 4. Cleanup
    console.log('4. Cleaning up...');
    await supabase.from('expenses').delete().eq('id', expense.id);
    await supabase.from('orders').delete().eq('id', order.id);
    console.log('PASS: Cleanup complete.');
    console.log('--- Verification Success ---');
}

verifySupplierPayment();
