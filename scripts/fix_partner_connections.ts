
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
    console.log("Fixing Partner Connections...");

    // 1. Get DON (Profile ID)
    const { data: donProfile } = await supabase.from('profiles').select('*').ilike('full_name', '%Don%').single();
    if (!donProfile) { console.error("Don Profile not found"); return; }
    console.log(`DON Profile ID: ${donProfile.id}`);

    // 2. Fix D COACH (Contact)
    const { data: dcoach } = await supabase.from('contacts').select('*').ilike('name', '%D Coach%').maybeSingle();
    if (dcoach) {
        console.log(`D COACH Found. Current Assigned Rep: ${dcoach.assigned_rep_id}`);
        if (dcoach.assigned_rep_id !== donProfile.id) {
            console.log("Updating D Coach assigned_rep_id to Don...");
            const { error } = await supabase
                .from('contacts')
                .update({ assigned_rep_id: donProfile.id })
                .eq('id', dcoach.id);
            if (error) console.error("Error updating D Coach:", error);
            else console.log("SUCCESS: D Coach linked to Don.");
        } else {
            console.log("D Coach is already linked to Don.");
        }
    } else {
        console.log("D Coach contact not found.");
    }

    // 3. Inspect JUSTIN THOMPSON
    // Check Profile (Hierarchy)
    const { data: justinProfile } = await supabase.from('profiles').select('*').ilike('full_name', '%Justin Thompson%').maybeSingle();
    if (justinProfile) {
        console.log(`JUSTIN Profile Found. Parent Rep: ${justinProfile.parent_rep_id}`);
        if (justinProfile.parent_rep_id === donProfile.id) {
            console.log("ALERT: Justin is logically parented by Don in Profiles table.");
            // Do we remove this? User says "arnt in the contacts".
            // If Justin is Internal/Admin, he shouldn't be under Don?
            // Ask user or check role?
            console.log(`Justin Role: ${justinProfile.role}`);
        }
    }

    // Check Contact (Clients List)
    const { data: justinContact } = await supabase.from('contacts').select('*').ilike('name', '%Justin Thompson%').maybeSingle();
    if (justinContact) {
        console.log(`JUSTIN Contact Found. Assigned Rep: ${justinContact.assigned_rep_id}`);
        if (justinContact.assigned_rep_id === donProfile.id) {
            console.log("ALERT: Justin is assigned to Don in Contacts table.");
            // If user implies this is wrong, we should clear it.
            // "why am i seeing people connected to him that arnt inthte contacts"
            // Wait, maybe he means "Justin is connected in Hierarchy but NOT in Contacts"?
            // Or "He shouldn't be connected at all".
        }
    }
}

run();
