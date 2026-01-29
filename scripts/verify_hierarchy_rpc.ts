
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyHierarchy() {
    console.log("Verifying Hierarchy RPC...");

    // 1. Get Admin ID
    const { data: admin } = await supabase.from('profiles').select('id, full_name').eq('role', 'admin').limit(1).single();
    if (!admin) { console.error("No admin found."); return; }

    console.log(`Checking downline for Admin: ${admin.full_name}`);
    const { data: adminDownline, error: err1 } = await supabase.rpc('get_partner_downline', { root_id: admin.id });

    if (err1) console.error("RPC Error:", err1);
    else {
        console.log(`Admin Downline Count: ${adminDownline.length}`);
        adminDownline.forEach((p: any) => console.log(` - ${p.depth}: ${p.full_name} (${p.partner_tier})`));
    }

    // 2. Get Don ID
    const { data: don } = await supabase.from('profiles').select('id, full_name').ilike('full_name', '%Don%').limit(1).single();
    if (don) {
        console.log(`\nChecking downline for Don: ${don.full_name}`);
        const { data: donDownline, error: err2 } = await supabase.rpc('get_partner_downline', { root_id: don.id });

        if (err2) console.error("RPC Error:", err2);
        else {
            console.log(`Don Downline Count: ${donDownline.length}`);
            donDownline.forEach((p: any) => console.log(` - ${p.depth}: ${p.full_name} (${p.partner_tier})`));
        }
    }
}

verifyHierarchy();
