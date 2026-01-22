
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
// On Windows, pathname might have a leading slash which path.resolve handles, but let's be safe
// Actually, easier to just use process.cwd() since we run from root
dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- START DEBUG ---');

    // 1. Check Bottles
    const { data: bottles, error: bottlesError } = await supabase
        .from('bottles')
        .select('id, status, lot_id, lots(id, cost_per_unit)')
        .eq('status', 'in_stock');

    if (bottlesError) {
        console.error('Error fetching bottles:', bottlesError);
    } else {
        console.log(`Found ${bottles?.length} in_stock bottles`);

        let totalVal = 0;
        bottles?.forEach(b => {
            const cost = b.lots?.cost_per_unit;
            console.log(`Bottle ${b.id.substring(0, 5)}... - Lot: ${b.lots?.id} - Cost: ${cost}`);
            if (typeof cost === 'number') {
                totalVal += cost;
            } else {
                console.warn(`WARNING: Invalid cost for bottle ${b.id}:`, cost);
            }
        });
        console.log('Calculated Inventory Value:', totalVal);
    }

    // 2. Check Lots directly
    const { data: lots, error: lotsError } = await supabase
        .from('lots')
        .select('*');

    if (lotsError) {
        console.error('Error fetching lots:', lotsError);
    } else {
        console.log(`Found ${lots.length} lots`);
        lots.forEach(l => {
            console.log(`Lot ${l.lot_number} - Cost: ${l.cost_per_unit}`);
        });
    }

    console.log('--- END DEBUG ---');
}

run();
