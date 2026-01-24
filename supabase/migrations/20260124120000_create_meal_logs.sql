
-- Create meal_logs table
CREATE TABLE IF NOT EXISTS public.meal_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url TEXT,
    foods JSONB DEFAULT '[]'::JSONB,
    total_calories NUMERIC DEFAULT 0,
    total_protein NUMERIC DEFAULT 0,
    total_carbs NUMERIC DEFAULT 0,
    total_fat NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

-- Create Policy for Insert (Users can create their own logs)
CREATE POLICY "Users can insert their own meal logs"
    ON public.meal_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create Policy for Select (Users can view their own logs)
CREATE POLICY "Users can view their own meal logs"
    ON public.meal_logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Create Policy for Update (Users can update their own logs)
CREATE POLICY "Users can update their own meal logs"
    ON public.meal_logs
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Create Policy for Delete (Users can delete their own logs)
CREATE POLICY "Users can delete their own meal logs"
    ON public.meal_logs
    FOR DELETE
    USING (auth.uid() = user_id);
