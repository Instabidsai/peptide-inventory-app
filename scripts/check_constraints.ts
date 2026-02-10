import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConstraints() {
    // Query the check constraint definition
    const { data, error } = await supabase.rpc('exec_sql', {
        sql: `SELECT conname, pg_get_constraintdef(oid) 
          FROM pg_constraint 
          WHERE conrelid = 'sales_orders'::regclass 
          AND contype = 'c';`
    });
    console.log('Check constraints on sales_orders:', data, error);

    // Also check commissions constraints
    const { data: data2, error: error2 } = await supabase.rpc('exec_sql', {
        sql: `SELECT conname, pg_get_constraintdef(oid) 
          FROM pg_constraint 
          WHERE conrelid = 'commissions'::regclass 
          AND contype = 'c';`
    });
    console.log('Check constraints on commissions:', data2, error2);

    // Also check the commissions table columns
    const { data: data3, error: error3 } = await supabase.rpc('exec_sql', {
        sql: `SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_name = 'commissions'
          ORDER BY ordinal_position;`
    });
    console.log('Commissions columns:', data3, error3);

    // Check sales_orders columns too
    const { data: data4, error: error4 } = await supabase.rpc('exec_sql', {
        sql: `SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_name = 'sales_orders'
          ORDER BY ordinal_position;`
    });
    console.log('Sales_orders columns:', data4, error4);

    // Try to find valid commission_status values by looking at enum or check
    // Alternative: just try common values  
    const statuses = ['pending', 'paid', 'unpaid', 'approved', 'applied', 'auto'];
    for (const status of statuses) {
        const { error: testErr } = await supabase
            .from('sales_orders')
            .insert({
                org_id: '33a18316-b0a4-4d85-a770-d1ceb762bd4f',
                client_id: '1dfb9edf-ce6e-4c51-8f3e-69116f248153',
                rep_id: '034d76ad-6e63-4f23-bb98-fff2e1087ee9',
                status: 'fulfilled',
                total_amount: 0.01,
                commission_status: status,
                notes: 'test',
            } as any)
            .select()
            .single();

        if (!testErr) {
            console.log(`✅ commission_status '${status}' is VALID`);
            // Clean up
            await supabase.from('sales_orders').delete().match({ notes: 'test', commission_status: status });
        } else if (testErr.code === '23514') {
            console.log(`❌ commission_status '${status}' is INVALID`);
        } else {
            console.log(`⚠️ commission_status '${status}' - other error:`, testErr.message);
        }
    }
}

checkConstraints().catch(console.error);
