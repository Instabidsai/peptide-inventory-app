import { useReadContract } from 'wagmi';
import { MERCHANT_POOL_ABI, ERC20_ABI, USDC_ADDRESSES, formatUSDC } from '@/lib/wagmi-config';
import { type Address } from 'viem';

interface UsePoolBalanceParams {
  contractAddress?: Address | null;
  chainId?: number;
  enabled?: boolean;
}

export function usePoolBalance({ contractAddress, chainId, enabled = true }: UsePoolBalanceParams) {
  const usdcAddress = chainId
    ? (USDC_ADDRESSES[chainId as keyof typeof USDC_ADDRESSES] as Address | undefined)
    : undefined;

  // Read pool's USDC balance via the contract's poolBalance() view
  const { data: poolBalanceRaw, refetch: refetchPoolBalance, isLoading: isLoadingPool } = useReadContract({
    address: contractAddress as Address,
    abi: MERCHANT_POOL_ABI,
    functionName: 'poolBalance',
    chainId,
    query: { enabled: enabled && !!contractAddress },
  });

  // Read remaining daily limit
  const { data: dailyLimitRaw, refetch: refetchDailyLimit, isLoading: isLoadingDaily } = useReadContract({
    address: contractAddress as Address,
    abi: MERCHANT_POOL_ABI,
    functionName: 'remainingDailyLimit',
    chainId,
    query: { enabled: enabled && !!contractAddress },
  });

  // Read USDC balance directly (for comparison/verification)
  const { data: usdcBalanceRaw, refetch: refetchUsdc } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: contractAddress ? [contractAddress] : undefined,
    chainId,
    query: { enabled: enabled && !!contractAddress && !!usdcAddress },
  });

  const poolBalance = poolBalanceRaw != null ? formatUSDC(poolBalanceRaw as bigint) : null;
  const remainingDailyLimit = dailyLimitRaw != null ? formatUSDC(dailyLimitRaw as bigint) : null;
  const usdcBalance = usdcBalanceRaw != null ? formatUSDC(usdcBalanceRaw as bigint) : null;

  const refetch = () => {
    refetchPoolBalance();
    refetchDailyLimit();
    refetchUsdc();
  };

  return {
    poolBalance,
    remainingDailyLimit,
    usdcBalance,
    poolBalanceRaw: poolBalanceRaw as bigint | undefined,
    dailyLimitRaw: dailyLimitRaw as bigint | undefined,
    isLoading: isLoadingPool || isLoadingDaily,
    refetch,
  };
}
