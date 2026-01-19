
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

// Hardcoded for reliability during this session
const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

const peptides = [
    "Tesamorelin 10mg + Ipamorelin 10mg Bundle",
    "MOTS-C 40mg + SS-31 50mg Bundle",
    "BPC-157 + TB-500 Bundle",
    "GLP2-T",
    "ARA-290",
    "5-Amino 1MQ",
    "VIP",
    "Thy Alpha 1",
    "Tesamorelin",
    "Sermorelin",
    "Semax",
    "Selank",
    "SS-31",
    "PT-141",
    "Oxytocin",
    "NAD+",
    "MOTS-C",
    "Melanotan 2",
    "LL-37",
    "KPV",
    "Kisspeptin",
    "Ipamorelin",
    "Glutathione",
    "GHK-CU",
    "FOXO4",
    "Epithalon",
    "DSIP",
    "Cagriniltide",
    "CJC (no DAC)",
    "CJC (no DAC)/Ipamorelin 5mg/5mg",
    "Tesamorelin/Ipamorelin Blnd 11mg/6mg",
    "BPC/TB500 Blend 10mg/10mg",
    "BPC/TB500 Blend 5mg/5mg",
    "BPC-157",
    "TB500"
];

async function run() {
    console.log('Starting catalog import...');

    // 1. Get Org ID
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
    if (!orgs || orgs.length === 0) {
        console.error('No Organization found! Run fix_admin first.');
        return;
    }
    const orgId = orgs[0].id;
    console.log(`Using Org ID: ${orgId}`);

    // 2. Insert Peptides
    let count = 0;
    for (const name of peptides) {
        // Upsert by name + org_id to avoid duplicates if possible, or just insert
        // Since we don't have a unique constraint on name per org in schema (probably), check first
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

    console.log(`Import complete. Added ${count} new peptides.`);
}

run();
