-- ═══════════════════════════════════════════════════════════════
-- Harden run_readonly_query: prevent SQL injection & cross-tenant data leaks
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION run_readonly_query(query_text TEXT, p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    safe_query TEXT;
    result JSONB;
    normalized TEXT;
BEGIN
    -- Normalize for checking (lowercase, collapse whitespace)
    normalized := lower(regexp_replace(trim(query_text), '\s+', ' ', 'g'));

    -- 1. Only allow SELECT queries
    IF NOT (normalized LIKE 'select%') THEN
        RAISE EXCEPTION 'Only SELECT queries are allowed';
    END IF;

    -- 2. Block semicolons — prevent multi-statement injection
    IF query_text LIKE '%;%' THEN
        RAISE EXCEPTION 'Multi-statement queries are not allowed';
    END IF;

    -- 3. Must reference $org_id — enforce tenant isolation
    IF NOT (query_text LIKE '%$org_id%') THEN
        RAISE EXCEPTION 'Query must filter by $org_id for tenant isolation';
    END IF;

    -- 4. Block dangerous DDL/DML keywords
    IF normalized ~* '\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|execute|copy|pg_read_file|pg_write_file|lo_import|lo_export)\b' THEN
        RAISE EXCEPTION 'Query contains forbidden keywords';
    END IF;

    -- 5. Block access to sensitive tables/schemas
    IF normalized ~* '\b(auth\.|tenant_api_keys|platform_config|pg_catalog|information_schema|pg_shadow|pg_authid)\b' THEN
        RAISE EXCEPTION 'Access to restricted tables is not allowed';
    END IF;

    -- 6. Block subquery-based data exfiltration patterns
    IF normalized ~* '\b(into\s+outfile|into\s+dumpfile|load_file|dblink|pg_sleep)\b' THEN
        RAISE EXCEPTION 'Query contains restricted operations';
    END IF;

    -- Replace $org_id placeholder with the actual org_id (safely quoted)
    safe_query := REPLACE(query_text, '$org_id', quote_literal(p_org_id::TEXT));

    -- Execute with row limit and return as JSON array
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (SELECT * FROM (%s) _inner LIMIT 1000) t',
        safe_query
    ) INTO result;

    RETURN result;
END;
$$;

-- Ensure only authenticated users can call this
GRANT EXECUTE ON FUNCTION run_readonly_query(TEXT, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION run_readonly_query(TEXT, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION run_readonly_query(TEXT, UUID) FROM public;
