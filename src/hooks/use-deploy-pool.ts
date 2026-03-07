import { useDeployContract, useWaitForTransactionReceipt } from 'wagmi';
import { MERCHANT_POOL_ABI, USDC_ADDRESSES, parseUSDC } from '@/lib/wagmi-config';
import { type Address } from 'viem';

// MerchantPool bytecode placeholder — replace with actual compiled bytecode
// To get this: run `forge build` then extract bytecode from out/MerchantPool.sol/MerchantPool.json
const MERCHANT_POOL_BYTECODE = import.meta.env.VITE_MERCHANT_POOL_BYTECODE as `0x${string}` | undefined;

interface DeployPoolParams {
  chainId: number;
  ownerAddress: Address;
  operatorAddress: Address;
  maxPerTx?: number;  // USD
  dailyLimit?: number; // USD
}

export function useDeployPool() {
  const { deployContract, data: hash, isPending, error } = useDeployContract();

  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const deploy = (params: DeployPoolParams) => {
    const usdcAddress = USDC_ADDRESSES[params.chainId as keyof typeof USDC_ADDRESSES];
    if (!usdcAddress) {
      throw new Error(`No USDC address for chain ${params.chainId}`);
    }
    if (!MERCHANT_POOL_BYTECODE) {
      throw new Error('Contract bytecode not configured. Set VITE_MERCHANT_POOL_BYTECODE in .env');
    }

    deployContract({
      abi: MERCHANT_POOL_ABI,
      bytecode: MERCHANT_POOL_BYTECODE,
      args: [
        usdcAddress as Address,
        params.ownerAddress,
        params.operatorAddress,
        parseUSDC(params.maxPerTx ?? 5000),
        parseUSDC(params.dailyLimit ?? 25000),
      ],
    });
  };

  return {
    deploy,
    hash,
    receipt,
    contractAddress: receipt?.contractAddress as Address | undefined,
    isPending,
    isConfirming,
    error,
  };
}
