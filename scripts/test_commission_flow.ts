import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testFinalFlow() {
    console.log('=== FINAL E2E TEST (all 4 bugs fixed) ===\n');

    // 1. sales_order: commission_status = 'pending'
    const { data: so, error: soErr } = await supabase
        .from('sales_orders')
        .insert({
            org_id: '33a18316-b0a4-4d85-a770-d1ceb762bd4f',
            client_id: '1dfb9edf-ce6e-4c51-8f3e-69116f248153',
            rep_id: '034d76ad-6e63-4f23-bb98-fff2e1087ee9',
            status: 'fulfilled',
            total_amount: 225,
            commission_amount: 45,
            commission_status: 'pending',
            notes: 'E2E TEST',
        } as any).select().single();

    if (soErr) { console.log('❌ sales_order:', soErr); return; }
    console.log('✅ sales_order');

    // 2. commission: sale_id, type='direct', no description
    const { data: c1, error: c1Err } = await supabase
        .from('commissions')
        .insert({
            partner_id: '034d76ad-6e63-4f23-bb98-fff2e1087ee9',
            sale_id: so.id,
            type: 'direct',
            amount: 22.50,
            commission_rate: 0.10,
            status: 'pending',
        } as any).select().single();

    if (c1Err) { console.log('❌ D Coach commission:', c1Err); await cleanup(so.id); return; }
    console.log('✅ D Coach commission');

    // 3. Don commission
    const { data: c2, error: c2Err } = await supabase
        .from('commissions')
        .insert({
            partner_id: '2cd0fd2f-6ba2-48a6-8913-554c4cf9dd63',
            sale_id: so.id,
            type: 'direct',
            amount: 22.50,
            commission_rate: 0.10,
            status: 'pending',
        } as any).select().single();

    if (c2Err) { console.log('❌ Don commission:', c2Err); await cleanup(so.id); return; }
    console.log('✅ Don commission');

    // Verify
    const { data: verify } = await supabase.from('commissions').select('*').eq('sale_id', so.id);
    console.log('\n📋', verify?.length, 'commissions linked');

    // Cleanup
    await cleanup(so.id);
    console.log('\n🎉🎉🎉 ALL INSERTS SUCCEEDED — Commission flow is FIXED!');
}

async function cleanup(soId: string) {
    await supabase.from('commissions').delete().eq('sale_id', soId);
    await supabase.from('sales_orders').delete().eq('id', soId);
}

testFinalFlow().catch(console.error);
