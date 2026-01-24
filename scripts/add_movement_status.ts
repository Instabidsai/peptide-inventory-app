import { Client } from 'pg';

const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

const client = new Client({
    connectionString,
});

async function runMigration() {
    try {
        await client.connect();
        console.log('Connected to database...');

        // Add status column to movements table
        console.log('Adding status column to movements table...');
        await client.query(`
            ALTER TABLE public.movements 
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
        `);

        // Add check constraint for valid values
        console.log('Adding check constraint...');
        await client.query(`
            ALTER TABLE public.movements 
            DROP CONSTRAINT IF EXISTS movements_status_check;
        `);

        await client.query(`
            ALTER TABLE public.movements 
            ADD CONSTRAINT movements_status_check 
            CHECK (status IN ('active', 'returned', 'cancelled', 'partial_return'));
        `);

        // Set existing movements to 'active' status
        console.log('Setting existing movements to active status...');
        const { rowCount } = await client.query(`
            UPDATE public.movements 
            SET status = 'active' 
            WHERE status IS NULL;
        `);
        console.log(`Updated ${rowCount} existing movements to 'active' status`);

        // Create index for performance
        console.log('Creating index on status column...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_movements_status 
            ON public.movements(status);
        `);

        // Add comment for documentation
        console.log('Adding column comment...');
        await client.query(`
            COMMENT ON COLUMN public.movements.status IS 
            'Tracks the current status of this inventory assignment: active (bottles currently with client), returned (bottles returned to stock), cancelled (transaction voided), partial_return (some bottles returned)';
        `);

        console.log('Migration completed successfully!');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
