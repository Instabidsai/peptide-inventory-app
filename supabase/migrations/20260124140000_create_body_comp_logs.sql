
-- Create body_composition_logs table
CREATE TABLE IF NOT EXISTS public.body_composition_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    weight NUMERIC, -- lbs or kg (app assumes user consistency for now)
    body_fat_percentage NUMERIC,
    muscle_mass NUMERIC,
    visceral_fat NUMERIC,
    water_percentage NUMERIC,
    bmi NUMERIC,
    bmr NUMERIC,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.body_composition_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own body composition logs"
    ON public.body_composition_logs
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
