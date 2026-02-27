#!/usr/bin/env node
const SUPABASE_URL = 'https://mckkegmkpqdicudnfhor.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU';
const ORG_ID = 'e857fbcc-35d3-4c9f-89c6-88e3823ebcfb';

async function run() {
  const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email: 'jarvis@affixed.ai', password: 'TestJarvis2026!' })
  });
  const data = await res.json();
  if (!data.access_token) { console.error('Auth failed:', JSON.stringify(data)); process.exit(1); }
  console.log('Authed');

  // Delete all scraped_peptides for this org
  const delRes = await fetch(
    SUPABASE_URL + '/rest/v1/scraped_peptides?org_id=eq.' + ORG_ID,
    {
      method: 'DELETE',
      headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + data.access_token }
    }
  );
  console.log('Delete status:', delRes.status);

  // Count remaining
  const countRes = await fetch(
    SUPABASE_URL + '/rest/v1/scraped_peptides?select=name&org_id=eq.' + ORG_ID,
    { headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + data.access_token } }
  );
  const remaining = await countRes.json();
  console.log('Remaining rows:', Array.isArray(remaining) ? remaining.length : remaining);
}
run().catch(console.error);
