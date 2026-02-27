#!/usr/bin/env node
const SUPABASE_URL = 'https://mckkegmkpqdicudnfhor.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU';

async function run() {
  // Test customer login
  console.log('Testing customer login...');
  const authRes = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email: 'purechainaminos@gmail.com', password: 'PureChain2026!' })
  });
  const authData = await authRes.json();

  if (!authData.access_token) {
    console.error('LOGIN FAILED:', JSON.stringify(authData));
    process.exit(1);
  }
  console.log('LOGIN SUCCESS');
  console.log('  Email:', authData.user.email);
  console.log('  User ID:', authData.user.id);

  const headers = { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + authData.access_token };

  // Check what profile they see
  const profileRes = await fetch(
    SUPABASE_URL + '/rest/v1/profiles?user_id=eq.' + authData.user.id + '&select=*',
    { headers }
  );
  const profiles = await profileRes.json();
  console.log('\nProfile org_id:', profiles[0]?.org_id);
  console.log('Profile name:', profiles[0]?.full_name);
  console.log('Profile role:', profiles[0]?.role);

  // Check what user_role they see
  const roleRes = await fetch(
    SUPABASE_URL + '/rest/v1/user_roles?user_id=eq.' + authData.user.id + '&select=*',
    { headers }
  );
  const roles = await roleRes.json();
  console.log('\nUser role:', roles[0]?.role);
  console.log('Role org_id:', roles[0]?.org_id);

  // Check what tenant_config they see
  const orgId = profiles[0]?.org_id || roles[0]?.org_id;
  if (orgId) {
    const configRes = await fetch(
      SUPABASE_URL + '/rest/v1/tenant_config?org_id=eq.' + orgId + '&select=brand_name,primary_color,logo_url,website_url',
      { headers }
    );
    const configs = await configRes.json();
    console.log('\nTenant config:');
    console.log('  Brand:', configs[0]?.brand_name);
    console.log('  Color:', configs[0]?.primary_color);
    console.log('  Logo:', configs[0]?.logo_url ? 'SET' : 'MISSING');
    console.log('  Website:', configs[0]?.website_url);

    // Check peptides they can see
    const pepRes = await fetch(
      SUPABASE_URL + '/rest/v1/peptides?org_id=eq.' + orgId + '&select=name&order=name',
      { headers }
    );
    const peps = await pepRes.json();
    console.log('\nProducts visible:', peps.length);
    if (peps.length > 0) {
      for (const p of peps.slice(0, 5)) {
        console.log('  ', p.name);
      }
      if (peps.length > 5) console.log('  ... and', peps.length - 5, 'more');
    }
  }

  console.log('\n=== CUSTOMER LOGIN TEST PASSED ===');
  console.log('\nCustomer can log in at:');
  console.log('  URL: https://app.thepeptideai.com');
  console.log('  Email: purechainaminos@gmail.com');
  console.log('  Password: PureChain2026!');
}

run().catch(err => { console.error('FATAL:', err); process.exit(1); });
