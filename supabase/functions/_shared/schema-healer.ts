/**
 * Schema Healer — Autonomous DDL fix module for sentinel Phase 13
 *
 * Provides:
 *  1. SQL safety validation (blocklist + allowlist)
 *  2. Supabase Management API executor for DDL
 *  3. Schema introspection helpers
 */

const SUPABASE_PROJECT_ID = "mckkegmkpqdicudnfhor";

// ── SQL Safety ─────────────────────────────────────────────────

const SQL_BLOCKLIST: RegExp[] = [
  /\bDROP\s+(TABLE|SCHEMA|DATABASE|EXTENSION|TRIGGER|POLICY|FUNCTION|INDEX)\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+\w/i,
  /\bCREATE\s+TABLE\b/i,
  /\bALTER\s+TABLE\s+\w+\s+DROP\b/i,
  /\bALTER\s+TABLE\s+\w+\s+RENAME\b/i,
  /\bALTER\s+ROLE\b/i,
  /\bCREATE\s+ROLE\b/i,
  /\bGRANT\s+.*\s+TO\s+PUBLIC\b/i,
  /\bauth\.\w+/i,
  /\bpg_catalog\b/i,
  /\bpg_authid\b/i,
  /\bstorage\.\w+/i,
];

const SQL_ALLOWLIST: RegExp[] = [
  /\bALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN\b/i,
  /\bALTER\s+TABLE\s+\w+\s+ADD\s+CONSTRAINT\b/i,
  /\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b/i,
  /\bCREATE\s+INDEX\b/i,
  /\bGRANT\s+(SELECT|INSERT|UPDATE|EXECUTE)\b/i,
  /\bCOMMENT\s+ON\b/i,
];

/** Strip SQL comments before validation */
function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

export function validateSql(sql: string): { safe: boolean; reason?: string } {
  const clean = stripComments(sql);
  if (!clean) return { safe: false, reason: "Empty SQL" };

  // Check blocklist first — any match = reject
  for (const pattern of SQL_BLOCKLIST) {
    if (pattern.test(clean)) {
      return { safe: false, reason: `Blocked pattern: ${pattern.source}` };
    }
  }

  // Check allowlist — at least one must match
  const allowed = SQL_ALLOWLIST.some((p) => p.test(clean));
  if (!allowed) {
    return { safe: false, reason: "No allowlisted DDL pattern found" };
  }

  return { safe: true };
}

// ── Supabase Management API ────────────────────────────────────

export interface MgmtQueryResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export async function executeMgmtQuery(sql: string): Promise<MgmtQueryResult> {
  const token = Deno.env.get("SB_MGMT_TOKEN");
  if (!token) {
    return { success: false, error: "SB_MGMT_TOKEN not set" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({ query: sql }),
      },
    );
    clearTimeout(timeout);

    const body = await res.text();
    if (!res.ok) {
      return { success: false, error: `Mgmt API ${res.status}: ${body.slice(0, 500)}` };
    }

    try {
      return { success: true, result: JSON.parse(body) };
    } catch {
      return { success: true, result: body };
    }
  } catch (err) {
    clearTimeout(timeout);
    return { success: false, error: `Mgmt API fetch failed: ${(err as Error).message}` };
  }
}

// ── Schema Introspection ───────────────────────────────────────

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}

export async function getTableColumns(tableName: string): Promise<ColumnInfo[]> {
  const sql = `
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = '${tableName.replace(/'/g, "''")}'
    ORDER BY ordinal_position;
  `;
  const result = await executeMgmtQuery(sql);
  if (!result.success || !Array.isArray(result.result)) return [];
  return result.result as ColumnInfo[];
}

export async function getFunctionSource(funcName: string): Promise<string | null> {
  const sql = `
    SELECT pg_get_functiondef(p.oid) AS source
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = '${funcName.replace(/'/g, "''")}'
    LIMIT 1;
  `;
  const result = await executeMgmtQuery(sql);
  if (!result.success || !Array.isArray(result.result) || result.result.length === 0) return null;
  return (result.result[0] as { source: string }).source || null;
}

export interface ColumnMatch {
  table_name: string;
  data_type: string;
  udt_name: string;
  column_default: string | null;
}

export async function findColumnInOtherTables(columnName: string): Promise<ColumnMatch[]> {
  const sql = `
    SELECT table_name, data_type, udt_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = '${columnName.replace(/'/g, "''")}'
    ORDER BY table_name
    LIMIT 20;
  `;
  const result = await executeMgmtQuery(sql);
  if (!result.success || !Array.isArray(result.result)) return [];
  return result.result as ColumnMatch[];
}

export async function tableExists(tableName: string): Promise<boolean> {
  const sql = `
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '${tableName.replace(/'/g, "''")}'
    LIMIT 1;
  `;
  const result = await executeMgmtQuery(sql);
  return result.success && Array.isArray(result.result) && result.result.length > 0;
}
