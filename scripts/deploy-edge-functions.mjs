#!/usr/bin/env node
/**
 * Deploy edge functions to Supabase using the Management API.
 * Reads files from disk and deploys them — avoids MCP tool output token limits.
 *
 * Usage: node scripts/deploy-edge-functions.mjs [function-name]
 *   If no function name given, deploys all 4 updated functions.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FUNCS_DIR = join(__dirname, '..', 'supabase', 'functions');

const PROJECT_REF = 'mckkegmkpqdicudnfhor';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('Error: SUPABASE_ACCESS_TOKEN environment variable is required');
  process.exit(1);
}
const API_BASE = 'https://api.supabase.com/v1';

// Read a file and return its content
function readFunc(funcName, fileName) {
  return readFileSync(join(FUNCS_DIR, funcName, fileName), 'utf-8');
}

function readShared(fileName) {
  return readFileSync(join(FUNCS_DIR, '_shared', fileName), 'utf-8');
}

// Rewrite imports: ../_shared/ -> ./_shared/
function rewriteImports(content) {
  return content.replace(/from\s+['"]\.\.\/\_shared\//g, 'from "./_shared/');
}

// Functions to deploy with their shared deps
const FUNCTIONS = {
  'admin-ai-chat': {
    sharedFiles: ['rate-limit.ts', 'validate.ts', 'error-reporter.ts', 'ai-core.ts', 'composio-tools.ts'],
  },
  'sms-webhook': {
    sharedFiles: ['error-reporter.ts', 'ai-core.ts', 'composio-tools.ts'],
  },
  'telegram-webhook': {
    sharedFiles: ['error-reporter.ts', 'ai-core.ts', 'composio-tools.ts'],
  },
  'textbelt-webhook': {
    sharedFiles: ['error-reporter.ts', 'ai-core.ts', 'composio-tools.ts'],
  },
};

async function deployFunction(name) {
  const config = FUNCTIONS[name];
  if (!config) {
    console.error(`Unknown function: ${name}`);
    return false;
  }

  console.log(`\n🚀 Deploying ${name}...`);

  // Build the files array
  const indexContent = rewriteImports(readFunc(name, 'index.ts'));

  const files = [
    { name: 'index.ts', content: indexContent },
  ];

  for (const sf of config.sharedFiles) {
    files.push({
      name: `_shared/${sf}`,
      content: readShared(sf),
    });
  }

  console.log(`  Files: ${files.map(f => f.name).join(', ')}`);
  console.log(`  Total size: ${files.reduce((sum, f) => sum + f.content.length, 0)} chars`);

  // Build the ESZip-compatible payload
  // The Supabase Management API expects multipart/form-data with the function files
  // But the newer API also supports JSON with inline files

  // Try the Edge Functions deploy API
  const url = `${API_BASE}/projects/${PROJECT_REF}/functions/${name}`;

  // First check if function exists
  const checkResp = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
    },
  });

  const method = checkResp.ok ? 'PATCH' : 'POST';
  const endpoint = checkResp.ok ? url : `${API_BASE}/projects/${PROJECT_REF}/functions`;

  // Build form data with the function source
  // Supabase expects an eszip bundle or we can use the import_map approach
  // Let's try the simpler approach: create a single file with all imports inlined

  // Actually, the Management API v1 expects FormData with:
  // - slug (for POST)
  // - name
  // - verify_jwt
  // - import_map (bool)
  // - entrypoint_path
  // - And the body as an eszip bundle or raw TypeScript

  // The MCP tool must be doing something special internally.
  // Let's try a different approach: use the Deno Deploy-style bundling

  // For now, let's try the simplest possible approach
  const body = {
    slug: name,
    name: name,
    verify_jwt: false,
    entrypoint_path: 'index.ts',
    import_map: false,
  };

  // First, try to get function info
  console.log(`  Method: ${method} (function ${checkResp.ok ? 'exists' : 'new'})`);

  // The Supabase API for functions actually needs the source bundled.
  // The MCP server handles this internally. Let's look at how it does it.
  //
  // Simplified: We can use the "body" as the file content for a single-file function.
  // For multi-file, we need eszip.
  //
  // Alternative approach: use the Supabase CLI which handles bundling.
  // Since we can't use the CLI directly, let's create a temporary single-file bundle.

  // Create a single bundled file by inlining all imports
  let bundledContent = '';

  // Add all shared files first (in dependency order)
  const sharedOrder = ['rate-limit.ts', 'validate.ts', 'composio-tools.ts', 'error-reporter.ts', 'ai-core.ts'];
  const includedShared = new Set();

  for (const sf of sharedOrder) {
    if (config.sharedFiles.includes(sf)) {
      bundledContent += `\n// ========== _shared/${sf} ==========\n`;
      let content = readShared(sf);
      // Remove import statements that reference other shared files
      content = content.replace(/^import\s+.*from\s+['"]\.\/(rate-limit|validate|composio-tools|error-reporter|ai-core)\.ts['"];?\s*$/gm, '// [bundled import removed]');
      bundledContent += content + '\n';
      includedShared.add(sf);
    }
  }

  // Hmm, this bundling approach is fragile because of circular deps and re-exports.
  // Let me try the Management API directly with file arrays instead.

  // Actually, let's try the newer Management API v1 endpoint that accepts file arrays
  // POST /v1/projects/{ref}/functions with multipart

  // The Management API documentation shows:
  // POST /v1/projects/{ref}/functions
  // with form-data: metadata (JSON) + file (the source or eszip)

  // Create a simple "bundle" by just concatenating everything
  // This won't work for real — we need the MCP tool or CLI

  console.log('  ⚠ Direct API deploy requires eszip bundling.');
  console.log('  Attempting via MCP-compatible deploy...');

  // Write the deploy payload to a temp file for the MCP tool to use
  const payload = {
    project_id: PROJECT_REF,
    name: name,
    entrypoint_path: 'index.ts',
    verify_jwt: false,
    import_map: false,
    files: files,
  };

  const payloadPath = join(__dirname, `deploy-payload-${name}.json`);
  const { writeFileSync } = await import('fs');
  writeFileSync(payloadPath, JSON.stringify(payload));
  console.log(`  ✅ Payload written to ${payloadPath}`);
  console.log(`  Size: ${(JSON.stringify(payload).length / 1024).toFixed(1)} KB`);

  return true;
}

// Main
const targetFunc = process.argv[2];
const funcs = targetFunc ? [targetFunc] : Object.keys(FUNCTIONS);

console.log(`Deploying ${funcs.length} function(s): ${funcs.join(', ')}`);
console.log(`Project: ${PROJECT_REF}`);

for (const name of funcs) {
  await deployFunction(name);
}

console.log('\n📋 Deploy payloads written. Use MCP tool with these payloads.');
