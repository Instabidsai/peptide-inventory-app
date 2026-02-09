
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

async function markSalesPaid() {
    console.log("Marking all 'unpaid' sales as 'paid'...");

    const { data: movements, error } = await supabase
        .from('movements')
        .select('*')
        .eq('type', 'sale')
        .eq('payment_status', 'unpaid');

    if (!movements || movements.length === 0) {
        console.log("No unpaid sales found!");
        return;
    }

    console.log(`Found ${movements.length} unpaid sales.`);

    // Update them
    const { error: updateError } = await supabase
        .from('movements')
        .update({
            payment_status: 'paid',
            payment_date: new Date().toISOString().split('T')[0] // Set today as payment date? Or keep empty? User said "marked as paid".
        })
        .in('id', movements.map(m => m.id));

    if (updateError) {
        console.error("Failed to update:", updateError.message);
    } else {
        console.log("✅ Success! All unpaid sales marked as Paid.");
    }
}

markSalesPaid();
