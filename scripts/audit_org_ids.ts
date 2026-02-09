
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function auditOrgIds() {
    console.log("----------------------------------------------------------------");
    console.log("AUDITING ORG_ID CONSISTENCY: Semax");
    console.log("----------------------------------------------------------------");

    // 1. Get Peptide
    const { data: peptide } = await supabase
        .from('peptides')
        .select('id, org_id, name')
        .ilike('name', '%Semax%')
        .limit(1)
        .single();

    if (!peptide) {
        console.log("Semax not found.");
        return;
    }

    console.log(`Peptide: ${peptide.name}`);
    console.log(`Peptide Org ID: ${peptide.org_id}`);

    // 2. Check Lots
    const { data: lots } = await supabase
        .from('lots')
        .select('id, lot_number, org_id')
        .eq('peptide_id', peptide.id);

    console.log("\nLOTS:");
    lots?.forEach(l => {
        const match = l.org_id === peptide.org_id ? "✅" : "❌ MISMATCH";
        console.log(`  - Lot ${l.lot_number}: Org ${l.org_id} [${match}]`);
    });

    // 3. Check Bottles for these Lots
    if (lots && lots.length > 0) {
        const { data: bottles } = await supabase
            .from('bottles')
            .select('id, uid, org_id, lot_id, status')
            .in('lot_id', lots.map(l => l.id));

        console.log("\nBOTTLES SAMPLE:");
        const orgCounts: Record<string, number> = {};

        bottles?.forEach(b => {
            const oid = b.org_id;
            orgCounts[oid] = (orgCounts[oid] || 0) + 1;
        });

        console.table(orgCounts);

        // Check if any bottles have mismatching Org ID compared to key Peptide
        const alienBottles = bottles?.filter(b => b.org_id !== peptide.org_id);
        if (alienBottles && alienBottles.length > 0) {
            console.log(`⚠️ FOUND ${alienBottles.length} BOTTLES WITH WRONG ORG_ID!`);
            console.log(`   Sample: ${alienBottles[0].uid} has Org ${alienBottles[0].org_id}`);
        } else {
            console.log("✅ All bottles match the Peptide's Org ID.");
        }
    }
}

auditOrgIds();
