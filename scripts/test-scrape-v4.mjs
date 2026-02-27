#!/usr/bin/env node
const SUPABASE_URL = 'https://mckkegmkpqdicudnfhor.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU';

async function run() {
  // Step 1: Auth
  const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email: 'jarvis@affixed.ai', password: 'TestJarvis2026!' })
  });
  const data = await res.json();
  if (!data.access_token) { console.error('Auth failed:', JSON.stringify(data)); process.exit(1); }
  console.log('JWT obtained');

  // Step 2: Call scrape-brand
  const url = process.argv[2] || 'https://pureuspeptide.com';
  console.log('\nScraping:', url);
  const t0 = Date.now();
  const scrapeRes = await fetch(SUPABASE_URL + '/functions/v1/scrape-brand', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + data.access_token,
    },
    body: JSON.stringify({ url, persist: true })
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const result = await scrapeRes.json();

  if (result.error) {
    console.error('Scrape error:', result.error);
    return;
  }

  console.log(`\n=== SCRAPE RESULTS (${elapsed}s) ===`);
  console.log('Brand:', result.brand?.company_name);
  console.log('Platform:', result.platform);
  console.log('Peptides found:', result.peptides?.length);
  console.log('CrawlJobId:', result.crawlJobId || 'NONE');
  console.log('Metadata:', JSON.stringify(result.metadata, null, 2));
  console.log('\nProducts:');
  for (const p of (result.peptides || [])) {
    console.log(`  [${p.source || '?'}] ${p.name} - $${p.price || '?'} (conf: ${p.confidence})`);
  }

  // Step 3: If batch job started, poll status
  if (result.crawlJobId) {
    console.log('\n=== POLLING BATCH STATUS ===');
    let attempts = 0;
    const maxAttempts = 30;
    let batchReady = false;

    // Phase 1: Poll until batch is ready (quick status checks)
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`\nCheck ${attempts}/${maxAttempts}...`);

      const statusRes = await fetch(SUPABASE_URL + '/functions/v1/scrape-brand-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + data.access_token,
        },
        body: JSON.stringify({ jobId: result.crawlJobId, action: 'check' })
      });

      if (!statusRes.ok) {
        const errText = await statusRes.text();
        console.error(`  HTTP ${statusRes.status}: ${errText.slice(0, 200)}`);
        if (statusRes.status === 500) {
          console.log('  Retrying in 5s...');
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        break;
      }

      const statusResult = await statusRes.json();

      if (statusResult.status === 'batch_ready') {
        console.log(`  Batch READY! ${statusResult.total} pages scraped`);
        batchReady = true;
        break;
      } else if (statusResult.status === 'scraping') {
        console.log(`  Scraping: ${statusResult.progress?.completed}/${statusResult.progress?.total}`);
        await new Promise(r => setTimeout(r, 10000));
      } else if (statusResult.status === 'failed') {
        console.error('  Batch FAILED:', statusResult.error);
        break;
      } else {
        console.log('  Status:', JSON.stringify(statusResult));
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    // Phase 2: Process the batch data (one long call)
    if (batchReady) {
      console.log('\n=== PROCESSING BATCH DATA ===');
      console.log('This may take 30-90 seconds...');
      const pt0 = Date.now();

      const processRes = await fetch(SUPABASE_URL + '/functions/v1/scrape-brand-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + data.access_token,
        },
        body: JSON.stringify({ jobId: result.crawlJobId, action: 'process' })
      });

      const pElapsed = ((Date.now() - pt0) / 1000).toFixed(1);

      if (!processRes.ok) {
        const errText = await processRes.text();
        console.error(`  Process failed HTTP ${processRes.status}: ${errText.slice(0, 500)}`);
      } else {
        const processResult = await processRes.json();
        console.log(`\n=== BATCH PROCESSED (${pElapsed}s) ===`);
        console.log('Status:', processResult.status);
        console.log('New from batch:', processResult.newCount);
        console.log('Already existing:', processResult.existingCount);
        console.log('Total pages scraped:', processResult.totalPagesScraped);
        if (processResult.newPeptides?.length > 0) {
          console.log('\nNew products from batch:');
          for (const p of processResult.newPeptides) {
            console.log(`  ${p.name} - $${p.price || '?'} (conf: ${p.confidence})`);
          }
        }
      }
    }
  }

  // Step 4: Check final DB count
  console.log('\n=== FINAL DB CHECK ===');
  const countRes = await fetch(
    SUPABASE_URL + '/rest/v1/scraped_peptides?select=name,price,source_url&org_id=eq.e857fbcc-35d3-4c9f-89c6-88e3823ebcfb&order=name',
    { headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + data.access_token } }
  );
  const allProducts = await countRes.json();
  console.log('Total products in DB:', allProducts.length);
  for (const p of allProducts) {
    console.log(`  ${p.name} - $${p.price || '?'}`);
  }
}

run().catch(console.error);
