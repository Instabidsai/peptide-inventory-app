
-- Create favorite_foods table
create table if not exists public.favorite_foods (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users not null,
    name text not null,
    calories numeric not null default 0,
    protein numeric not null default 0,
    carbs numeric not null default 0,
    fat numeric not null default 0,
    quantity text default '1 serving',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.favorite_foods enable row level security;

-- Policies
create policy "Users can view their own favorites"
    on public.favorite_foods for select
    using (auth.uid() = user_id);

create policy "Users can insert their own favorites"
    on public.favorite_foods for insert
    with check (auth.uid() = user_id);

create policy "Users can delete their own favorites"
    on public.favorite_foods for delete
    using (auth.uid() = user_id);

-- Add index
create index favorite_foods_user_id_idx on public.favorite_foods(user_id);
