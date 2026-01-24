-- Add water tracking functionality
-- Creates water_logs table and adds water goal to user settings

-- Create water_logs table
CREATE TABLE IF NOT EXISTS water_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  amount_oz INTEGER NOT NULL CHECK (amount_oz > 0),
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries by user and date
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date 
ON water_logs(user_id, logged_at DESC);

-- Enable RLS
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own water logs"
  ON water_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own water logs"
  ON water_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own water logs"
  ON water_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Add water goal column to daily_macro_goals
ALTER TABLE daily_macro_goals 
ADD COLUMN IF NOT EXISTS water_goal_oz INTEGER DEFAULT 64;

-- Add comment
COMMENT ON TABLE water_logs IS 'Tracks daily water intake for users';
COMMENT ON COLUMN daily_macro_goals.water_goal_oz IS 'Daily water intake goal in ounces (default: 64 oz / 8 glasses)';
