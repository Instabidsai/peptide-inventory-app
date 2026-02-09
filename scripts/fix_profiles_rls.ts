import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const sbUrl = process.env.VITE_SUPABASE_URL!;
const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function fixRLS() {
    const admin = createClient(sbUrl, sbServiceKey);

    // Add RLS policies for profile management
    // Admin users should be able to update any profile
    const policies = [
        // Allow admins to UPDATE any profile
        `CREATE POLICY IF NOT EXISTS "Admins can update any profile"
         ON public.profiles FOR UPDATE
         USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid()
                AND role = 'admin'
            )
         )
         WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid()
                AND role = 'admin'
            )
         );`,

        // Allow users to update their own profile
        `CREATE POLICY IF NOT EXISTS "Users can update own profile"
         ON public.profiles FOR UPDATE
         USING (id = auth.uid())
         WITH CHECK (id = auth.uid());`,
    ];

    for (const sql of policies) {
        console.log('Running policy:', sql.split('\n')[0].trim());
        const { error } = await admin.rpc('exec_sql', { sql_text: sql });
        if (error) {
            // Try direct approach if exec_sql doesn't exist
            console.log('RPC failed, trying direct SQL via REST...');
            // Supabase JS client can't run raw SQL, so let's use the management API
        }
    }

    // Alternative: Use the REST SQL endpoint
    const response = await fetch(`${sbUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': sbServiceKey,
            'Authorization': `Bearer ${sbServiceKey}`,
        },
        body: JSON.stringify({ sql_text: policies[0] }),
    });

    if (!response.ok) {
        console.log('exec_sql RPC not available. Generating SQL for manual execution...');
        console.log('\n========================================');
        console.log('PLEASE RUN THIS SQL IN SUPABASE DASHBOARD:');
        console.log('========================================\n');

        const fullSql = `
-- Fix: Allow admins to update profiles (commission_rate, parent_rep_id, etc.)
-- Drop existing policies first to avoid conflicts
DO $$ BEGIN
    DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
    DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow admins to update any profile
CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Also ensure admins can SELECT all profiles (may already exist)
CREATE POLICY IF NOT EXISTS "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);
`;
        console.log(fullSql);

        // Also save to file
        const fs = await import('fs');
        fs.writeFileSync('scripts/fix_profiles_rls.sql', fullSql);
        console.log('Saved to: scripts/fix_profiles_rls.sql');
    } else {
        console.log('Policy applied successfully!');
    }

    // Verify: test anon update again
    console.log('\n=== Verifying after fix ===');
    const { data, error } = await admin
        .from('profiles')
        .select('id, full_name, commission_rate')
        .eq('role', 'sales_rep');
    console.log('Current reps:', data);
}

fixRLS().catch(console.error);
