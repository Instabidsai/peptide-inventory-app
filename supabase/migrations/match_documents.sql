
-- Create a function to similarity search for documents
-- Supports optional metadata filtering via the filter parameter
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
    and (filter = '{}'::jsonb or embeddings.metadata @> filter)
  order by embeddings.embedding <=> query_embedding
  limit match_count;
end;
$$;
