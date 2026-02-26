/**
 * Deploy edge functions via Supabase Management API.
 * Reads files from disk (including _shared imports) and uploads them.
 *
 * Usage:
 *   node scripts/deploy-functions.mjs                  # deploy ALL functions
 *   node scripts/deploy-functions.mjs provision-tenant  # deploy one function
 *   node scripts/deploy-functions.mjs --list            # list all functions
 *
 * Environment variables (or edit the fallbacks below):
 *   SUPABASE_PROJECT_REF  — project reference ID
 *   SUPABASE_ACCESS_TOKEN — personal access token from supabase.com/dashboard/account/tokens
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'mckkegmkpqdicudnfhor';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

// All known shared files
const SHARED_FILES = ['ai-core.ts', 'auth.ts', 'cors.ts', 'rate-limit.ts', 'validate.ts'];

// Function registry — shared files each function imports from _shared/
const FUNCTIONS = {
  'admin-ai-chat':          { verify_jwt: false, shared: ['ai-core.ts', 'rate-limit.ts', 'validate.ts'] },
  'ai-builder':             { verify_jwt: true,  shared: ['auth.ts', 'cors.ts'] },
  'analyze-food':           { verify_jwt: true,  shared: [] },
  'chat-with-ai':           { verify_jwt: false, shared: ['rate-limit.ts', 'validate.ts'] },
  'check-low-supply':       { verify_jwt: true,  shared: ['auth.ts', 'cors.ts'] },
  'check-payment-emails':   { verify_jwt: true,  shared: ['auth.ts', 'cors.ts', 'rate-limit.ts'] },
  'composio-callback':      { verify_jwt: false, shared: [] },
  'composio-connect':       { verify_jwt: true,  shared: [] },
  'create-supplier-order':  { verify_jwt: true,  shared: [] },
  'exchange-token':         { verify_jwt: false, shared: [] },
  'invite-user':            { verify_jwt: true,  shared: ['auth.ts', 'cors.ts', 'rate-limit.ts', 'validate.ts'] },
  'notify-commission':      { verify_jwt: true,  shared: ['auth.ts', 'cors.ts', 'rate-limit.ts', 'validate.ts'] },
  'partner-ai-chat':        { verify_jwt: false, shared: ['rate-limit.ts', 'validate.ts'] },
  'process-health-document':{ verify_jwt: true,  shared: [] },
  'promote-contact':        { verify_jwt: true,  shared: ['auth.ts', 'cors.ts', 'rate-limit.ts', 'validate.ts'] },
  'provision-tenant':       { verify_jwt: false, shared: [] },
  'run-automations':        { verify_jwt: true,  shared: ['auth.ts', 'cors.ts', 'rate-limit.ts'] },
  'scrape-brand':           { verify_jwt: true,  shared: ['auth.ts', 'cors.ts', 'validate.ts'] },
  'self-signup':            { verify_jwt: false, shared: [] },
  'send-email':             { verify_jwt: true,  shared: ['auth.ts', 'cors.ts', 'rate-limit.ts', 'validate.ts'] },
  'sms-webhook':            { verify_jwt: false, shared: ['ai-core.ts'] },
  'telegram-webhook':       { verify_jwt: false, shared: ['ai-core.ts'] },
  'textbelt-webhook':       { verify_jwt: false, shared: ['ai-core.ts'] },
};

function readFunctionFiles(name) {
  const config = FUNCTIONS[name];
  const entryDir = path.join(FUNCTIONS_DIR, name);
  const entrypoint = fs.readFileSync(path.join(entryDir, 'index.ts'), 'utf-8');

  const files = [{ name: 'index.ts', content: entrypoint }];

  for (const shared of config.shared) {
    const sharedPath = path.join(FUNCTIONS_DIR, '_shared', shared);
    if (fs.existsSync(sharedPath)) {
      files.push({ name: `_shared/${shared}`, content: fs.readFileSync(sharedPath, 'utf-8') });
    } else {
      console.warn(`  ⚠ Shared file missing: _shared/${shared}`);
    }
  }

  return files;
}

async function deployFunction(name) {
  const config = FUNCTIONS[name];
  if (!config) {
    console.error(`Unknown function: ${name}`);
    return false;
  }

  console.log(`\n--- Deploying ${name} ---`);

  const files = readFunctionFiles(name);
  const totalSize = files.reduce((s, f) => s + f.content.length, 0);
  console.log(`  Files: ${files.map(f => f.name).join(', ')}`);
  console.log(`  Total size: ${(totalSize / 1024).toFixed(1)} KB`);

  const baseUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`;

  // Check if function already exists
  const checkRes = await fetch(`${baseUrl}/${name}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });

  const exists = checkRes.ok;
  console.log(`  ${exists ? 'Updating existing' : 'Creating new'} function...`);

  const deployBody = {
    entrypoint_path: 'index.ts',
    verify_jwt: config.verify_jwt,
    files,
  };

  const method = exists ? 'PATCH' : 'POST';
  const url = exists ? `${baseUrl}/${name}` : baseUrl;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(exists ? deployBody : { ...deployBody, slug: name, name }),
  });

  const result = await res.text();

  if (res.ok) {
    console.log(`  ✓ ${name} deployed successfully`);
    try {
      const json = JSON.parse(result);
      if (json.version) console.log(`  Version: ${json.version}`);
    } catch { /* ignore */ }
    return true;
  } else {
    console.error(`  ✗ FAILED (${res.status}): ${result.slice(0, 500)}`);
    return false;
  }
}

async function main() {
  const arg = process.argv[2];

  if (arg === '--list') {
    console.log('Available edge functions:\n');
    for (const [name, config] of Object.entries(FUNCTIONS)) {
      const jwt = config.verify_jwt ? 'JWT' : 'public';
      const shared = config.shared.length ? config.shared.join(', ') : '(none)';
      console.log(`  ${name.padEnd(28)} ${jwt.padEnd(8)} shared: ${shared}`);
    }
    console.log(`\nTotal: ${Object.keys(FUNCTIONS).length} functions`);
    return;
  }

  if (!ACCESS_TOKEN) {
    console.error('ERROR: No access token. Set SUPABASE_ACCESS_TOKEN env var or edit the script.');
    console.error('Get one at: https://supabase.com/dashboard/account/tokens');
    process.exit(1);
  }

  const names = arg ? [arg] : Object.keys(FUNCTIONS);

  if (arg && !FUNCTIONS[arg]) {
    console.error(`Unknown function: ${arg}`);
    console.error(`Run with --list to see available functions.`);
    process.exit(1);
  }

  console.log(`Deploying ${names.length} function(s): ${names.join(', ')}\n`);
  console.log(`Project: ${PROJECT_REF}`);

  let success = 0;
  let failed = [];

  for (const name of names) {
    try {
      if (await deployFunction(name)) {
        success++;
      } else {
        failed.push(name);
      }
    } catch (err) {
      console.error(`  ✗ ${name} threw: ${err.message}`);
      failed.push(name);
    }
  }

  console.log(`\n========================================`);
  console.log(`Results: ${success}/${names.length} deployed successfully`);
  if (failed.length) {
    console.log(`Failed: ${failed.join(', ')}`);
  }
}

main().catch(console.error);
