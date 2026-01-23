-- Create table for linking peptides to supplements
create table if not exists peptide_suggested_supplements (
  id uuid default gen_random_uuid() primary key,
  peptide_id uuid references peptides(id) on delete cascade not null,
  supplement_id uuid references supplements(id) on delete cascade not null,
  reasoning text,
  created_at timestamptz default now(),
  unique(peptide_id, supplement_id)
);

-- RLS
alter table peptide_suggested_supplements enable row level security;

create policy "Admins can manage suggestions"
  on peptide_suggested_supplements for all
  using (auth.uid() in (select id from admin_users));

create policy "Public/Authenticated Read Access"
  on peptide_suggested_supplements for select
  using (true);
