
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
    console.log("Debugging Partner Relationships...");

    // 1. Get DON
    const { data: don } = await supabase.from('contacts').select('*').ilike('name', '%Don%').single();
    if (!don) { console.log("Don not found via Contacts. Checking Profiles..."); }

    const { data: donProfile } = await supabase.from('profiles').select('*').ilike('full_name', '%Don%').single();

    if (!donProfile) { console.error("Don Profile not found"); return; }
    console.log(`DON Profile found: ${donProfile.full_name} (${donProfile.id})`);

    // 2. Check Justin
    const { data: justin } = await supabase.from('contacts').select('*').ilike('name', '%Justin Thompson%').maybeSingle();
    const { data: justinProfile } = await supabase.from('profiles').select('*').ilike('full_name', '%Justin Thompson%').maybeSingle();

    console.log(`\nJUSTIN:`);
    if (justin) console.log(`- Contact: ${justin.name} | rep_id: ${justin.rep_id} | Type: ${justin.type}`);
    if (justinProfile) console.log(`- Profile: ${justinProfile.full_name} | parent_rep_id: ${justinProfile.parent_rep_id}`);

    // 3. Check D Coach
    const { data: dcoach } = await supabase.from('contacts').select('*').ilike('name', '%D Coach%').maybeSingle();

    console.log(`\nD COACH:`);
    if (dcoach) console.log(`- Contact: ${dcoach.name} | rep_id: ${dcoach.rep_id} | Type: ${dcoach.type}`);
    else console.log("D Coach not found.");

}

run();
