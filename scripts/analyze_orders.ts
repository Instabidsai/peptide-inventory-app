
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

async function analyzeOrderStatuses() {
    console.log("Analyzing Order Statuses...");

    const { data: orders } = await supabase
        .from('orders')
        .select('id, status, payment_status');

    if (!orders) return;

    const statusCounts: Record<string, number> = {};
    const paymentCounts: Record<string, number> = {};

    orders.forEach(o => {
        statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
        const key = `${o.status} -> ${o.payment_status}`;
        paymentCounts[key] = (paymentCounts[key] || 0) + 1;
    });

    console.log("\n--- Status Counts ---");
    console.table(statusCounts);

    console.log("\n--- Payment Status by Order Status ---");
    console.table(paymentCounts);
}

analyzeOrderStatuses();
