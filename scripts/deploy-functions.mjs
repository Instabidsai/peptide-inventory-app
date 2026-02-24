/**
 * Deploy edge functions via Supabase Management API.
 * Reads files from disk and uploads them.
 *
 * Usage: node scripts/deploy-functions.mjs [function-name]
 * If no function name given, deploys all 4.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'mckkegmkpqdicudnfhor';
const ACCESS_TOKEN = 'sbp_94ff4e12ec85a9a4576569e3675f2af6e11c0430';
const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');

const FUNCTIONS = {
  'admin-ai-chat': { verify_jwt: false, sharedFiles: ['ai-core.ts', 'rate-limit.ts', 'validate.ts'] },
  'telegram-webhook': { verify_jwt: false, sharedFiles: ['ai-core.ts'] },
  'textbelt-webhook': { verify_jwt: false, sharedFiles: ['ai-core.ts'] },
  'sms-webhook': { verify_jwt: false, sharedFiles: ['ai-core.ts'] },
};

async function deployFunction(name) {
  const config = FUNCTIONS[name];
  if (!config) {
    console.error(`Unknown function: ${name}`);
    return false;
  }

  console.log(`\nDeploying ${name}...`);

  // Read entrypoint
  const entrypoint = fs.readFileSync(path.join(FUNCTIONS_DIR, name, 'index.ts'), 'utf-8');

  // Read shared files
  const files = [{ name: 'index.ts', content: entrypoint }];
  for (const shared of config.sharedFiles) {
    const content = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', shared), 'utf-8');
    files.push({ name: `_shared/${shared}`, content });
  }

  console.log(`  Files: ${files.map(f => f.name).join(', ')}`);
  console.log(`  Total size: ${files.reduce((s, f) => s + f.content.length, 0)} chars`);

  const body = {
    slug: name,
    name: name,
    verify_jwt: config.verify_jwt,
    entrypoint_path: 'index.ts',
    import_map: false,
  };

  // First, create or update the function metadata
  // Then deploy the code using the file upload endpoint

  // The Management API for edge functions:
  // POST /v1/projects/{ref}/functions — create function
  // PATCH /v1/projects/{ref}/functions/{slug} — update function
  // The MCP tool uses a different internal endpoint. Let me use the same approach.

  // Actually, the proper way is to use the deploy endpoint
  const baseUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`;

  // Check if function exists
  const checkRes = await fetch(`${baseUrl}/${name}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });

  const exists = checkRes.ok;
  console.log(`  Function ${exists ? 'exists, updating' : 'not found, creating'}...`);

  // Build form data with the files
  // The Supabase deploy API expects multipart or a specific format
  // Let's try the approach that the MCP server uses internally

  // Based on the Supabase Management API docs, we need to use the
  // edge-functions deploy endpoint which accepts files
  const deployBody = {
    entrypoint_path: 'index.ts',
    verify_jwt: config.verify_jwt,
    files: files,
  };

  const method = exists ? 'PATCH' : 'POST';
  const url = exists ? `${baseUrl}/${name}` : baseUrl;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(exists ? deployBody : { ...deployBody, slug: name, name: name }),
  });

  const result = await res.text();

  if (res.ok) {
    console.log(`  SUCCESS: ${name} deployed!`);
    try { console.log(`  Response: ${JSON.parse(result).version || 'ok'}`); } catch { console.log(`  Response: ${result.slice(0, 200)}`); }
    return true;
  } else {
    console.error(`  FAILED (${res.status}): ${result.slice(0, 500)}`);
    return false;
  }
}

async function main() {
  const target = process.argv[2];
  const names = target ? [target] : Object.keys(FUNCTIONS).filter(n => n !== 'admin-ai-chat');

  console.log(`Deploying functions: ${names.join(', ')}`);

  let success = 0;
  for (const name of names) {
    if (await deployFunction(name)) success++;
  }

  console.log(`\nDone: ${success}/${names.length} deployed successfully.`);
}

main().catch(console.error);
