import { createConfig, http } from 'wagmi';
import { base, baseSepolia, polygon } from 'wagmi/chains';
import { coinbaseWallet, metaMask, walletConnect } from 'wagmi/connectors';

// USDC contract addresses (native Circle-issued, 6 decimals)
export const USDC_ADDRESSES = {
  [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  [polygon.id]: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
} as const;

// Chain metadata for display
export const CHAIN_META = {
  [base.id]: { name: 'Base', explorer: 'https://basescan.org', color: '#0052FF' },
  [baseSepolia.id]: { name: 'Base Sepolia', explorer: 'https://sepolia.basescan.org', color: '#0052FF' },
  [polygon.id]: { name: 'Polygon', explorer: 'https://polygonscan.com', color: '#8247E5' },
} as const;

export const SUPPORTED_CHAINS = [base, polygon, baseSepolia] as const;

export const wagmiConfig = createConfig({
  chains: [base, polygon, baseSepolia],
  connectors: [
    coinbaseWallet({ appName: 'PeptideAI Payment Pool' }),
    metaMask(),
    walletConnect({ projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '' }),
  ],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
    [baseSepolia.id]: http('https://sepolia.base.org'),
    [polygon.id]: http('https://polygon-rpc.com'),
  },
});

// MerchantPool contract ABI (only the functions we need from the frontend)
export const MERCHANT_POOL_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: '_usdc', type: 'address' },
      { name: '_owner', type: 'address' },
      { name: '_operator', type: 'address' },
      { name: '_maxPerTx', type: 'uint256' },
      { name: '_dailyLimit', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'poolBalance',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'remainingDailyLimit',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'operator',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxPerTx',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'dailyLimit',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'released',
    inputs: [{ name: 'orderId', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'pause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unpause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setLimits',
    inputs: [
      { name: '_maxPerTx', type: 'uint256' },
      { name: '_dailyLimit', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setOperator',
    inputs: [{ name: '_operator', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Released',
    inputs: [
      { name: 'orderId', type: 'bytes32', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

// ERC-20 ABI for USDC (approve + transfer + balanceOf)
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

// Helper: format USDC amount (6 decimals) to human-readable
export function formatUSDC(amount: bigint): string {
  const whole = amount / BigInt(1e6);
  const fraction = amount % BigInt(1e6);
  return `${whole}.${fraction.toString().padStart(6, '0').replace(/0+$/, '') || '0'}`;
}

// Helper: parse human-readable USD to USDC units (6 decimals)
export function parseUSDC(usd: number): bigint {
  return BigInt(Math.round(usd * 1e6));
}

// Helper: get explorer URL for address or tx
export function getExplorerUrl(chainId: number, type: 'address' | 'tx', hash: string): string {
  const meta = CHAIN_META[chainId as keyof typeof CHAIN_META];
  if (!meta) return '#';
  return `${meta.explorer}/${type}/${hash}`;
}
