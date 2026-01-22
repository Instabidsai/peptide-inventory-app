
import { Client } from 'pg';

const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

const client = new Client({
    connectionString,
});

async function runMigration() {
    try {
        await client.connect();
        console.log('Connected to database...');

        // 1. Update Enums
        console.log('Updating Enums...');
        // allow 'client' in app_role if not exists. 'client' matches the plan for "Family/Network/Public" users.
        // We use ALTER TYPE ... ADD VALUE IF NOT EXISTS logic handled by exception or check
        try {
            await client.query(`ALTER TYPE "public"."app_role" ADD VALUE IF NOT EXISTS 'client'`);
        } catch (e) {
            console.log('Enum value might already exist or error:', e.message);
        }

        // 2. Update Contacts Table
        console.log('Updating contacts table...');
        await client.query(`
            ALTER TABLE contacts
            ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES auth.users(id),
            ADD COLUMN IF NOT EXISTS tier text DEFAULT 'public';
        `);
        // Note: tier should ideally be an enum, but text is more flexible for now. 
        // We can enforce enum check in app or create type. Plan said enum: 'family', 'network', 'public'.
        // Let's create the enum type for strictness if possible, or just check constraint.
        // Choosing check constraint for simplicity in migration without full type drop/create hassle.
        await client.query(`
            ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_tier_check;
            ALTER TABLE contacts ADD CONSTRAINT contacts_tier_check CHECK (tier IN ('family', 'network', 'public'));
        `);

        // 3. Create protocol_feedback table
        console.log('Creating protocol_feedback table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS protocol_feedback (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                protocol_id uuid REFERENCES protocols(id) ON DELETE CASCADE,
                user_id uuid REFERENCES auth.users(id),
                rating smallint CHECK (rating >= 1 AND rating <= 5),
                comment text,
                created_at timestamptz DEFAULT now()
            );
        `);

        // 4. Create resources table
        console.log('Creating resources table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS resources (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                peptide_id uuid REFERENCES peptides(id) ON DELETE SET NULL, -- nullable, if null = general resource
                title text NOT NULL,
                url text NOT NULL,
                type text CHECK (type IN ('video', 'article', 'pdf')),
                description text,
                created_at timestamptz DEFAULT now()
            );
        `);

        // 5. Enable RLS on new tables
        console.log('Enabling RLS...');
        await client.query(`ALTER TABLE protocol_feedback ENABLE ROW LEVEL SECURITY;`);
        await client.query(`ALTER TABLE resources ENABLE ROW LEVEL SECURITY;`);

        // 6. RLS Policies (Basic Initial Set)
        console.log('Creating RLS Policies...');

        // Resources: Public read (or authenticated read)
        await client.query(`
            DROP POLICY IF EXISTS "Enable read access for all users" ON resources;
            CREATE POLICY "Enable read access for all users" ON resources FOR SELECT USING (true);
        `);

        // Protocol Feedback: Users can insert their own, Admin can read all
        // Note: "Admin" role check depends on how we handle auth.
        // For now, simpler policy: Users can insert. Users can view their own.
        await client.query(`
             DROP POLICY IF EXISTS "Users can insert own feedback" ON protocol_feedback;
             CREATE POLICY "Users can insert own feedback" ON protocol_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
             
             DROP POLICY IF EXISTS "Users can view own feedback" ON protocol_feedback;
             CREATE POLICY "Users can view own feedback" ON protocol_feedback FOR SELECT USING (auth.uid() = user_id);
        `);

        // Contacts: Update RLS so users can see THEIR OWN contact record (to know their tier)
        await client.query(`
             DROP POLICY IF EXISTS "Users can view own contact link" ON contacts;
             CREATE POLICY "Users can view own contact link" ON contacts FOR SELECT USING (auth.uid() = linked_user_id);
        `);

        console.log('Migration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
