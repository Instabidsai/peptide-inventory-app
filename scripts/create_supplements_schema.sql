-- Create supplements table
create table public.supplements (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  image_url text,
  purchase_link text,
  default_dosage text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create protocol_supplements table (linking protocols to supplements)
create table public.protocol_supplements (
  id uuid default gen_random_uuid() primary key,
  protocol_id uuid references public.protocols(id) on delete cascade not null,
  supplement_id uuid references public.supplements(id) on delete cascade not null,
  dosage text, -- e.g. "2 capsules"
  frequency text, -- e.g. "Daily with breakfast"
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.supplements enable row level security;
alter table public.protocol_supplements enable row level security;

-- Policies for supplements (Catalog is readable by all authenticated, editable by admin)
create policy "Supplements are viewable by everyone"
  on public.supplements for select
  using ( auth.role() = 'authenticated' );

create policy "Supplements are insertable by admin"
  on public.supplements for insert
  with check ( 
    exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
  );

create policy "Supplements are updateable by admin"
  on public.supplements for update
  using ( 
    exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
  );

create policy "Supplements are deletable by admin"
  on public.supplements for delete
  using ( 
    exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
  );

-- Policies for protocol_supplements
-- Admins can do everything
create policy "Admins can manage all protocol supplements"
  on public.protocol_supplements
  using ( 
    exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' )
  );

-- Clients can view their own protocol supplements
-- (Need to join through protocols -> contacts -> profiles, or just trust if they have access to the protocol)
-- Simplifying: If they can see the protocol, they can see the items.
-- But standard pattern:
create policy "Clients can view their own protocol supplements"
  on public.protocol_supplements for select
  using (
    exists (
      select 1 from public.protocols p
      where p.id = protocol_supplements.protocol_id
      and p.contact_id = auth.uid() -- Allows if contact ID matches auth ID directly (for some setups)
    )
    OR
    -- Allow if the contact linked to the protocol has a linked_user_id matching auth.uid()
    exists (
       select 1 from public.protocols p
       join public.contacts c on p.contact_id = c.id
       where p.id = protocol_supplements.protocol_id
       and c.linked_user_id = auth.uid()
    )
  );
