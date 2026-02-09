
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

async function checkPaymentStatus() {
    console.log("Checking Payment Status Distribution...");

    // 1. Check Movements (Sales)
    const { data: movements, error } = await supabase
        .from('movements')
        .select('type, payment_status, count');

    // Group by status
    // Note: supabase-js doesn't do 'group by' easily without rpc or raw transformation
    // We'll just fetch all and count in JS (assuming < 1000 or using limits)

    const { data: allMovements } = await supabase
        .from('movements')
        .select('id, type, payment_status');

    const paymentCounts: Record<string, number> = {};
    const unpaidIds: string[] = [];

    allMovements?.forEach(m => {
        const key = `${m.type} - ${m.payment_status}`;
        paymentCounts[key] = (paymentCounts[key] || 0) + 1;
        if (m.payment_status === 'unpaid') {
            unpaidIds.push(m.id);
        }
    });

    console.log("\n--- MOVEMENTS (Sales/etc) ---");
    console.table(paymentCounts);
    console.log(`Total Unpaid: ${unpaidIds.length}`);

    // 2. Check Lots (Restocks)
    // Does 'lots' have a status or payment field?
    const { data: lots } = await supabase
        .from('lots')
        .select('*')
        .limit(1);

    console.log("\n--- LOTS SCOUTING ---");
    if (lots && lots.length > 0) {
        console.log("Sample Lot keys:", Object.keys(lots[0]));
        // Check if any key looks like 'paid' or 'status'
        const hasPayment = Object.keys(lots[0]).some(k => k.includes('pay') || k.includes('status'));
        console.log(`Does Lots have payment fields? ${hasPayment}`);
    }

}

checkPaymentStatus();
