
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!);

async function checkLotsValue() {
    console.log('Fetching lots...');
    const { data: lots, error } = await supabase.from('lots').select('*');

    if (error) {
        console.error(error);
        return;
    }

    if (!lots) return;

    let totalLotValue = 0;

    lots.forEach(lot => {
        const val = (lot.quantity_received * (lot.cost_per_unit || 0));
        totalLotValue += val;
    });

    console.log(`Total Value in 'lots' table: $${totalLotValue.toFixed(2)}`);
    console.log(`Number of Lots: ${lots.length}`);
}

checkLotsValue();
