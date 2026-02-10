import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchemas() {
    console.log('=== TABLE SCHEMA CHECK ===\n');

    // Check sales_orders columns
    const { data: soCols } = await supabase.rpc('get_table_columns', { table_name_param: 'sales_orders' }).select('*');
    console.log('sales_orders columns via RPC:', soCols);

    // Fallback: just try to select * from sales_orders limit 1
    const { data: soSample, error: soErr } = await supabase
        .from('sales_orders')
        .select('*')
        .limit(1);
    console.log('\n1. SALES_ORDERS sample:', JSON.stringify(soSample, null, 2));
    if (soErr) console.log('   ERROR:', soErr);
    if (soSample && soSample.length > 0) {
        console.log('   COLUMNS:', Object.keys(soSample[0]));
    } else {
        console.log('   (empty table - inserting test row to discover schema)');
        // Try inserting with ALL our columns to see which ones fail
        const { data: testInsert, error: testErr } = await supabase
            .from('sales_orders')
            .insert({
                client_id: '1dfb9edf-ce6e-4c51-8f3e-69116f248153', // Brad
                rep_id: '034d76ad-6e63-4f23-bb98-fff2e1087ee9', // D Coach
                status: 'fulfilled',
                total_amount: 0.01,
                commission_amount: 0.001,
                commission_status: 'test',
                notes: 'SCHEMA TEST - DELETE ME',
                org_id: null,
            } as any)
            .select()
            .single();

        if (testErr) {
            console.log('   INSERT ERROR:', JSON.stringify(testErr));
        } else {
            console.log('   TEST INSERT OK - COLUMNS:', Object.keys(testInsert!));
            // Clean up
            await supabase.from('sales_orders').delete().eq('id', (testInsert as any).id);
            console.log('   (cleaned up test row)');
        }
    }

    // Check commissions columns
    const { data: commSample, error: commErr } = await supabase
        .from('commissions')
        .select('*')
        .limit(1);
    console.log('\n2. COMMISSIONS sample:', JSON.stringify(commSample, null, 2));
    if (commErr) console.log('   ERROR:', commErr);
    if (commSample && commSample.length > 0) {
        console.log('   COLUMNS:', Object.keys(commSample[0]));
    } else {
        console.log('   (empty table - inserting test row to discover schema)');
        const { data: testComm, error: testCommErr } = await supabase
            .from('commissions')
            .insert({
                partner_id: '034d76ad-6e63-4f23-bb98-fff2e1087ee9',
                type: 'sale_commission',
                amount: 0.01,
                status: 'pending',
                description: 'SCHEMA TEST - DELETE ME',
            } as any)
            .select()
            .single();

        if (testCommErr) {
            console.log('   INSERT ERROR:', JSON.stringify(testCommErr));
        } else {
            console.log('   TEST INSERT OK - COLUMNS:', Object.keys(testComm!));
            // Clean up
            await supabase.from('commissions').delete().eq('id', (testComm as any).id);
            console.log('   (cleaned up test row)');
        }
    }

    // 3. Check the profile variable used in the mutation - what does useAuth return?
    // The code uses profile.org_id - let's check what org_id the admin user has
    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'admin')
        .limit(1)
        .single();
    console.log('\n3. ADMIN PROFILE (for org_id check):', JSON.stringify(adminProfile, null, 2));

    // 4. Check recent movements to see if Brad's sale was even recorded
    const { data: recentMovements } = await supabase
        .from('movements')
        .select('id, type, contact_id, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log('\n4. RECENT MOVEMENTS:', JSON.stringify(recentMovements, null, 2));
}

checkSchemas().catch(console.error);
