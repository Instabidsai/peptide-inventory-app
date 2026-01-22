
-- Create protocol_logs table for tracking usage
create table if not exists public.protocol_logs (
    id uuid not null default gen_random_uuid(),
    protocol_item_id uuid not null references public.protocol_items(id) on delete cascade,
    user_id uuid references auth.users(id),
    taken_at timestamp with time zone default now(),
    status text default 'taken',
    notes text,
    created_at timestamp with time zone default now(),
    primary key (id)
);

-- Add RLS policies
alter table public.protocol_logs enable row level security;

create policy "Users can view their organization's logs"
    on public.protocol_logs for select
    using (
        exists (
            select 1 from public.protocol_items pi
            join public.protocols p on pi.protocol_id = p.id
            join public.profiles pr on pr.org_id = p.org_id
            where pi.id = protocol_logs.protocol_item_id
            and pr.user_id = auth.uid()
        )
    );

create policy "Users can insert logs for their organization"
    on public.protocol_logs for insert
    with check (
        exists (
            select 1 from public.protocol_items pi
            join public.protocols p on pi.protocol_id = p.id
            join public.profiles pr on pr.org_id = p.org_id
            where pi.id = protocol_logs.protocol_item_id
            and pr.user_id = auth.uid()
        )
    );
