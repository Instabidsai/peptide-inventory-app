-- Create new migration for updated supplement images
-- Update existing supplements with better images
-- We search by name (CASE INSENSITIVE)

-- Creatine
UPDATE supplements 
SET image_url = 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?auto=format&fit=crop&w=500&q=80',
    description = 'Pure Micronized Creatine Monohydrate Powder. Enhances muscle mass, power, and recovery.'
WHERE name ILIKE '%creatine%' AND (image_url IS NULL OR image_url LIKE '%placehold%');

-- TMG
UPDATE supplements
SET image_url = 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&w=500&q=80',
    description = 'Trimethylglycine (Betaine). Supports healthy homocysteine levels and methylation.'
WHERE name ILIKE '%TMG%' AND (image_url IS NULL OR image_url LIKE '%placehold%');

-- Omega 3
UPDATE supplements
SET image_url = 'https://images.unsplash.com/photo-1599423300746-b62533397364?auto=format&fit=crop&w=500&q=80',
    description = 'Triple Strength Wild Alaskan Fish Oil (1250mg). Sustainably sourced, supports heart & brain health.'
WHERE name ILIKE '%Omega%' AND (image_url IS NULL OR image_url LIKE '%placehold%');

-- Zinc
UPDATE supplements
SET image_url = 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=500&q=80',
    description = 'Highly absorbable Zinc Picolinate. Essential for immune function, enzyme activity, and skin reducing inflammation.'
WHERE name ILIKE '%Zinc%' AND (image_url IS NULL OR image_url LIKE '%placehold%');
