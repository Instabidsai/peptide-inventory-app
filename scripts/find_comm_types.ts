import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function findMoreTypes() {
    const types = ['direct', 'indirect', 'residual', 'upline', 'downline', 'team', 'personal', 'level1', 'level2', 'override_commission', 'matching', 'sponsor'];

    for (const type of types) {
        const { data, error } = await supabase
            .from('commissions')
            .insert({
                partner_id: '034d76ad-6e63-4f23-bb98-fff2e1087ee9',
                amount: 0.01,
                status: 'pending',
                type: type,
            } as any)
            .select()
            .single();

        if (!error) {
            console.log(`✅ '${type}'`);
            await supabase.from('commissions').delete().eq('id', data.id);
        } else if (error.code === '23514') {
            console.log(`❌ '${type}'`);
        }
    }
}

findMoreTypes().catch(console.error);
