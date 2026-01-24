
-- Create daily_macro_goals table
CREATE TABLE IF NOT EXISTS public.daily_macro_goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    calories_target INTEGER DEFAULT 2000,
    protein_target INTEGER DEFAULT 150,
    carbs_target INTEGER DEFAULT 200,
    fat_target INTEGER DEFAULT 65,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id) -- Ensure one goal record per user
);

-- Enable RLS
ALTER TABLE public.daily_macro_goals ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own macro goals"
    ON public.daily_macro_goals
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
