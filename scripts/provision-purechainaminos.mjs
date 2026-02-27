#!/usr/bin/env node
/**
 * Provision Pure Chain Aminos tenant
 * 1. Auth as super_admin
 * 2. Call provision-tenant edge function
 * 3. Insert 28 products directly into peptides table
 * 4. Update tenant_config with branding
 */

const SUPABASE_URL = 'https://mckkegmkpqdicudnfhor.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU';

// Customer info
const CUSTOMER = {
  org_name: 'Pure Chain Aminos',
  admin_email: 'purechainaminos@gmail.com',
  admin_name: 'Justin',
  admin_password: 'PureChain2026!',
  brand_name: 'Pure Chain Aminos',
  support_email: 'support@purechainaminos.com',
  app_url: 'https://purechainaminos.com',
  logo_url: 'https://purechainaminos.com/wp-content/uploads/2026/01/logo-removebg-preview-1.png',
  primary_color: '#0277C7',
  plan_name: 'Professional',
};

// 28 products from purechainaminos.com (WooCommerce Store API data)
const PRODUCTS = [
  { name: 'Thymosin Alpha 1 10mg', sku: 'TA1-10MG', retail_price: 124.99, description: 'A 28-amino acid peptide that modulates the immune system by enhancing T-cell function and reducing inflammation.' },
  { name: 'Thymalin 10mg', sku: 'THYM-10MG', retail_price: 49.99, description: 'A polypeptide complex derived from calf thymus for immunomodulation and tissue regeneration.' },
  { name: 'Tesamorelin 10mg', sku: 'TESA-10MG', retail_price: 89.99, description: 'A synthetic hormone mimicking growth hormone-releasing hormone that reduces abdominal fat.' },
  { name: 'TB 500 10mg', sku: 'TB500-10MG', retail_price: 89.99, description: 'A synthetic peptide mimicking Thymosin Beta-4 that promotes tissue repair and wound healing.' },
  { name: 'SLU-PP-332 10mg', sku: 'SLUPP-10MG', retail_price: 139.99, description: 'An estrogen-related receptor agonist that mimics aerobic exercise effects, boosting metabolism.' },
  { name: 'Semax 10mg', sku: 'SEMAX-10MG', retail_price: 64.99, description: 'A neurotrophic peptide derived from ACTH that enhances memory and learning by stimulating BDNF.' },
  { name: 'Selank 10mg', sku: 'SELANK-10MG', retail_price: 64.99, description: 'A nootropic and anxiolytic peptide that reduces anxiety and enhances cognition.' },
  { name: 'SS-31 50mg', sku: 'SS31-50MG', retail_price: 174.99, description: 'A tetrapeptide improving mitochondrial function by reducing reactive oxygen species and increasing ATP.' },
  { name: 'Sermorelin 10mg', sku: 'SERM-10MG', retail_price: 89.99, description: 'A GHRH analog that stimulates natural hGH production for improved body composition and recovery.' },
  { name: 'PEG MGF 2mg', sku: 'PEGMGF-2MG', retail_price: 54.99, description: 'PEGylated Mechano Growth Factor for enhanced muscle repair and growth.' },
  { name: 'KLOW 80mg', sku: 'KLOW-80MG', retail_price: 139.99, description: 'Research peptide blend (80mg).' },
  { name: 'Ipamorelin 5mg', sku: 'IPA-5MG', retail_price: 49.99, description: 'A selective growth hormone secretagogue that stimulates GH release without affecting cortisol.' },
  { name: 'IGF1-LR3 1mg', sku: 'IGF1LR3-1MG', retail_price: 109.99, description: 'A modified form of Insulin-like Growth Factor 1 with extended half-life for muscle growth research.' },
  { name: 'GLP3-R 10mg', sku: 'GLP3R-10MG', retail_price: 149.99, description: 'GLP-3 receptor research peptide (10mg).' },
  { name: 'Lipo C B12 10ml', sku: 'LIPOCB12-10ML', retail_price: 79.99, description: 'Lipotropic compound with B12 for fat metabolism support.' },
  { name: 'Lipo C 10ml', sku: 'LIPOC-10ML', retail_price: 79.99, description: 'Lipotropic compound for fat metabolism support.' },
  { name: 'Oxytocin 10mg', sku: 'OXY-10MG', retail_price: 79.99, description: 'The "bonding hormone" peptide for research into social behavior and stress response.' },
  { name: 'PT 141 10mg', sku: 'PT141-10MG', retail_price: 79.99, description: 'Bremelanotide — a melanocortin receptor agonist studied for sexual dysfunction.' },
  { name: 'Pinealon 20mg', sku: 'PIN-20MG', retail_price: 74.99, description: 'A tripeptide that crosses the blood-brain barrier for neuroprotective research.' },
  { name: 'Kisspeptin 10mg', sku: 'KISS-10MG', retail_price: 59.99, description: 'A neuropeptide involved in the regulation of reproductive hormones (GnRH).' },
  { name: 'HCG 10000iu', sku: 'HCG-10000IU', retail_price: 104.99, description: 'Human Chorionic Gonadotropin for hormonal regulation research.' },
  { name: 'NAD+ 500mg', sku: 'NAD-500MG', retail_price: 99.99, description: 'Nicotinamide Adenine Dinucleotide for cellular energy and anti-aging research.' },
  { name: 'MT 2 10mg', sku: 'MT2-10MG', retail_price: 74.99, description: 'Melanotan II — a synthetic melanocortin peptide for tanning and appetite research.' },
  { name: 'GLOW 70mg', sku: 'GLOW-70MG', retail_price: 124.99, description: 'Cosmetic peptide blend (70mg) for skin research.' },
  { name: 'GHK-CU 100mg', sku: 'GHKCU-100MG', retail_price: 79.99, description: 'Copper peptide that promotes collagen synthesis, wound healing, and anti-aging.' },
  { name: 'Epithalon 10mg', sku: 'EPITH-10MG', retail_price: 44.99, description: 'A tetrapeptide that activates telomerase for anti-aging and longevity research.' },
  { name: 'SNAP-8 10mg', sku: 'SNAP8-10MG', retail_price: 49.99, description: 'Acetyl Octapeptide-3 — a cosmetic peptide that reduces expression lines.' },
  { name: 'CJC 1295 no Dac with Ipamorelin 10mg', sku: 'CJC-IPA-10MG', retail_price: 69.99, description: 'A blend of CJC-1295 (no DAC) and Ipamorelin for synergistic growth hormone release.' },
];

async function run() {
  console.log('=== PROVISIONING PURE CHAIN AMINOS ===\n');

  // Step 1: Auth as super_admin
  console.log('Step 1: Authenticating as super_admin...');
  const authRes = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email: 'jarvis@affixed.ai', password: 'TestJarvis2026!' })
  });
  const authData = await authRes.json();
  if (!authData.access_token) {
    console.error('Auth failed:', JSON.stringify(authData));
    process.exit(1);
  }
  console.log('  Authenticated as super_admin\n');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authData.access_token,
    'apikey': ANON_KEY,
  };

  // Step 2: Call provision-tenant
  console.log('Step 2: Calling provision-tenant...');
  const provRes = await fetch(SUPABASE_URL + '/functions/v1/provision-tenant', {
    method: 'POST',
    headers,
    body: JSON.stringify(CUSTOMER),
  });

  if (!provRes.ok) {
    const errText = await provRes.text();
    console.error(`  Provision failed (${provRes.status}): ${errText}`);
    process.exit(1);
  }

  const provResult = await provRes.json();
  if (!provResult.success) {
    console.error('  Provision error:', provResult.error);
    process.exit(1);
  }

  const orgId = provResult.org_id;
  console.log('  Org created:', orgId);
  console.log('  Admin user:', provResult.admin_user_id);
  console.log('  Config:', provResult.config_created);
  console.log('  Pricing tiers:', provResult.pricing_tiers_created);
  console.log('  Feature flags:', provResult.feature_flags_created);
  console.log('  Subscription:', provResult.subscription_created);
  console.log('  Welcome email:', provResult.welcome_email_sent);
  console.log();

  // Step 3: Insert products into peptides table
  console.log('Step 3: Inserting 28 products into peptides table...');
  const peptideRows = PRODUCTS.map(p => ({
    org_id: orgId,
    name: p.name,
    sku: p.sku,
    retail_price: p.retail_price,
    description: p.description,
    active: true,
    catalog_source: 'website',
  }));

  const insertRes = await fetch(
    SUPABASE_URL + '/rest/v1/peptides',
    {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(peptideRows),
    }
  );

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error(`  Product insert failed (${insertRes.status}): ${errText.slice(0, 500)}`);
    // Don't exit — org is already created, try to continue
  } else {
    const inserted = await insertRes.json();
    console.log(`  Inserted ${inserted.length} products`);
  }
  console.log();

  // Step 4: Update tenant_config with website URL
  console.log('Step 4: Updating tenant config with website...');
  const configRes = await fetch(
    SUPABASE_URL + `/rest/v1/tenant_config?org_id=eq.${orgId}`,
    {
      method: 'PATCH',
      headers: {
        ...headers,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        website_url: 'https://purechainaminos.com',
      }),
    }
  );

  if (!configRes.ok) {
    const errText = await configRes.text();
    console.error(`  Config update warning (${configRes.status}): ${errText.slice(0, 300)}`);
  } else {
    console.log('  Updated tenant_config with website_url');
  }
  console.log();

  // Step 5: Verify by querying back
  console.log('Step 5: Verification...');

  // Check org
  const orgCheck = await fetch(
    SUPABASE_URL + `/rest/v1/organizations?id=eq.${orgId}&select=id,name`,
    { headers }
  );
  const orgs = await orgCheck.json();
  console.log('  Org:', orgs[0]?.name || 'NOT FOUND');

  // Check config
  const configCheck = await fetch(
    SUPABASE_URL + `/rest/v1/tenant_config?org_id=eq.${orgId}&select=brand_name,primary_color,logo_url,website_url`,
    { headers }
  );
  const configs = await configCheck.json();
  console.log('  Brand:', configs[0]?.brand_name || 'NOT FOUND');
  console.log('  Color:', configs[0]?.primary_color || 'NOT FOUND');
  console.log('  Logo:', configs[0]?.logo_url ? 'SET' : 'NOT SET');
  console.log('  Website:', configs[0]?.website_url || 'NOT SET');

  // Check products
  const pepCheck = await fetch(
    SUPABASE_URL + `/rest/v1/peptides?org_id=eq.${orgId}&select=name,retail_price&order=name`,
    { headers }
  );
  const peps = await pepCheck.json();
  console.log(`  Products: ${peps.length}`);
  for (const p of peps) {
    console.log(`    ${p.name} — $${p.retail_price}`);
  }

  // Check user role
  const roleCheck = await fetch(
    SUPABASE_URL + `/rest/v1/user_roles?org_id=eq.${orgId}&select=role,user_id`,
    { headers }
  );
  const roles = await roleCheck.json();
  console.log(`  Admin roles: ${roles.length}`);

  console.log('\n=== PROVISIONING COMPLETE ===');
  console.log(`\nCustomer login:`);
  console.log(`  URL: https://app.thepeptideai.com`);
  console.log(`  Email: ${CUSTOMER.admin_email}`);
  console.log(`  Password: ${CUSTOMER.admin_password}`);
  console.log(`  Org ID: ${orgId}`);
  console.log(`\nYou (super_admin) can view at:`);
  console.log(`  https://app.thepeptideai.com/#/vendor/tenants`);
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
