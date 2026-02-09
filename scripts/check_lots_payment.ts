
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkLotsPayment() {
    console.log("Checking Lots Payment Status...");

    const { data: lots, error } = await supabase
        .from('lots')
        .select('*');

    if (error) {
        console.error("❌ Error fetching lots:", error.message);
        return;
    }

    if (!lots || lots.length === 0) {
        console.log("No lots found.");
        return;
    }

    console.log(`Found ${lots.length} lots.`);

    // Check if payment_status field exists and is populated
    // Note: If column doesn't exist, supabase-js might just ignore it in select('*') if types aren't updated, 
    // but usually it returns what's in DB.

    let paidCount = 0;
    let unpaidCount = 0;
    let nullCount = 0;

    lots.forEach(lot => {
        // Explicitly check the field. It might be undefined if not in schema.
        const status = (lot as any).payment_status;

        if (status === 'paid') paidCount++;
        else if (status === 'unpaid') unpaidCount++;
        else if (status === null || status === undefined) nullCount++;
    });

    console.log(`Paid: ${paidCount}`);
    console.log(`Unpaid: ${unpaidCount}`);
    console.log(`Null/Undefined: ${nullCount}`);

    if (nullCount > 0) {
        console.log("⚠️  'payment_status' seems missing or null for some rows. SQL might not have run or backfill failed.");
    } else {
        console.log("✅ Database looks correct. If UI is wrong, it's likely a Deployment/Cache issue.");
    }
}

checkLotsPayment();
