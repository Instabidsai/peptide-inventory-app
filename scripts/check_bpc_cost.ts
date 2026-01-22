
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCost() {
    // 1. Find BPC-157 (broader search)
    const { data: peptides } = await supabase.from('peptides').select('*').ilike('name', '%BPC-157%');

    if (!peptides || peptides.length === 0) {
        console.log('No BPC-157 found with broad search.');
        // List all peptides to see what EXISTS
        const { data: allPeptides } = await supabase.from('peptides').select('*').limit(5);
        console.log('Sample of peptides in DB:', allPeptides);
        return;
    }

    const peptide = peptides[0];
    console.log(`Found Peptide: ${peptide.name} (ID: ${peptide.id})`);

    // 2. Get bottles/lots for this peptide
    const { data: lots } = await supabase.from('lots')
        .select('*')
        .eq('peptide_id', peptide.id);

    console.log('Lots:', lots);

    // 3. Calculate avg cost
    let totalCost = 0;
    let count = 0;

    // We need to look at bottles to be accurate to the hook logic roughly, 
    // but the hook uses bottles status='in_stock'.
    // Let's just average the lots for a quick check or check available bottles.

    const { data: bottles } = await supabase.from('bottles')
        .select(`
            id,
            status,
            lots (
                cost_per_unit
            )
        `)
        .eq('status', 'in_stock')
    // Filter by peptide virtually or fetch all and filter
    // Easier to fetch lots first? No, the hook does bottles -> lots.

    const relevantBottles = bottles?.filter((b: any) => b.lots && lots?.some(l => l.id === b.lots.id && l.peptide_id === peptide.id));

    if (relevantBottles) {
        relevantBottles.forEach((b: any) => {
            count++;
            totalCost += b.lots.cost_per_unit;
        });
        console.log(`In-Stock Bottles Count: ${count}`);
        console.log(`Total Cost: ${totalCost}`);
        console.log(`Avg Cost: ${count ? totalCost / count : 0}`);
    } else {
        console.log("No in-stock bottles found via this query path.");
    }
}

checkCost();
