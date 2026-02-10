import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function findColumns() {
    // Try inserting with just the minimal fields to find actual columns
    const { data, error } = await supabase
        .from('commissions')
        .insert({
            partner_id: '034d76ad-6e63-4f23-bb98-fff2e1087ee9',
            amount: 22.50,
            status: 'pending',
        } as any)
        .select()
        .single();

    if (error) {
        console.log('Minimal insert error:', error);
    } else {
        console.log('✅ Minimal insert worked!');
        console.log('ALL COLUMNS:', Object.keys(data));
        console.log('FULL ROW:', JSON.stringify(data, null, 2));
        // Clean up
        await supabase.from('commissions').delete().eq('id', data.id);
    }
}

findColumns().catch(console.error);
