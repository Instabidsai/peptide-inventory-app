
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPrices() {
    console.log('Checking retail_price for peptides...');
    const { data, error } = await supabase
        .from('peptides')
        .select('name, sku, retail_price');

    if (error) {
        console.error('Error fetching peptides:', error);
        return;
    }

    console.table(data);
}

checkPrices();
