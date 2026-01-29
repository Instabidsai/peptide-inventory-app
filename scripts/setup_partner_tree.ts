
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function setupPartnerTree() {
    console.log("Setting up Partner Hierarchy...");

    // 1. Get Admin (Root)
    const { data: admin } = await supabase.from('profiles').select('id, full_name').eq('role', 'admin').limit(1).single();
    if (!admin) { console.error("No admin found."); return; }
    console.log(`Root (Admin): ${admin.full_name} (${admin.id})`);

    // 2. Find or Create 'Don' (Level 1)
    // We created Don in a previous script, let's find him.
    const { data: don } = await supabase.from('profiles').select('id, full_name').ilike('full_name', '%Don%').limit(1).single();

    if (don) {
        console.log(`Level 1 (Don): ${don.full_name} (${don.id})`);

        // Link Don to Admin
        const { error: linkError } = await supabase
            .from('profiles')
            .update({ parent_partner_id: admin.id, partner_tier: 'senior' })
            .eq('id', don.id);

        if (linkError) console.error("Error linking Don to Admin:", linkError);
        else console.log("✅ Linked Don -> Admin");
    } else {
        console.log("Don profile not found, skipping Don Level 1 setup.");
    }

    // 3. Find 'Jordan' or another user to be Level 2 (under Don)
    // Let's use a random sales_rep or ensure one exists.
    // For now, let's look for any other sales_rep.
    const { data: reps } = await supabase.from('profiles').select('id, full_name').eq('role', 'sales_rep').neq('id', don?.id || '0').limit(1);

    if (reps && reps.length > 0) {
        const subRep = reps[0];
        console.log(`Level 2 (Sub-Rep): ${subRep.full_name} (${subRep.id})`);

        // Link to Don
        if (don) {
            const { error: subLinkError } = await supabase
                .from('profiles')
                .update({ parent_partner_id: don.id, partner_tier: 'standard' })
                .eq('id', subRep.id);

            if (subLinkError) console.error("Error linking Sub-Rep to Don:", subLinkError);
            else console.log(`✅ Linked ${subRep.full_name} -> Don`);
        }
    } else {
        console.log("No other sales_rep found for Level 2.");
    }

    console.log("Hierarchy setup complete.");
}

setupPartnerTree();
