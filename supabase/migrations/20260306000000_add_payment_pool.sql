-- Payment Pool Module: Self-service USDC liquidity pool for credit card processing
-- Merchants fund their own pool, platform never touches funds.

-- Pool configuration (one per org)
CREATE TABLE IF NOT EXISTS payment_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chain text NOT NULL CHECK (chain IN ('base', 'base_sepolia', 'polygon')),
  contract_address text,
  merchant_wallet text NOT NULL,
  operator_address text,
  operator_private_key_encrypted text,
  usdc_balance numeric DEFAULT 0,
  max_per_tx numeric DEFAULT 5000,
  daily_limit numeric DEFAULT 25000,
  status text DEFAULT 'setup' CHECK (status IN ('setup', 'deployed', 'funded', 'active', 'paused')),
  card_processor text CHECK (card_processor IN ('nmi', 'authorize_net')),
  processor_api_key_encrypted text,
  processor_public_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id)
);

COMMENT ON TABLE payment_pools IS 'Self-service USDC payment pool config. One per org. Merchant owns all funds.';
COMMENT ON COLUMN payment_pools.operator_private_key_encrypted IS 'Platform operator ECDSA private key for signing releases. Encrypted at rest.';
COMMENT ON COLUMN payment_pools.processor_public_key IS 'NMI tokenization key or Authorize.net client key. Safe to expose to frontend.';

-- Pool transaction ledger
CREATE TABLE IF NOT EXISTS pool_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pool_id uuid NOT NULL REFERENCES payment_pools(id) ON DELETE CASCADE,
  woo_order_id text NOT NULL,
  order_hash text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  tx_hash text,
  card_auth_code text,
  card_last_four text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'released', 'failed', 'settled', 'chargeback')),
  error_message text,
  released_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE pool_transactions IS 'Every USDC release from a merchant pool. Immutable ledger.';

-- RLS
ALTER TABLE payment_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_pools_org_isolation" ON payment_pools
  USING (org_id = (current_setting('app.agent_org_id', true))::uuid);

CREATE POLICY "pool_transactions_org_isolation" ON pool_transactions
  USING (org_id = (current_setting('app.agent_org_id', true))::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pool_transactions_org ON pool_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_pool_transactions_pool ON pool_transactions(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_transactions_order_hash ON pool_transactions(order_hash);
CREATE INDEX IF NOT EXISTS idx_pool_transactions_status ON pool_transactions(status);

-- Auto-update updated_at on payment_pools
CREATE OR REPLACE FUNCTION update_payment_pools_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_pools_updated_at
  BEFORE UPDATE ON payment_pools
  FOR EACH ROW EXECUTE FUNCTION update_payment_pools_updated_at();
