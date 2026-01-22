
-- Clear existing supplements (optional, but requested to be '1st ones')
DELETE FROM supplements;

INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage, default_frequency)
VALUES
(
    'Sports Research Alaskan Omega-3', 
    'Triple Strength Wild Alaskan Fish Oil (1250mg). Sustainably sourced, supports heart, brain & joint health.', 
    'https://m.media-amazon.com/images/I/71Y-tVkUeJL._AC_SX679_.jpg', 
    'https://www.amazon.com/s?k=Sports+Research+Alaskan+Omega-3+Triple+Strength', 
    '1 Softgel', 
    'Daily'
),
(
    'Life Extension TMG 500mg', 
    'Trimethylglycine (Betaine). Supports healthy homocysteine levels and promotes liver health.', 
    'https://m.media-amazon.com/images/I/71T5N-gCjEL._AC_SX679_.jpg', 
    'https://www.amazon.com/s?k=Life+Extension+TMG+500mg', 
    '1-2 Capsules', 
    'Morning'
),
(
    'Thorne Zinc Picolinate 30mg', 
    'Highly absorbable Zinc Picolinate. Essential for immune function, reproductive health, and growth.', 
    'https://m.media-amazon.com/images/I/61Kq-q-q-qL._AC_SX679_.jpg', 
    'https://www.amazon.com/s?k=Thorne+Zinc+Picolinate+30mg', 
    '1 Capsule', 
    'Daily'
),
(
    'BulkSupplements Creatine Monohydrate', 
    'Pure Micronized Creatine Monohydrate Powder. diverse applications for muscle mass, power, and cognitive support.', 
    'https://m.media-amazon.com/images/I/81+X+X+X+XL._AC_SX679_.jpg', 
    'https://www.amazon.com/s?k=BulkSupplements+Creatine+Monohydrate+Micronized', 
    '5000 mg (5g)', 
    'Daily'
);
