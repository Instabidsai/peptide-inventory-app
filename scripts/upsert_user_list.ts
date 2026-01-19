
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

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const userList = [
    "Tirzepatide 10mg",
    "Tirzepatide 20mg",
    "Tirzepatide 30mg",
    "Retatrutide 10mg",
    "Retatrutide 20mg",
    "Retatrutide 30mg",
    "Retatrutide 60mg",
    "TB500 10mg",
    "TB500 20mg",
    "BPC-157 10mg",
    "BPC-157 20mg",
    "BPC/TB500 Blend 5mg/5mg",
    "BPC/TB500 Blend 10mg/10mg",
    "Tesamorelin/Ipamorelin Blnd 11mg/6mg",
    "CJC (no DAC)/Ipamorelin 5mg/5mg",
    "CJC (no DAC) 5mg",
    "Cagriniltide 10mg",
    "DSIP 10mg",
    "Epithalon 40mg",
    "FOXO4 10mg",
    "GHK-CU 100mg",
    "Glutathione 1500mg",
    "Ipamorelin 10mg",
    "Kisspeptin 10mg",
    "KPV 10mg",
    "LL-37 5mg",
    "Melanotan 2 10mg",
    "MOTS-C 40mg",
    "NAD+ 1000mg",
    "Oxytocin 10mg",
    "PT-141 10mg",
    "SS-31 50mg",
    "Selank 10mg",
    "Semax 10mg",
    "Sermorelin 10mg",
    "Tesamorelin 10mg",
    "Tesamorelin 20mg",
    "Thy Alpha 1 10mg",
    "VIP 10mg",
    "5-Amino 1MQ 50mg",
    "ARA-290 10mg"
];

async function run() {
    console.log('Starting user list import...');

    // 1. Get Org ID
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
    if (!orgs || orgs.length === 0) {
        console.error('No Organization found!');
        return;
    }
    const orgId = orgs[0].id;
    console.log(`Using Org ID: ${orgId}`);

    // 2. Insert Peptides
    let count = 0;
    for (const name of userList) {
        // Check if exists
        const { data: existing } = await supabase
            .from('peptides')
            .select('id')
            .eq('org_id', orgId)
            .eq('name', name)
            .maybeSingle();

        if (!existing) {
            const { error } = await supabase.from('peptides').insert({
                name,
                org_id: orgId,
                active: true
            });
            if (error) console.error(`Error inserting ${name}:`, error.message);
            else {
                console.log(`Inserted: ${name}`);
                count++;
            }
        } else {
            console.log(`Skipped (exists): ${name}`);
        }
    }

    console.log(`Import complete. Added ${count} peptides from user list.`);
}

run();
