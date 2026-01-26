
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    console.log("--- Testing Manual Inventory Insert ---");

    const jordanContactId = "902a4eb7-ca37-4b0f-ae81-8f80c87906d2";
    const semaxPeptideId = "c88d6990-cd75-4a9a-9051-d09260afd4dd";

    const entry = {
        contact_id: jordanContactId,
        peptide_id: semaxPeptideId,
        batch_number: 'TEST-BATCH',
        vial_size_mg: 10,
        current_quantity_mg: 10,
        initial_quantity_mg: 10,
        status: 'active'
    };

    const { data, error } = await supabase
        .from('client_inventory')
        .insert(entry)
        .select();

    if (error) {
        console.error("Insert failed:", error.message, error.details, error.hint);
    } else {
        console.log("Insert successful!", data);
        // Cleanup
        await supabase.from('client_inventory').delete().eq('id', data[0].id);
    }
}

testInsert();
