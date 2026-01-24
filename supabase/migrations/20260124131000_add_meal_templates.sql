-- Add meal templates functionality to favorite_foods
-- Extends favorites to support full meal templates with meal types

ALTER TABLE favorite_foods
ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS template_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS meal_type VARCHAR(50) CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'other'));

-- Create index for faster template queries
CREATE INDEX IF NOT EXISTS idx_favorite_foods_templates 
ON favorite_foods(user_id, is_template, meal_type) WHERE is_template = true;

-- Add comment
COMMENT ON COLUMN favorite_foods.is_template IS 'Indicates if this is a meal template (true) or just a favorite food (false)';
COMMENT ON COLUMN favorite_foods.template_name IS 'Name of the meal template (e.g., "My Protein Shake", "Standard Breakfast")';
COMMENT ON COLUMN favorite_foods.meal_type IS 'Type of meal: breakfast, lunch, dinner, snack, or other';
