-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a table to store your documents
create table if not exists embeddings (
  id uuid primary key default gen_random_uuid(),
  content text, -- The actual text content (e.g. "Justin logs a headache")
  metadata jsonb, -- Stores client_id, type (log/protocol/global), source_url, date
  embedding vector(1536) -- OpenAI embedding size
);

-- Turn on RLS
alter table embeddings enable row level security;

-- Index for better query performance (HNSW)
create index on embeddings using hnsw (embedding vector_cosine_ops);

-- RLS POLICIES --

-- 1. Clients can read their OWN data
create policy "Clients can read own data"
on embeddings for select
to authenticated
using (
  (metadata->>'client_id') = auth.uid()::text
);

-- 2. Clients can read GLOBAL data (Dr. Bochman, Research, etc.)
create policy "Clients can read global data"
on embeddings for select
to authenticated
using (
  (metadata->>'type') = 'global'
);

-- 3. Clients can insert their OWN data (via Edge Functions usually, but good to have)
create policy "Clients can insert own data"
on embeddings for insert
to authenticated
with check (
  (metadata->>'client_id') = auth.uid()::text
);

-- 4. Service Role (Admin/Edge Functions) has full access
create policy "Service role has full access"
on embeddings
to service_role
using (true)
with check (true);
