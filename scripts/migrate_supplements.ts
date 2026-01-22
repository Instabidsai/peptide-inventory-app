
import { Client } from 'pg';


const projectRef = "mckkegmkpqdicudnfhor";
const password = "eApOyEConVNU0nQj";
const dbName = "postgres";

// Try multiple connection strings (Direct vs Pooler)
const connectionStrings = [
    `postgres://postgres:${password}@db.${projectRef}.supabase.co:5432/${dbName}`,
    `postgres://postgres.${projectRef}:${password}@aws-0-us-east-1.pooler.supabase.com:5432/${dbName}`,
    `postgres://postgres.${projectRef}:${password}@aws-0-us-east-1.pooler.supabase.com:6543/${dbName}`
];

async function runMigrationWithClient(connectionString: string) {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log(`Connected to database via ${connectionString.split('@')[1]}...`);

        // 1. Create supplements table
        console.log('Creating supplements table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.supplements (
                id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                name text NOT NULL,
                description text,
                image_url text,
                purchase_link text,
                default_dosage text,
                created_at timestamptz DEFAULT now() NOT NULL
            );
        `);

        // 2. Create protocol_supplements table
        console.log('Creating protocol_supplements table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.protocol_supplements (
                id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                protocol_id uuid REFERENCES public.protocols(id) ON DELETE CASCADE NOT NULL,
                supplement_id uuid REFERENCES public.supplements(id) ON DELETE CASCADE NOT NULL,
                dosage text,
                frequency text,
                notes text,
                created_at timestamptz DEFAULT now() NOT NULL
            );
        `);

        // 3. Enable RLS
        console.log('Enabling RLS...');
        await client.query(`ALTER TABLE public.supplements ENABLE ROW LEVEL SECURITY;`);
        await client.query(`ALTER TABLE public.protocol_supplements ENABLE ROW LEVEL SECURITY;`);

        // 4. Create Policies
        console.log('Creating Policies...');

        // Supplements Policies
        await client.query(`
            DO $$ 
            BEGIN
                -- Drop existing policies if they exist to avoid errors
                DROP POLICY IF EXISTS "Supplements are viewable by everyone" ON public.supplements;
                DROP POLICY IF EXISTS "Supplements are insertable by admin" ON public.supplements;
                DROP POLICY IF EXISTS "Supplements are updateable by admin" ON public.supplements;
                DROP POLICY IF EXISTS "Supplements are deletable by admin" ON public.supplements;
            END $$;
        `);

        await client.query(`
            CREATE POLICY "Supplements are viewable by everyone" ON public.supplements FOR SELECT USING (auth.role() = 'authenticated');
            CREATE POLICY "Supplements are insertable by admin" ON public.supplements FOR INSERT WITH CHECK (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
            CREATE POLICY "Supplements are updateable by admin" ON public.supplements FOR UPDATE USING (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
            CREATE POLICY "Supplements are deletable by admin" ON public.supplements FOR DELETE USING (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
        `);

        // Protocol Supplements Policies
        await client.query(`
            DO $$ 
            BEGIN
                DROP POLICY IF EXISTS "Admins can manage all protocol supplements" ON public.protocol_supplements;
                DROP POLICY IF EXISTS "Clients can view their own protocol supplements" ON public.protocol_supplements;
            END $$;
        `);

        await client.query(`
            CREATE POLICY "Admins can manage all protocol supplements" ON public.protocol_supplements USING (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
            
            CREATE POLICY "Clients can view their own protocol supplements" ON public.protocol_supplements FOR SELECT USING (
                exists (
                    select 1 from public.protocols p
                    join public.contacts c on p.contact_id = c.id
                    where p.id = protocol_supplements.protocol_id
                    and c.linked_user_id = auth.uid()
                )
            );
        `);

        console.log('Migration completed successfully.');
        await client.end();
        return true;

    } catch (err: any) {
        console.error(`Migration failed with this connection: ${err.message}`);
        await client.end();
        return false;
    }
}

async function run() {
    for (const conn of connectionStrings) {
        const success = await runMigrationWithClient(conn);
        if (success) {
            process.exit(0);
        }
    }
    console.error("All connection attempts failed.");
    process.exit(1);
}

run();

