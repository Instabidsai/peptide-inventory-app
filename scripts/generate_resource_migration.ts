
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the parent directory's .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
// Note: In a real prod environment we'd use service_role key for migrations, 
// but for local dev with open policies/postgres user, this often works or we use direct SQL.

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

// Check if we can run SQL directly via RPC or if we need to output SQL for the user.
// Since we don't have a direct "run_sql" rpc usually set up for anon, I will generate the SQL
// and also try to run it via the postgres connection if possible, or just log it.
// Given previous patterns, I will generate a SQL file for the user to run, 
// BUT I will also try to use the 'postgres' connection if typical node-postgres is available? 
// Actually, looking at previous scripts, users usually ran them or I outputted SQL.
// Let's create a SQL file that the user can run in the Supabase Dashboard SQL Editor.

const sql = `
-- Add contact_id to resources table
ALTER TABLE public.resources 
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE;

-- Update RLS Policy for 'Select' on resources
-- Allow users to see resources where contact_id is NULL (Global) OR contact_id matches their linked contact record

DROP POLICY IF EXISTS "Enable read access for all users" ON public.resources;

CREATE POLICY "Enable read access for public and assigned resources" ON public.resources
FOR SELECT
USING (
    contact_id IS NULL 
    OR 
    contact_id IN (
        SELECT id FROM public.contacts 
        WHERE linked_user_id = auth.uid()
    )
);

-- Allow Admins full access (assuming created_by or org check logic exists or just basic authenticated for now pending strict admin RLS)
-- For now, we often rely on the app logic for admin write, but let's ensure admins can write.
-- Existing policies might be "Enable read access for all users". 
-- Let's add a write policy for authenticated users (or restrict to admin in real app).

CREATE POLICY "Enable write access for authenticated users" ON public.resources
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON public.resources
FOR UPDATE
USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON public.resources
FOR DELETE
USING (auth.role() = 'authenticated');
`;

console.log("Migration SQL generated. Please run this in your Supabase SQL Editor:");
console.log("---------------------------------------------------------------------");
console.log(sql);
console.log("---------------------------------------------------------------------");
