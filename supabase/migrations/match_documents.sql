
-- Create a function to similarity search for documents
create or replace function match_documents (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter jsonb default '{}'
) returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    embeddings.id,
    embeddings.content,
    embeddings.metadata,
    1 - (embeddings.embedding <=> query_embedding) as similarity
  from embeddings
  where 1 - (embeddings.embedding <=> query_embedding) > match_threshold
  -- Optional: Add metadata filtering logic here if needed, e.g.
  -- and (metadata @> filter)
  order by embeddings.embedding <=> query_embedding
  limit match_count;
end;
$$;
