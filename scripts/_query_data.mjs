const url = 'https://mckkegmkpqdicudnfhor.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4';
const h = { 'apikey': key, 'Authorization': 'Bearer ' + key };
const get = (path) => fetch(url + '/rest/v1/' + path, { headers: h }).then(r => r.json());

async function run() {
  // 1. Get all protocols with their items + peptide names
  const protocols = await get('protocols?select=id,name,description,contact_id&order=created_at.desc');
  const items = await get('protocol_items?select=id,protocol_id,peptide_id,dosage_amount,dosage_unit,frequency,duration_weeks,duration_days,cost_multiplier,price_tier');
  const peptides = await get('peptides?select=id,name,sku,description,retail_price,base_cost,default_dose_amount,default_dose_unit,default_frequency,default_timing,default_concentration_mg_ml,reconstitution_notes,catalog_source');
  
  const pepMap = {};
  peptides.forEach(p => pepMap[p.id] = p);
  
  // Show each protocol with its peptides
  console.log('=== PROTOCOLS WITH PEPTIDE STACKS ===\n');
  for (const proto of protocols) {
    const pItems = items.filter(i => i.protocol_id === proto.id);
    if (pItems.length === 0) continue;
    console.log(`\n--- ${proto.name} (${pItems.length} peptides) ---`);
    for (const item of pItems) {
      const pep = pepMap[item.peptide_id];
      const name = pep ? pep.name : 'Unknown';
      console.log(`  ${name.padEnd(30)} ${item.dosage_amount || '?'}${item.dosage_unit || ''} | freq: ${item.frequency || 'N/A'} | ${item.duration_weeks ? item.duration_weeks + 'wk' : item.duration_days ? item.duration_days + 'd' : 'ongoing'}`);
    }
  }
  
  // 2. Show scraped bundles
  const scraped = await get('scraped_peptides?select=name,price,description,source_url&name=ilike.*bundle*');
  console.log('\n\n=== SCRAPED BUNDLES ===\n');
  scraped.forEach(s => console.log(`${s.name} — $${s.price}\n  ${s.description?.substring(0, 120) || ''}\n`));
  
  // 3. Show peptide catalog with dosing defaults
  console.log('\n=== PEPTIDE CATALOG (with default dosing) ===\n');
  const unique = {};
  peptides.forEach(p => {
    if (!unique[p.name]) unique[p.name] = p;
  });
  Object.values(unique).sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
    const dose = p.default_dose_amount ? `${p.default_dose_amount}${p.default_dose_unit || ''}` : 'no default';
    const freq = p.default_frequency || '';
    const timing = p.default_timing || '';
    const conc = p.default_concentration_mg_ml ? `${p.default_concentration_mg_ml}mg/ml` : '';
    const recon = p.reconstitution_notes ? p.reconstitution_notes.substring(0, 80) : '';
    console.log(`${p.name.padEnd(28)} $${String(p.retail_price || '?').padEnd(8)} dose: ${dose.padEnd(12)} freq: ${freq.padEnd(15)} timing: ${timing}`);
    if (conc || recon) console.log(`${''.padEnd(28)} conc: ${conc}  recon: ${recon}`);
  });
  
  // 4. Co-occurrence matrix - which peptides appear in protocols together most often
  console.log('\n\n=== PEPTIDE CO-OCCURRENCE (which peptides are stacked together) ===\n');
  const coOccur = {};
  for (const proto of protocols) {
    const pItems = items.filter(i => i.protocol_id === proto.id);
    const names = pItems.map(i => pepMap[i.peptide_id]?.name).filter(Boolean);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const pair = [names[i], names[j]].sort().join(' + ');
        coOccur[pair] = (coOccur[pair] || 0) + 1;
      }
    }
  }
  const sorted = Object.entries(coOccur).sort((a, b) => b[1] - a[1]);
  console.log('Most commonly stacked together:');
  sorted.slice(0, 30).forEach(([pair, count]) => console.log(`  ${count}x  ${pair}`));
}

run().catch(e => console.error(e));
