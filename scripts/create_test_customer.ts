
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

// 1. Supabase Config (Anon Key from client.ts)
const SUPABASE_URL = "https://mckkegmkpqdicudnfhor.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. DB Config (From fix_rls.ts)
const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const pgClient = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

const TARGET_EMAIL = "jameskuhlman27@gmail.com";
const TARGET_PASS = "James1";
const TARGET_NAME = "James Kuhlman";

async function createCustomer() {
    try {
        console.log(`Creating user: ${TARGET_EMAIL}...`);

        // A. Sign Up via Supabase Client
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: TARGET_EMAIL,
            password: TARGET_PASS,
            options: {
                data: {
                    full_name: TARGET_NAME,
                    role: 'client' // Try to set metadata, though profile logic might ignore it
                }
            }
        });

        if (authError) {
            console.error("Sign Up Error:", authError.message);
            // If user already exists, we proceed to fix permissions anyway
            if (!authError.message.includes("already registered")) {
                process.exit(1);
            }
            console.log("User might already exist, proceeding to fix/confirm...");
        } else {
            console.log("Sign Up request sent. User ID:", authData.user?.id);
        }

        // B. Connect to DB to Confirm Email & Setup Profile
        await pgClient.connect();

        // 1. Confirm Email
        console.log("Auto-confirming email...");
        await pgClient.query(`
            UPDATE auth.users 
            SET email_confirmed_at = NOW(), raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"client"')
            WHERE email = $1
        `, [TARGET_EMAIL]);

        // 2. Get User ID (in case we didn't get it from signup)
        const userRes = await pgClient.query(`SELECT id FROM auth.users WHERE email = $1`, [TARGET_EMAIL]);
        const userId = userRes.rows[0]?.id;

        if (!userId) throw new Error("User ID not found in DB.");

        console.log(`User ID confirmed: ${userId}`);

        // 3. Ensure Profile
        // Insert or Update profile to be 'client'
        console.log("Setting up Profile...");
        await pgClient.query(`
            INSERT INTO public.profiles (id, full_name, role)
            VALUES ($1, $2, 'client')
            ON CONFLICT (id) DO UPDATE 
            SET full_name = $2, role = 'client'
        `, [userId, TARGET_NAME]);

        // 4. Ensure Contact (Business Entity)
        // Check if organization exists first
        const orgRes = await pgClient.query(`SELECT id FROM public.organizations LIMIT 1`);
        const orgId = orgRes.rows[0]?.id;

        if (orgId) {
            console.log("Linking to Contact...");
            // Check if contact with email exists
            const contactRes = await pgClient.query(`SELECT id FROM public.contacts WHERE email = $1`, [TARGET_EMAIL]);
            let contactId = contactRes.rows[0]?.id;

            if (!contactId) {
                // Create new contact
                const newContact = await pgClient.query(`
                    INSERT INTO public.contacts (org_id, name, email, type, status)
                    VALUES ($1, $2, $3, 'client', 'active')
                    RETURNING id
                `, [orgId, TARGET_NAME, TARGET_EMAIL]);
                contactId = newContact.rows[0].id;
                console.log(`Created new Contact: ${contactId}`);
            } else {
                console.log(`Found existing Contact: ${contactId}`);
            }

            // OPTIONAL: Link profile to contact?
            // Usually linking is done via shared email or explicit column.
            // Some apps have 'user_id' in contacts or 'contact_id' in profiles.
            // Let's check columns quickly via a try/catch update? Or just leave it.
            // Usually the app matches by email or strict link.
            // Let's safe-update profiles reference if exists
            try {
                await pgClient.query(`UPDATE public.profiles SET contact_id = $1 WHERE id = $2`, [contactId, userId]);
            } catch (e) {
                // Ignore if column doesn't exist
            }
        }

        console.log("SUCCESS: User created and configured.");
        console.log(`Login: ${TARGET_EMAIL}`);
        console.log(`Pass:  ${TARGET_PASS}`);

    } catch (e: any) {
        console.error("Script Failed:", e);
    } finally {
        await pgClient.end();
    }
}

createCustomer();
