#!/usr/bin/env node
const SUPABASE_URL = 'https://mckkegmkpqdicudnfhor.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU';

async function run() {
  const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email: 'jarvis@affixed.ai', password: 'TestJarvis2026!' })
  });
  const data = await res.json();
  if (!data.access_token) { console.error('Auth failed:', JSON.stringify(data)); process.exit(1); }
  console.log('JWT obtained');

  console.log('\nStarting scrape of pureuspeptide.com...');
  const t0 = Date.now();
  const scrapeRes = await fetch(SUPABASE_URL + '/functions/v1/scrape-brand', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + data.access_token,
    },
    body: JSON.stringify({ url: 'https://pureuspeptide.com', persist: true })
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const result = await scrapeRes.json();

  if (result.error) {
    console.error('Scrape error:', result.error);
    return;
  }

  console.log('\n=== RESULTS (' + elapsed + 's) ===');
  console.log('Brand:', result.brand?.company_name);
  console.log('Peptides found:', result.peptides?.length);
  console.log('Metadata:', JSON.stringify(result.metadata, null, 2));
  console.log('\nProducts:');
  for (const p of (result.peptides || [])) {
    console.log('  ' + p.name + ' - $' + (p.price || '?') + ' (conf: ' + p.confidence + ')');
  }
}
run().catch(console.error);
