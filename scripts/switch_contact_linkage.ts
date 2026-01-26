
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

async function switchLinkage() {
    console.log("--- Switching Contact Linkage ---");

    // 1. Get JT (Source)
    const { data: sourceContact, error: sourceError } = await supabase
        .from('contacts')
        .select('*')
        .eq('name', 'JT')
        .single();

    if (sourceError || !sourceContact) {
        console.error("Could not find 'JT'", sourceError);
        return;
    }

    const userId = sourceContact.linked_user_id;
    if (!userId) {
        console.log("'JT' has no linked user ID!");
        return;
    }
    console.log(`Found Active User ID on 'JT': ${userId}`);

    // 2. Get Justin Thompson (Target)
    // NOTE: Checking specifically for the one named "Justin Thompson"
    const { data: targetContact, error: targetError } = await supabase
        .from('contacts')
        .select('*')
        .eq('name', 'Justin Thompson')
        .single();

    if (targetError || !targetContact) {
        console.error("Could not find 'Justin Thompson'", targetError);
        return;
    }
    console.log(`Found Target 'Justin Thompson' (ID: ${targetContact.id})`);

    // 3. Perform Swap
    // A. Clear Source
    const { error: clearError } = await supabase
        .from('contacts')
        .update({ linked_user_id: null })
        .eq('id', sourceContact.id);

    if (clearError) {
        console.error("Failed to clear JT:", clearError);
        return;
    }
    console.log("Cleared linkage from JT.");

    // B. Set Target
    const { error: updateError } = await supabase
        .from('contacts')
        .update({ linked_user_id: userId })
        .eq('id', targetContact.id);

    if (updateError) {
        console.error("Failed to link Justin Thompson:", updateError);
        // Try to revert? (Manual for now)
    } else {
        console.log("✅ Successfully linked User to 'Justin Thompson'.");
    }
}

switchLinkage();
