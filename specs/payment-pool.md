# USDC Payment Pool Module — Complete Documentation

> **Status**: Code complete, NOT yet end-to-end tested with live NMI
> **Last updated**: 2026-03-06
> **Confidence**: 85% — needs WooCommerce + NMI sandbox integration test

## What This Is

A self-service USDC liquidity pool that lets peptide merchants accept credit cards without getting shut down by traditional processors (Stripe/PayPal). Each merchant deploys their own smart contract, funds it with USDC, and customers pay with normal credit cards. The customer never sees or touches crypto.

**Revenue model**: $0 from payments. This is a feature inside the $1K/month PeptideAI SaaS.

**Liability**: Zero. Software only. Merchant owns their contract, their wallet, their funds. PeptideAI never has custody.

## How It Works

```
Customer clicks "Pay $150" on WooCommerce checkout
    → Normal credit card form (NMI Collect.js iframes, PCI SAQ-A)
    → Card authorized through NMI (merchant's own account)
    → pool-sign-release edge function signs ECDSA release
    → $150 USDC released from merchant's pool contract
    → Order confirmed (~5 seconds)
    → 2-3 days later: card settles to merchant's bank
    → Merchant replenishes pool with USDC
```

## Architecture

### Database (Supabase)
- **`payment_pools`** — one row per org (UNIQUE on org_id)
  - `id`, `org_id`, `chain` (base/base_sepolia/polygon), `contract_address`, `merchant_wallet`
  - `operator_address`, `operator_private_key_encrypted` (AES-256-GCM)
  - `usdc_balance`, `max_per_tx`, `daily_limit`, `status` (setup/deployed/funded/active/paused)
  - `card_processor` (nmi/authorize_net), `processor_api_key_encrypted`, `processor_public_key`
- **`pool_transactions`** — per-transaction log
  - `id`, `org_id`, `pool_id`, `woo_order_id`, `order_hash`, `amount`, `status`, `tx_hash`
- **Migration**: `supabase/migrations/20260306000000_add_payment_pool.sql`
- **RLS fix**: `supabase/migrations/20260306100000_fix_payment_pool_rls.sql`

### Smart Contract (Solidity 0.8.24)
- **File**: `contracts/src/MerchantPool.sol`
- **Tests**: `contracts/test/MerchantPool.t.sol` (42 tests, ALL PASS)
- **Deploy script**: `contracts/script/Deploy.s.sol`
- **Features**: ECDSA-verified releases, per-tx/daily limits, replay protection, pause/unpause, owner-only withdraw
- **Chains**: Base (8453), Base Sepolia (84532), Polygon (137)
- **USDC addresses**:
  - Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  - Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
  - Polygon: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
- **Foundry**: v1.5.1-stable at `$HOME/.foundry/bin/`

### Edge Functions (4 deployed, all ACTIVE)
| Function | Purpose | Auth |
|----------|---------|------|
| `pool-sign-release` | ECDSA signs USDC release for an order | Admin role required |
| `pool-test-processor` | Validates NMI/Authorize.net credentials | Admin role required |
| `pool-sync-balance` | Reads on-chain USDC balance via ethers.js | Admin role required |
| `pool-webhook` | NMI settlement callback (machine-to-machine) | API key validation |

**Shared dependencies** (bundled with each deploy):
- `_shared/auth.ts` — `authenticateRequest()`, `AuthError`
- `_shared/cors.ts` — `getCorsHeaders()`, `handleCors()`, `jsonResponse()`
- `_shared/error-reporter.ts` — `withErrorReporting()`
- `_shared/pool-crypto.ts` — AES-256-GCM `encryptKey()` / `decryptKey()`

**Supabase secrets set**:
- `POOL_ENCRYPTION_KEY` = `6803396c1ea2c2afcd45add33cb7419c7ae41fcb35cacfc45f4c1c266a3d8128`

### Frontend Components
| File | Purpose |
|------|---------|
| `src/pages/admin/PaymentPool.tsx` | Main page — feature gate, wizard or dashboard |
| `src/components/payment-pool/PoolSetupWizard.tsx` | 5-step wizard (welcome + 4 setup steps) with FAQ |
| `src/components/payment-pool/PoolDashboard.tsx` | Active pool dashboard — stats, actions, BaseScan verify, email alerts |
| `src/components/payment-pool/PoolSettings.tsx` | Limit editing — syncs to DB AND smart contract via wagmi |
| `src/components/payment-pool/PoolBalanceCard.tsx` | Compact balance card for admin dashboard |
| `src/components/payment-pool/PoolTransactionList.tsx` | Transaction history table |
| `src/components/payment-pool/PoolCapacityCalculator.tsx` | How many orders the pool can handle |
| `src/components/payment-pool/PoolWagmiWrapper.tsx` | WagmiProvider + QueryClientProvider wrapper |

### Hooks
| File | Purpose |
|------|---------|
| `src/hooks/use-payment-pool.ts` | PaymentPool interface, `usePaymentPool()`, `useCreatePool()`, `useUpdatePool()` |
| `src/hooks/use-pool-transactions.ts` | Transaction query hook |
| `src/hooks/use-deploy-pool.ts` | wagmi hook to deploy contract from browser |
| `src/hooks/use-pool-balance.ts` | wagmi hook to read on-chain balance |

### Config
| File | Purpose |
|------|---------|
| `src/lib/wagmi-config.ts` | wagmi v3 config, 3 chains, 3 connectors, full ABI, USDC addresses, helpers |
| `src/lib/feature-registry.ts` | `payment_pool` feature flag (category: finance, roles: admin) |

### WooCommerce Plugin
| File | Purpose |
|------|---------|
| `woocommerce-plugin/peptideai-pool-gateway.php` | Plugin entry point, Collect.js enqueue |
| `woocommerce-plugin/includes/class-pool-gateway.php` | WC_Payment_Gateway — auth, sign, process |
| `woocommerce-plugin/includes/class-pool-webhook.php` | Settlement webhook handler |
| `woocommerce-plugin/assets/js/checkout.js` | Collect.js tokenization on checkout |
| `woocommerce-plugin/assets/css/checkout.css` | Card form styling |
| `woocommerce-plugin/readme.txt` | WordPress plugin readme |
| `dist/peptideai-pool-gateway.zip` | Installable .zip for WordPress upload |

### Navigation
- Sidebar: "Payment Pool" under Admin group (`roles: ['admin']`)
- Route: `/admin/payment-pool`
- Feature flag: `payment_pool` (must be enabled per org in Settings → Features)

## Per-Org Isolation

- `UNIQUE(org_id)` on `payment_pools` — one pool per org
- Every query scoped with `.eq('org_id', orgId)`
- RLS policies enforce `auth.uid()` joined to `user_roles`
- Each org deploys their OWN smart contract — separate address, separate funds
- Operator keys encrypted per-org with AES-256-GCM
- Service role policies for edge functions (separate from user RLS)

## Security Model

- **Zero custody**: PeptideAI never holds merchant funds
- **Operator key encrypted**: AES-256-GCM with `POOL_ENCRYPTION_KEY` env var
- **ECDSA signatures**: Every release requires valid operator signature matching on-chain
- **Replay protection**: `released[orderId]` mapping prevents double-spend
- **Per-tx + daily limits**: Enforced on-chain, not just in DB
- **Pausable**: Merchant can freeze pool instantly
- **Owner-only withdraw**: Only the merchant's wallet can withdraw
- **PCI SAQ-A**: NMI Collect.js renders card fields in iframes — card data never touches our servers

## What's Been Tested

| Test | Status | Details |
|------|--------|---------|
| Smart contract (Foundry) | PASS | 42 tests, all pass |
| Contract integration (Anvil) | PASS | 5/5 — sign, release, replay, limits, auth |
| Edge function deploy | PASS | All 4 deployed and ACTIVE |
| RLS policies | PASS | Frontend API returns data correctly |
| TypeScript compilation | PASS | 0 errors |
| Vite production build | PASS | Clean, 35s, PaymentPool chunk = 226KB |
| Supabase secrets | PASS | POOL_ENCRYPTION_KEY set |

## What Has NOT Been Tested

| Test | Status | What's needed |
|------|--------|---------------|
| WooCommerce plugin on real WordPress | NOT TESTED | WordPress + WooCommerce site |
| NMI Collect.js card tokenization | NOT TESTED | NMI sandbox account |
| NMI auth → pool-sign-release → USDC release E2E | NOT TESTED | NMI sandbox + funded testnet pool |
| Settlement webhook flow | NOT TESTED | NMI sandbox with settlement simulation |
| Checkout.js iframe rendering | NOT TESTED | WordPress checkout page |
| Pool encryption round-trip (encrypt on save, decrypt on sign) | NOT TESTED | Need a pool with encrypted key in DB |
| In-browser contract deployment via wagmi | NOT TESTED | Wallet with testnet ETH |
| Base Sepolia live deployment | NOT TESTED | Need testnet ETH (faucets require browser) |

## How to Resume This Work

### To test the WooCommerce plugin:
1. Set up a WordPress + WooCommerce test site (local or hosted)
2. Get NMI sandbox credentials: nmi.com → Developers → Explore Sandbox (FREE)
3. Install `dist/peptideai-pool-gateway.zip` on the WordPress site
4. Configure: WooCommerce → Settings → Payments → PeptideAI Pool Gateway
5. Test the full checkout flow with NMI test card numbers

### To test the smart contract on testnet:
1. Get Base Sepolia ETH from Coinbase faucet (requires browser)
2. Deploy: `forge script script/Deploy.s.sol:DeployMerchantPool --rpc-url base_sepolia --broadcast`
3. Fund with Base Sepolia USDC (address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`)

### To deploy edge functions:
```bash
SUPABASE_ACCESS_TOKEN="sbp_94ff4e12ec85a9a4576569e3675f2af6e11c0430"
npx supabase functions deploy pool-sign-release --project-ref mckkegmkpqdicudnfhor
npx supabase functions deploy pool-test-processor --project-ref mckkegmkpqdicudnfhor
npx supabase functions deploy pool-webhook --project-ref mckkegmkpqdicudnfhor
npx supabase functions deploy pool-sync-balance --project-ref mckkegmkpqdicudnfhor
```

### Key environment variables:
- `.env.local` has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MERCHANT_POOL_BYTECODE`
- Supabase secret: `POOL_ENCRYPTION_KEY` (already set)
- Optional: `VITE_WALLETCONNECT_PROJECT_ID` (for WalletConnect connector)

### Test org:
- ID: `33a18316-b0a4-4d85-a770-d1ceb762bd4f` (NextGen Research Labs)
- Test user: `ai_tester@instabids.ai` / `TestAI2026!`

## Recommended NMI Reseller

**SoarPay** (https://www.soarpay.com/nutraceuticals-merchant-accounts/)
- $0 setup fee, no application fee
- 5-minute application, instant quote
- Specializes in nutraceutical/supplement high-risk
- NMI integration with Collect.js support
- WooCommerce compatible

For testing only: NMI has a free sandbox — nmi.com → Developers → Explore Sandbox

## Business Context

- The pool is an OPTIONAL premium feature — NMI alone handles card processing
- The pool adds: instant settlement, on-chain transparency, funds can't be frozen by banks
- Real value: if NMI drops the merchant, their USDC pool is safe on blockchain — swap processor and keep going
- Customer sees: normal credit card form. Statement shows: `NMI*MERCHANTNAME $150.00`
- Customer KYC: none needed (normal card purchase)
- Merchant KYC: NMI application + Coinbase/Robinhood for USDC

## Files Created/Modified in This Build

### Created (new files):
- `contracts/src/MerchantPool.sol`
- `contracts/test/MerchantPool.t.sol`
- `contracts/script/Deploy.s.sol`
- `supabase/migrations/20260306000000_add_payment_pool.sql`
- `supabase/migrations/20260306100000_fix_payment_pool_rls.sql`
- `supabase/functions/pool-sign-release/index.ts`
- `supabase/functions/pool-test-processor/index.ts`
- `supabase/functions/pool-test-processor/config.toml`
- `supabase/functions/pool-sync-balance/index.ts`
- `supabase/functions/pool-webhook/index.ts`
- `supabase/functions/_shared/pool-crypto.ts`
- `src/pages/admin/PaymentPool.tsx`
- `src/components/payment-pool/PoolSetupWizard.tsx`
- `src/components/payment-pool/PoolDashboard.tsx`
- `src/components/payment-pool/PoolSettings.tsx`
- `src/components/payment-pool/PoolBalanceCard.tsx`
- `src/components/payment-pool/PoolTransactionList.tsx`
- `src/components/payment-pool/PoolCapacityCalculator.tsx`
- `src/components/payment-pool/PoolWagmiWrapper.tsx`
- `src/hooks/use-payment-pool.ts`
- `src/hooks/use-pool-transactions.ts`
- `src/hooks/use-deploy-pool.ts`
- `src/hooks/use-pool-balance.ts`
- `src/lib/wagmi-config.ts`
- `woocommerce-plugin/` (6 files)
- `dist/peptideai-pool-gateway.zip`

### Modified (existing files):
- `src/lib/feature-registry.ts` — added `payment_pool` feature
- `src/App.tsx` — added lazy import + route for PaymentPool
- `src/components/layout/Sidebar.tsx` — added "Payment Pool" nav item under Admin
- `.env.local` — added `VITE_MERCHANT_POOL_BYTECODE`
