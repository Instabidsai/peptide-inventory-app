import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";
import { ethers } from "https://esm.sh/ethers@6.13.1";

const RPC_URLS: Record<string, string> = {
  base: "https://mainnet.base.org",
  base_sepolia: "https://sepolia.base.org",
  polygon: "https://polygon-rpc.com",
};

const POOL_ABI = [
  "function poolBalance() view returns (uint256)",
  "function remainingDailyLimit() view returns (uint256)",
];

Deno.serve(withErrorReporting("pool-sync-balance", async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const { orgId, supabase } = await authenticateRequest(req, { requireRole: ["admin"] });

    const { data: pool, error: poolErr } = await supabase
      .from("payment_pools")
      .select("id, contract_address, chain")
      .eq("org_id", orgId)
      .single();

    if (poolErr || !pool) {
      return jsonResponse({ error: "No payment pool configured" }, 404, corsHeaders);
    }
    if (!pool.contract_address) {
      return jsonResponse({ error: "Pool contract not yet deployed" }, 400, corsHeaders);
    }

    const rpcUrl = RPC_URLS[pool.chain];
    if (!rpcUrl) {
      return jsonResponse({ error: `Unknown chain: ${pool.chain}` }, 400, corsHeaders);
    }

    let balance: bigint;
    let remainingDaily: bigint;

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(pool.contract_address, POOL_ABI, provider);
      [balance, remainingDaily] = await Promise.all([
        contract.poolBalance(),
        contract.remainingDailyLimit(),
      ]);
    } catch (rpcErr) {
      console.error("[pool-sync-balance] RPC error:", rpcErr);
      return jsonResponse({ error: "Failed to read on-chain balance" }, 502, corsHeaders);
    }

    const balanceUsd = Number(balance) / 1_000_000;
    const remainingDailyUsd = Number(remainingDaily) / 1_000_000;

    // Update cached balance in DB (non-fatal)
    try {
      await supabase
        .from("payment_pools")
        .update({ usdc_balance: balanceUsd })
        .eq("id", pool.id)
        .eq("org_id", orgId);
    } catch (dbErr) {
      console.error("[pool-sync-balance] DB update failed:", dbErr);
    }

    return jsonResponse({
      balance: balanceUsd,
      remaining_daily_limit: remainingDailyUsd,
      contract_address: pool.contract_address,
      chain: pool.chain,
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }
    console.error("[pool-sync-balance]", err);
    return jsonResponse({ error: (err as Error).message }, 500, corsHeaders);
  }
}));
