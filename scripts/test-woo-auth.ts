import 'dotenv/config';

const baseUrl = process.env.WOO_URL;
const user = process.env.WOO_USER;
const pass = process.env.WOO_APP_PASS;

if (!baseUrl || !user || !pass) {
  console.error('Missing env vars. Need WOO_URL, WOO_USER, WOO_APP_PASS');
  process.exit(1);
}

const endpoint = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders?per_page=5`;

const auth = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');

(async () => {
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Basic ${auth}`,
      'User-Agent': 'jarvis-woo-auth-test',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`HTTP ${res.status} ${res.statusText}`);
    console.error(body.slice(0, 2000));
    process.exit(2);
  }

  const orders: any[] = await res.json();
  console.log(`OK: fetched ${orders.length} orders`);
  for (const o of orders) {
    console.log(`- #${o.number ?? o.id} status=${o.status} total=${o.total} created=${o.date_created}`);
  }
})().catch((err) => {
  console.error('Error:', err?.message ?? err);
  process.exit(3);
});
