
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function manualGrantCredit() {
    console.log('Finding pending commissions for Thompson...');

    // 1. Find the latest pending commission
    const { data: orders, error: findError } = await supabase
        .from('sales_orders')
        .select('id, commission_amount, rep_id, created_at')
        .eq('commission_status', 'pending')
        .gt('commission_amount', 0)
        .order('created_at', { ascending: false })
        .limit(1);

    if (findError) {
        console.error('Error finding order:', findError);
        return;
    }

    if (!orders || orders.length === 0) {
        console.log('No pending commissions found. Maybe already credited?');
        return;
    }

    const order = orders[0];
    console.log(`Found Order ${order.id} with commission $${order.commission_amount}`);

    // 2. Add to Profile Balance
    console.log(`Adding ${order.commission_amount} to Rep ${order.rep_id} balance...`);

    // Fetch current balance first to mimic logic
    const { data: profile } = await supabase.from('profiles').select('credit_balance').eq('id', order.rep_id).single();
    const currentBalance = Number(profile?.credit_balance) || 0;
    const newBalance = currentBalance + Number(order.commission_amount);

    const { error: profileError } = await supabase
        .from('profiles')
        .update({ credit_balance: newBalance })
        .eq('id', order.rep_id);

    if (profileError) {
        console.error('Profile update failed:', profileError);
        return;
    }
    console.log(`Balance updated to $${newBalance.toFixed(2)}`);

    // 3. Update Order Status
    const { error: orderError } = await supabase
        .from('sales_orders')
        .update({ commission_status: 'credited' })
        .eq('id', order.id);

    if (orderError) {
        console.error('Order status update failed:', orderError);
        return;
    }

    console.log('Success! Commission credited.');
}

manualGrantCredit();
