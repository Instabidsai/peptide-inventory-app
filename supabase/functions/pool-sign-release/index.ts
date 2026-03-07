import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";
import { decryptKey } from "../_shared/pool-crypto.ts";
import { ethers } from "https://esm.sh/ethers@6.13.1";

const CHAIN_IDS: Record<string, number> = {
  base: 8453,
  base_sepolia: 84532,
  polygon: 137,
};

Deno.serve(withErrorReporting("pool-sign-release", async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const { orgId, supabase } = await authenticateRequest(req, { requireRole: ["admin"] });

    const { order_id, amount, recipient } = await req.json();
    if (!order_id || !amount || !recipient) {
      return jsonResponse({ error: "Missing order_id, amount, or recipient" }, 400, corsHeaders);
    }

    const { data: pool, error: poolErr } = await supabase
      .from("payment_pools")
      .select("*")
      .eq("org_id", orgId)
      .single();

    if (poolErr || !pool) {
      return jsonResponse({ error: "No payment pool configured" }, 404, corsHeaders);
    }
    if (pool.status !== "active") {
      return jsonResponse({ error: `Pool is ${pool.status}, not active` }, 400, corsHeaders);
    }
    if (amount > pool.max_per_tx) {
      return jsonResponse({ error: `Amount $${amount} exceeds per-tx limit of $${pool.max_per_tx}` }, 400, corsHeaders);
    }

    const chainId = CHAIN_IDS[pool.chain];
    if (!chainId) {
      return jsonResponse({ error: `Unknown chain: ${pool.chain}` }, 400, corsHeaders);
    }

    // Convert order_id string to bytes32
    const orderId = ethers.keccak256(ethers.toUtf8Bytes(order_id));

    // Convert USD amount to USDC 6-decimal units
    const amountUsdc = BigInt(Math.round(amount * 1e6));

    // Build message hash matching the Solidity contract
    const msgHash = ethers.solidityPackedKeccak256(
      ["bytes32", "address", "uint256", "address", "uint256"],
      [orderId, recipient, amountUsdc, pool.contract_address, chainId]
    );

    // Decrypt the operator private key and sign
    const operatorKey = await decryptKey(pool.operator_private_key_encrypted);
    const wallet = new ethers.Wallet(operatorKey);
    const signature = await wallet.signMessage(ethers.getBytes(msgHash));

    // Record the transaction (non-fatal if DB insert fails)
    try {
      await supabase.from("pool_transactions").insert({
        org_id: orgId,
        pool_id: pool.id,
        woo_order_id: order_id,
        order_hash: orderId,
        amount,
        status: "pending",
      });
    } catch (dbErr) {
      console.error("[pool-sign-release] Failed to insert transaction:", dbErr);
    }

    return jsonResponse({
      signature,
      order_hash: orderId,
      amount_usdc: amountUsdc.toString(),
      contract_address: pool.contract_address,
      chain_id: chainId,
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }
    console.error("[pool-sign-release]", err);
    return jsonResponse({ error: (err as Error).message }, 500, corsHeaders);
  }
}));
