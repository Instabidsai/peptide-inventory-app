import 'dotenv/config';

const baseUrl = process.env.WOO_URL;
const user = process.env.WOO_USER;
const pass = process.env.WOO_APP_PASS;

if (!baseUrl || !user || !pass) {
  console.error('Missing env vars. Need WOO_URL, WOO_USER, WOO_APP_PASS');
  process.exit(1);
}

const endpoint = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/products?per_page=5&orderby=date&order=desc`;
const auth = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');

(async () => {
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Basic ${auth}`,
      'User-Agent': 'jarvis-woo-products-test',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`HTTP ${res.status} ${res.statusText}`);
    console.error(body.slice(0, 2000));
    process.exit(2);
  }

  const products: any[] = await res.json();
  console.log(`OK: fetched ${products.length} products`);
  for (const p of products) {
    const price = p.price ?? p.regular_price ?? '';
    const reg = p.regular_price ?? '';
    const sale = p.sale_price ?? '';
    console.log(`- #${p.id} ${p.name}`);
    console.log(`  status=${p.status} type=${p.type} sku=${p.sku ?? ''}`);
    console.log(`  price=${price} regular=${reg} sale=${sale}`);
    console.log(`  stock_status=${p.stock_status} stock_quantity=${p.stock_quantity ?? ''}`);
    console.log(`  permalink=${p.permalink}`);
  }
})().catch((err) => {
  console.error('Error:', err?.message ?? err);
  process.exit(3);
});
