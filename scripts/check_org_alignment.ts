
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey!);

async function checkAlignment() {
    console.log('Checking Org Alignment...');

    // 1. Get User Org
    const email = 'admin@nextgenresearchlabs.com';
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email === email);

    if (!user) { console.log('User not found'); return; }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('user_id', user.id).single();
    console.log(`User Profile Org ID: ${profile?.org_id}`);

    // 2. Get Peptides Org Distribution
    const { data: peptides } = await supabase.from('peptides').select('id, name, org_id');

    if (!peptides || peptides.length === 0) {
        console.log('No peptides found in DB!');
        return;
    }

    // Group by Org
    const orgCounts: Record<string, number> = {};
    peptides.forEach(p => {
        orgCounts[p.org_id] = (orgCounts[p.org_id] || 0) + 1;
    });

    console.log('Peptide Counts by Org ID:', orgCounts);

    if (profile?.org_id && orgCounts[profile.org_id]) {
        console.log(`MATCH! User should see ${orgCounts[profile.org_id]} peptides.`);
    } else {
        console.log('MISMATCH! User sees 0 peptides.');
        // Suggest fix
        const targetOrgId = Object.keys(orgCounts)[0]; // Just take the one that has data?
        console.log(`Potential Fix: Update User to Org ${targetOrgId} OR Update Peptides to Org ${profile?.org_id}`);
    }
}

checkAlignment();
