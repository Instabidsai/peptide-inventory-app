import { type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '@/lib/wagmi-config';

const queryClient = new QueryClient();

interface PoolWagmiWrapperProps {
  children: ReactNode;
}

export function PoolWagmiWrapper({ children }: PoolWagmiWrapperProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
