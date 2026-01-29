
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path, { dirname } from 'path';

import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading env from:', envPath);
const result = dotenv.config({ path: envPath });
if (result.error) {
    console.error('Dotenv error:', result.error);
}
console.log('Env keys loaded:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const supplements = [
    {
        name: 'Sports Research Alaskan Omega-3',
        description: 'Triple Strength Wild Alaskan Fish Oil (1250mg). Sustainably sourced, supports heart, brain & joint health.',
        image_url: 'https://placehold.co/600x600/0f172a/ffffff?text=Omega+3',
        purchase_link: 'https://www.amazon.com/s?k=Sports+Research+Alaskan+Omega-3+Triple+Strength'
    },
    {
        name: 'Life Extension TMG 500mg',
        description: 'Trimethylglycine (Betaine). Supports healthy homocysteine levels and promotes liver health.',
        image_url: 'https://placehold.co/600x600/1e3a8a/ffffff?text=TMG',
        purchase_link: 'https://www.amazon.com/s?k=Life+Extension+TMG+500mg'
    },
    {
        name: 'Thorne Zinc Picolinate 30mg',
        description: 'Highly absorbable Zinc Picolinate. Essential for immune function, reproductive health, and growth.',
        image_url: 'https://placehold.co/600x600/ffffff/000000?text=Zinc',
        purchase_link: 'https://www.amazon.com/s?k=Thorne+Zinc+Picolinate+30mg'
    },
    {
        name: 'BulkSupplements Creatine Monohydrate',
        description: 'Pure Micronized Creatine Monohydrate Powder. Enhances muscle mass, power, and cognitive support.',
        image_url: 'https://placehold.co/600x600/e2e8f0/000000?text=Creatine',
        purchase_link: 'https://www.amazon.com/s?k=BulkSupplements+Creatine+Monohydrate+Micronized'
    }
];

async function seed() {
    console.log('Clearing existing supplements...');
    const { error: deleteError } = await supabase.from('supplements').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    if (deleteError) {
        console.error('Error clearing supplements:', deleteError);
        // Continue anyway, maybe table empty
    }

    console.log('Inserting 4 new supplements...');
    const { data, error } = await supabase.from('supplements').insert(supplements).select();

    if (error) {
        console.error('Error inserting supplements:', error);
    } else {
        console.log('Success! Inserted:', data.length, 'items.');
        console.log(data);
    }
}

seed();
