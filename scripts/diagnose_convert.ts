import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDonCommission() {
    const commissionId = '889c483a-29f4-4cb4-aa62-ce006dc775e1';
    const donContactId = '7f5ce2db-8f73-473c-a0cd-00f7b9359de4';
    const amount = 22.50;

    // 1. Update commission status from 'paid' to 'available'
    const { error: updateErr } = await supabase
        .from('commissions')
        .update({ status: 'available' } as any)
        .eq('id', commissionId);

    if (updateErr) {
        console.error('Failed to update commission status:', updateErr);
        return;
    }
    console.log('✅ Commission status updated to "available"');

    // 2. Find Don's unpaid movements (oldest first)
    const { data: movements } = await supabase
        .from('movements')
        .select('id, payment_status, amount_paid, movement_items(price_at_sale)')
        .eq('contact_id', donContactId)
        .neq('payment_status', 'paid')
        .neq('status', 'returned')
        .order('created_at', { ascending: true });

    console.log(`Found ${movements?.length || 0} unpaid movements`);

    let remaining = amount;

    if (movements && movements.length > 0) {
        for (const movement of movements) {
            if (remaining <= 0) break;

            const totalPrice = (movement as any).movement_items?.reduce(
                (sum: number, item: any) => sum + (item.price_at_sale || 0), 0
            ) || 0;
            const alreadyPaid = (movement as any).amount_paid || 0;
            const owedOnThis = totalPrice - alreadyPaid;

            if (owedOnThis <= 0) continue;

            const paymentOnThis = Math.min(remaining, owedOnThis);
            const newAmountPaid = alreadyPaid + paymentOnThis;
            const fullyPaid = newAmountPaid >= totalPrice;

            const { error } = await supabase
                .from('movements')
                .update({
                    amount_paid: newAmountPaid,
                    payment_status: fullyPaid ? 'paid' : 'partial',
                    payment_date: new Date().toISOString(),
                    notes: `Commission credit applied: $${paymentOnThis.toFixed(2)}`
                } as any)
                .eq('id', movement.id);

            if (error) {
                console.error(`  ❌ Failed to update movement ${movement.id}:`, error.message);
            } else {
                console.log(`  ✅ Applied $${paymentOnThis.toFixed(2)} to movement ${movement.id} (${fullyPaid ? 'fully paid' : 'partial'})`);
            }

            remaining -= paymentOnThis;
        }
    }

    const applied = amount - remaining;
    console.log(`\n=== DONE ===`);
    console.log(`Applied: $${applied.toFixed(2)}`);
    console.log(`Remaining: $${remaining.toFixed(2)}`);
}

fixDonCommission().catch(console.error);
