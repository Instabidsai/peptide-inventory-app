#!/usr/bin/env node
/**
 * Sentry Source Map Setup
 *
 * Creates SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT env vars in Vercel
 * so production builds upload source maps for readable stack traces.
 *
 * Prerequisites (env vars):
 *   VERCEL_TOKEN       - Vercel API token (https://vercel.com/account/tokens)
 *   SUPABASE_ACCESS_TOKEN - Supabase Management API token (https://supabase.com/dashboard/account/tokens)
 *
 * Usage:
 *   VERCEL_TOKEN=vcp_... SUPABASE_ACCESS_TOKEN=sbp_... node scripts/setup-sentry.mjs <AUTH_TOKEN> <ORG_SLUG> <PROJECT_SLUG>
 *
 * Where to find the Sentry values:
 *   AUTH Token:    https://sentry.io/settings/auth-tokens/ → Create New Token (org:read, project:releases, project:write)
 *   Org Slug:      https://sentry.io/settings/ → Organization Slug (shown in URL)
 *   Project Slug:  https://sentry.io/settings/projects/ → click project → slug in URL
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_ID = "prj_uEFXdyCJEqvOee3tavekDAPneG1E";
const TEAM_ID = "team_hXFPmWH2P3BcbEhlD0EJqgGl";
const SUPABASE_PROJECT_REF = "mckkegmkpqdicudnfhor";

const [authToken, orgSlug, projectSlug] = process.argv.slice(2);

if (!authToken || !orgSlug || !projectSlug) {
  console.error("\nUsage: node scripts/setup-sentry.mjs <AUTH_TOKEN> <ORG_SLUG> <PROJECT_SLUG>\n");
  console.error("Required env vars: VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN\n");
  console.error("Where to find Sentry values:");
  console.error("  AUTH_TOKEN:   https://sentry.io/settings/auth-tokens/ → Create New Token");
  console.error("                Scopes needed: org:read, project:releases, project:write");
  console.error("  ORG_SLUG:     Look at your Sentry URL: sentry.io/organizations/<THIS>/");
  console.error("  PROJECT_SLUG: sentry.io/settings/projects/ → click project → slug in URL\n");
  process.exit(1);
}

if (!VERCEL_TOKEN) {
  console.error("ERROR: VERCEL_TOKEN env var is required.\n  Get one at: https://vercel.com/account/tokens");
  process.exit(1);
}
if (!SUPABASE_ACCESS_TOKEN) {
  console.error("ERROR: SUPABASE_ACCESS_TOKEN env var is required.\n  Get one at: https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}

async function setVercelEnv(key, value) {
  // Check if already exists
  const listRes = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
  );
  const { envs } = await listRes.json();
  const existing = envs?.find(e => e.key === key);

  if (existing) {
    // Update existing
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${existing.id}?teamId=${TEAM_ID}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value, target: ["production", "preview"], type: "sensitive" }),
      }
    );
    if (!res.ok) throw new Error(`Failed to update ${key}: ${res.status} ${await res.text()}`);
    console.log(`  ✓ Updated ${key}`);
  } else {
    // Create new
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, target: ["production", "preview"], type: "sensitive" }),
      }
    );
    if (!res.ok) throw new Error(`Failed to create ${key}: ${res.status} ${await res.text()}`);
    console.log(`  ✓ Created ${key}`);
  }
}

// Also set in Supabase secrets for health-probe
async function setSupabaseSecret(key, value) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ name: key, value }]),
  });
  if (!res.ok) throw new Error(`Failed to set Supabase secret ${key}: ${res.status}`);
  console.log(`  ✓ Set Supabase secret ${key}`);
}

console.log("\nSetting Sentry env vars in Vercel...");
await setVercelEnv("SENTRY_AUTH_TOKEN", authToken);
await setVercelEnv("SENTRY_ORG", orgSlug);
await setVercelEnv("SENTRY_PROJECT", projectSlug);

console.log("\nSetting Sentry secrets in Supabase (for health-probe)...");
await setSupabaseSecret("SENTRY_AUTH_TOKEN", authToken);
await setSupabaseSecret("SENTRY_ORG", orgSlug);
await setSupabaseSecret("SENTRY_PROJECT", projectSlug);

console.log("\n✅ Done! Next Vercel deploy will upload source maps to Sentry.");
console.log("   Health-probe will also check Sentry for unresolved issue spikes.\n");
