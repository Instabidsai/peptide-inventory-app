import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CreditCard,
  Wallet,
  Code2,
  Coins,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Info,
  ShieldCheck,
  HelpCircle,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useCreatePool, useUpdatePool, type PaymentPool, type CardProcessor, type PoolChain } from '@/hooks/use-payment-pool';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { useQueryClient } from '@tanstack/react-query';
import { PoolCapacityCalculator } from './PoolCapacityCalculator';

interface PoolSetupWizardProps {
  pool: PaymentPool | null;
  onComplete: () => void;
}

type Step = 0 | 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Exclude<Step, 0>, string> = {
  1: 'Card Processor',
  2: 'Connect Wallet',
  3: 'Deploy Contract',
  4: 'Fund Pool',
};

function StepIndicator({ currentStep }: { currentStep: Step }) {
  if (currentStep === 0) return null;
  const steps: Exclude<Step, 0>[] = [1, 2, 3, 4];
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, idx) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              step < currentStep
                ? 'bg-primary text-primary-foreground'
                : step === currentStep
                ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {step < currentStep ? <CheckCircle2 className="h-4 w-4" /> : step}
          </div>
          <span className={`hidden sm:block text-xs ${step === currentStep ? 'font-medium' : 'text-muted-foreground'}`}>
            {STEP_LABELS[step]}
          </span>
          {idx < steps.length - 1 && (
            <div className={`h-px w-8 ${step < currentStep ? 'bg-primary' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── FAQ Accordion ─────────────────────────────────────────────────

function FAQItem({ question, children }: { question: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-b-0">
      <button
        className="flex w-full items-center justify-between py-3 text-left text-sm font-medium hover:text-primary transition-colors"
        onClick={() => setOpen(!open)}
      >
        {question}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-3 text-sm text-muted-foreground space-y-2">{children}</div>}
    </div>
  );
}

// ── Step 0: Welcome & Prerequisites ──────────────────────────────

function StepWelcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-6">
      {/* What is this */}
      <div className="rounded-lg border bg-muted/40 p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-500" />
          What is a Payment Pool?
        </h3>
        <p className="text-sm text-muted-foreground">
          Traditional payment processors (Stripe, PayPal, Square) drop peptide and supplement businesses for being "high-risk."
          A Payment Pool lets you accept credit cards without worrying about getting shut down.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>How it works:</strong> You pre-fund a pool with USDC (a digital dollar — always worth exactly $1).
          When a customer pays with their credit card, the money comes from your pool instantly.
          When the card payment settles a few days later, you top your pool back up. Your customers never see or touch crypto — they just pay with a normal credit card.
        </p>
      </div>

      {/* Security */}
      <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-green-600" />
          Your Money is 100% Yours
        </h3>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
          <li><strong>You own the smart contract</strong> — only you can withdraw funds</li>
          <li><strong>PeptideAI never touches your money</strong> — we provide software only</li>
          <li><strong>Nobody can steal your funds</strong> — not us, not hackers, not anyone without your wallet keys</li>
          <li><strong>You can pause or withdraw anytime</strong> — you're always in full control</li>
          <li><strong>Fully isolated per business</strong> — your pool is completely separate from every other merchant</li>
          <li><strong>Viewable on the blockchain</strong> — you can verify your balance on BaseScan anytime</li>
        </ul>
      </div>

      {/* Prerequisites checklist */}
      <div className="rounded-lg border p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Before You Start — What You'll Need
        </h3>
        <p className="text-xs text-muted-foreground mb-2">Total setup time: ~30 minutes (once you have everything below)</p>
        <div className="space-y-3">
          <div className="flex gap-3 text-sm">
            <div className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600">1</div>
            <div>
              <p className="font-medium">NMI Card Processor Account</p>
              <p className="text-muted-foreground text-xs">
                NMI is a payment gateway that accepts peptide merchants. Sign up at{' '}
                <a href="https://www.nmi.com/contact-us/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                  nmi.com <ExternalLink className="h-3 w-3" />
                </a>.
                Approval takes 3-7 business days. No sign-up fee with most resellers — you'll pay ~2.9% + $0.30 per transaction and ~$25/month gateway fee.
                Once approved, you'll get a <strong>Public Tokenization Key</strong> and a <strong>Private API Key</strong>.
              </p>
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            <div className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600">2</div>
            <div>
              <p className="font-medium">A Crypto Wallet (MetaMask or Coinbase Wallet)</p>
              <p className="text-muted-foreground text-xs">
                This is where your funds live — think of it like a digital bank account that only you control.
                Download{' '}
                <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                  MetaMask <ExternalLink className="h-3 w-3" />
                </a>{' '}
                or{' '}
                <a href="https://www.coinbase.com/wallet" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                  Coinbase Wallet <ExternalLink className="h-3 w-3" />
                </a>.
                Free to set up, takes 5 minutes. <strong>Write down your recovery phrase and keep it safe</strong> — this is the master key to your wallet.
              </p>
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            <div className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600">3</div>
            <div>
              <p className="font-medium">USDC to Fund Your Pool</p>
              <p className="text-muted-foreground text-xs">
                USDC is a stablecoin — always worth exactly $1. You need enough USDC to cover your expected daily order volume
                (e.g., if you expect $5,000/day in orders, fund with at least $5,000 USDC).
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                <strong>How to get USDC:</strong> Buy it on{' '}
                <a href="https://www.coinbase.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                  Coinbase <ExternalLink className="h-3 w-3" />
                </a>{' '}
                or{' '}
                <a href="https://robinhood.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                  Robinhood <ExternalLink className="h-3 w-3" />
                </a>.
                If you're new to crypto, identity verification takes 1-3 days and your <strong>first crypto withdrawal may have a 7-day hold</strong>.
                Plan ahead — this is the step that takes the longest if you're starting from scratch.
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                <strong>Important:</strong> Buy USDC on the <strong>Base</strong> network (recommended) for the lowest fees (~$0.01 per transaction).
                Coinbase supports Base natively.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border bg-muted/40 p-5 space-y-2">
        <h3 className="font-semibold text-sm">Expected Timeline</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>NMI account approval:</span><span className="font-medium text-foreground">3-7 days</span>
          <span>Coinbase/Robinhood setup:</span><span className="font-medium text-foreground">1-3 days (+ 7-day hold for first withdrawal)</span>
          <span>Wallet setup (MetaMask):</span><span className="font-medium text-foreground">5 minutes</span>
          <span>This setup wizard:</span><span className="font-medium text-foreground">~30 minutes</span>
        </div>
      </div>

      {/* FAQ */}
      <div className="rounded-lg border p-5 space-y-1">
        <h3 className="font-semibold flex items-center gap-2 mb-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          Frequently Asked Questions
        </h3>
        <FAQItem question="Can PeptideAI access or steal my funds?">
          <p>No. Your funds sit in a smart contract on the blockchain that <strong>only your wallet</strong> controls. PeptideAI provides the software — we never have access to your private keys or the ability to withdraw your funds. Even if PeptideAI shut down tomorrow, your money is still yours on the blockchain.</p>
        </FAQItem>
        <FAQItem question="Can someone hack my pool?">
          <p>The smart contract is protected by military-grade cryptography (ECDSA signatures). To steal funds, someone would need your wallet's private key — which only you have. Nobody can guess it. The contract also has daily limits and per-transaction limits as extra protection. You can pause the pool instantly if anything looks wrong.</p>
        </FAQItem>
        <FAQItem question="Can I see my funds outside of this app?">
          <p>Yes. Your pool funds live on the public blockchain and can be verified anytime. This dashboard is the easiest way to see your balance and manage your pool, but you can also go to <strong>BaseScan.org</strong>, paste your contract address, and see the exact USDC balance on-chain — independent proof that your money is there.</p>
          <p>Note: Your pool balance won't show up directly in MetaMask or Coinbase Wallet — those show your <em>wallet</em> balance. The pool is a separate smart contract that holds USDC on your behalf. Think of it like a business checking account vs. your personal wallet. You control both, but they're separate. You can withdraw from the pool to your wallet anytime through this dashboard.</p>
        </FAQItem>
        <FAQItem question="What is USDC and is it safe?">
          <p>USDC is a <strong>stablecoin</strong> issued by Circle (backed by Coinbase). 1 USDC always equals $1. It's backed by US Treasury bills and cash reserves, audited monthly by Deloitte. Over $30 billion USDC is in circulation. It's the safest, most widely-used digital dollar. Your customers never see USDC — they just pay with a normal credit card.</p>
        </FAQItem>
        <FAQItem question="What happens if a card payment is declined?">
          <p>Nothing changes with your pool. USDC is only released from the pool when a card authorization succeeds. If the card is declined, no USDC moves. Your pool balance stays exactly the same.</p>
        </FAQItem>
        <FAQItem question="What are the fees?">
          <p><strong>PeptideAI charges $0 for this feature</strong> — it's included in your subscription. The only costs are from NMI (the card processor): typically ~2.9% + $0.30 per transaction and ~$25/month gateway fee. Blockchain transaction fees on Base are about $0.01 per transaction.</p>
        </FAQItem>
        <FAQItem question="What if I run out of USDC in my pool?">
          <p>If your pool runs low, new card payments will be temporarily declined until you add more USDC. You'll see your balance on the dashboard and can set up alerts. We recommend keeping at least 2-3 days of order volume funded at all times. You can top up anytime by sending more USDC to your pool contract.</p>
        </FAQItem>
        <FAQItem question="Is my pool separate from other merchants?">
          <p>100% separate. Every merchant gets their own smart contract, their own wallet, their own funds. There is zero connection between your pool and any other merchant's pool. Your data, your funds, your keys — completely isolated.</p>
        </FAQItem>
        <FAQItem question="Can I withdraw my USDC anytime?">
          <p>Yes, you can withdraw some or all of your USDC at any time. You're the contract owner — nobody can stop you. You can withdraw through this dashboard or directly from your wallet. The USDC goes straight to your wallet, and from there you can convert it back to USD on Coinbase or Robinhood.</p>
        </FAQItem>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onStart} size="lg">
          I Have Everything — Let's Get Started
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 1: Card Processor ──────────────────────────────────────────

function StepCardProcessor({
  pool,
  onNext,
  onBack,
}: {
  pool: PaymentPool | null;
  onNext: (pool: PaymentPool) => void;
  onBack: () => void;
}) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const createPool = useCreatePool();
  const updatePool = useUpdatePool();

  const [processor, setProcessor] = useState<CardProcessor>(
    (pool?.card_processor as CardProcessor) ?? 'nmi',
  );
  const [publicKey, setPublicKey] = useState(pool?.processor_public_key ?? '');
  const [apiKey, setApiKey] = useState(pool?.processor_api_key_encrypted ?? '');
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    if (!publicKey || !apiKey) {
      toast({ variant: 'destructive', title: 'Missing keys', description: 'Enter both public and API keys to test.' });
      return;
    }
    setIsTesting(true);
    const { error } = await invokeEdgeFunction('pool-test-processor', {
      processor,
      public_key: publicKey,
      api_key: apiKey,
    });
    setIsTesting(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Connection failed', description: error.message });
    } else {
      toast({ title: 'Connection successful', description: 'Card processor credentials verified.' });
    }
  };

  const handleNext = async () => {
    if (!publicKey || !apiKey) {
      toast({ variant: 'destructive', title: 'Missing keys', description: 'Enter both keys before continuing.' });
      return;
    }
    const orgId = profile?.org_id;
    if (!orgId) return;

    if (pool) {
      updatePool.mutate(
        { id: pool.id, card_processor: processor, processor_public_key: publicKey, processor_api_key_encrypted: apiKey },
        { onSuccess: (updated) => onNext(updated) },
      );
    } else {
      createPool.mutate(
        { org_id: orgId, status: 'setup', card_processor: processor, processor_public_key: publicKey, processor_api_key_encrypted: apiKey },
        { onSuccess: (created) => onNext(created) },
      );
    }
  };

  const isPending = createPool.isPending || updatePool.isPending;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/40 p-4 flex gap-3 text-sm">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">Connect Your Card Processor</p>
          <p className="text-muted-foreground text-xs">
            Enter the API keys from your NMI or Authorize.net account. You can find these in your processor's dashboard
            under Settings or API Keys. If you don't have an account yet,{' '}
            <a href="https://www.nmi.com/contact-us/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
              sign up for NMI here <ExternalLink className="h-3 w-3" />
            </a>.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="processor">Card Processor</Label>
        <Select value={processor} onValueChange={(v) => setProcessor(v as CardProcessor)}>
          <SelectTrigger id="processor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nmi">NMI (Recommended)</SelectItem>
            <SelectItem value="authorize_net">Authorize.net</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="public-key">Public Tokenization Key</Label>
        <Input
          id="public-key"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          placeholder={processor === 'nmi' ? 'Collect.js tokenization key' : 'API Login ID'}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          {processor === 'nmi'
            ? 'Found in NMI → Settings → Security Keys → Tokenization Keys. Used to securely collect card data.'
            : 'Found in Authorize.net → Account → Settings → API Credentials & Keys.'}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="api-key">Private API Key</Label>
        <Input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={processor === 'nmi' ? 'Security key' : 'Transaction Key'}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          Stored encrypted on our servers. Never exposed to customers or the browser.
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={isTesting}>
          {isTesting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
          {isTesting ? 'Testing...' : 'Test Connection'}
        </Button>
      </div>
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button onClick={handleNext} disabled={isPending}>
          {isPending ? 'Saving...' : 'Continue'}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 2: Connect Wallet ──────────────────────────────────────────

function StepConnectWallet({
  pool,
  onBack,
  onNext,
}: {
  pool: PaymentPool;
  onBack: () => void;
  onNext: (pool: PaymentPool) => void;
}) {
  const { toast } = useToast();
  const updatePool = useUpdatePool();
  const [wallet, setWallet] = useState(pool.merchant_wallet ?? '');

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(wallet.trim());

  const handleNext = () => {
    if (!isValidAddress) {
      toast({ variant: 'destructive', title: 'Invalid address', description: 'Enter a valid Ethereum address (0x...).' });
      return;
    }
    updatePool.mutate(
      { id: pool.id, merchant_wallet: wallet.trim() },
      { onSuccess: (updated) => onNext(updated) },
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/40 p-4 flex gap-3 text-sm">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-2">
          <p className="font-medium">Enter Your Wallet Address</p>
          <p className="text-muted-foreground text-xs">
            This is the wallet that will own and control your payment pool. Only this wallet can withdraw funds.
          </p>
          <p className="text-muted-foreground text-xs">
            <strong>How to find your address:</strong> Open MetaMask or Coinbase Wallet, click your account name at the top
            to copy your address. It starts with "0x" and is 42 characters long.
          </p>
          <p className="text-muted-foreground text-xs">
            <strong>Your wallet is the master key</strong> to your pool. Only this wallet can withdraw funds, pause the pool, or change settings.
            You can verify your pool balance anytime on BaseScan.org — your funds live on the public blockchain, fully transparent.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wallet-address">Wallet Address</Label>
        <Input
          id="wallet-address"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="0x..."
          className={wallet && !isValidAddress ? 'border-destructive' : ''}
        />
        {wallet && !isValidAddress && (
          <p className="text-xs text-destructive">Must be a valid 0x address (42 characters).</p>
        )}
      </div>

      {!wallet && (
        <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1">
          <p className="font-medium">Don't have a wallet yet?</p>
          <p>
            Download{' '}
            <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">MetaMask</a>
            {' '}(browser extension) or{' '}
            <a href="https://www.coinbase.com/wallet" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Coinbase Wallet</a>
            {' '}(mobile app). Setup takes about 5 minutes. Make sure to save your recovery phrase somewhere safe!
          </p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button onClick={handleNext} disabled={updatePool.isPending}>
          {updatePool.isPending ? 'Saving...' : 'Continue'}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Deploy Contract ─────────────────────────────────────────

function StepDeployContract({
  pool,
  onBack,
  onNext,
}: {
  pool: PaymentPool;
  onBack: () => void;
  onNext: (pool: PaymentPool) => void;
}) {
  const { toast } = useToast();
  const updatePool = useUpdatePool();
  const [chain, setChain] = useState<PoolChain>((pool.chain as PoolChain) ?? 'base');
  const [contractAddress, setContractAddress] = useState(pool.contract_address ?? '');

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(contractAddress.trim());

  const handleNext = () => {
    if (!isValidAddress) {
      toast({ variant: 'destructive', title: 'Invalid contract address', description: 'Enter a valid deployed contract address (0x...).' });
      return;
    }
    updatePool.mutate(
      { id: pool.id, chain, contract_address: contractAddress.trim(), status: 'deployed' },
      { onSuccess: (updated) => onNext(updated) },
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/40 p-4 flex gap-3 text-sm">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">Deploy Your Payment Pool Contract</p>
          <p className="text-muted-foreground text-xs">
            This creates your pool on the blockchain. Your contract is yours — it's a secure vault that only your wallet can control.
            This step requires a small amount of ETH for the transaction fee (usually less than $1 on Base).
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="chain">Network</Label>
        <Select value={chain} onValueChange={(v) => setChain(v as PoolChain)}>
          <SelectTrigger id="chain">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="base">Base (Recommended — lowest fees)</SelectItem>
            <SelectItem value="polygon">Polygon (Alternative)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Base is built by Coinbase. Transactions cost ~$0.01 and confirm in 2 seconds.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/40 p-4 space-y-3 text-sm">
        <p className="font-medium flex items-center gap-2">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          How to Deploy (We'll Walk You Through It)
        </p>
        <p className="text-xs text-muted-foreground">
          Your PeptideAI account manager will help you deploy the contract. Contact support or follow these steps:
        </p>
        <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground text-xs">
          <li>Make sure your wallet (MetaMask/Coinbase Wallet) is connected to the <strong>{chain === 'base' ? 'Base' : 'Polygon'}</strong> network</li>
          <li>You'll need a tiny amount of ETH for the deployment fee (~$0.50 on Base)</li>
          <li>The contract will be deployed from your wallet — you'll approve the transaction in MetaMask</li>
          <li>Once deployed, paste the contract address below</li>
        </ol>
        <p className="text-xs text-muted-foreground italic">
          Need help? Contact your PeptideAI account manager and we'll walk you through it step by step.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contract-address">Deployed Contract Address</Label>
        <Input
          id="contract-address"
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
          placeholder="0x..."
          className={contractAddress && !isValidAddress ? 'border-destructive' : ''}
        />
        {contractAddress && !isValidAddress && (
          <p className="text-xs text-destructive">Must be a valid 0x address (42 characters).</p>
        )}
      </div>
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button onClick={handleNext} disabled={updatePool.isPending}>
          {updatePool.isPending ? 'Saving...' : 'Continue'}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 4: Fund Pool ───────────────────────────────────────────────

function StepFundPool({
  pool,
  onBack,
  onComplete,
}: {
  pool: PaymentPool;
  onBack: () => void;
  onComplete: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updatePool = useUpdatePool();
  const [isSyncing, setIsSyncing] = useState(false);

  const currentBalance = pool.usdc_balance ?? 0;

  const handleCheckBalance = async () => {
    setIsSyncing(true);
    const { data, error } = await invokeEdgeFunction('pool-sync-balance', { pool_id: pool.id });
    setIsSyncing(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Balance check failed', description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['payment-pool', pool.org_id] });
    toast({ title: 'Balance refreshed' });
  };

  const handleActivate = () => {
    updatePool.mutate(
      { id: pool.id, status: 'active' },
      { onSuccess: () => { toast({ title: 'Pool activated!', description: 'Your payment pool is now live and accepting card payments.' }); onComplete(); } },
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <Coins className="h-4 w-4 text-muted-foreground" />
          Fund Your Pool with USDC
        </p>
        <p className="text-xs text-muted-foreground">
          Send USDC on the <strong>{pool.chain === 'polygon' ? 'Polygon' : 'Base'}</strong> network to your pool contract address below.
          Open your wallet (MetaMask or Coinbase Wallet), go to Send, paste this address, and enter the amount.
        </p>
        <div className="flex items-center gap-2 rounded border bg-background px-3 py-2">
          <code className="text-xs font-mono flex-1 break-all">{pool.contract_address}</code>
          {pool.contract_address && pool.chain && (
            <a
              href={pool.chain === 'polygon'
                ? `https://polygonscan.com/address/${pool.contract_address}`
                : `https://basescan.org/address/${pool.contract_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700"
              title="View on block explorer"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {/* How to get USDC */}
      <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
        <p className="text-sm font-medium">Don't have USDC yet?</p>
        <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
          <li>
            Create an account on{' '}
            <a href="https://www.coinbase.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Coinbase</a>
            {' '}or{' '}
            <a href="https://robinhood.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Robinhood</a>
            {' '}(if you don't have one)
          </li>
          <li>Complete identity verification (1-3 days for new accounts)</li>
          <li>Buy USDC with your bank account or debit card</li>
          <li>
            Withdraw USDC to your wallet address — make sure to select the <strong>{pool.chain === 'polygon' ? 'Polygon' : 'Base'}</strong> network
          </li>
          <li>Then send from your wallet to the pool contract address above</li>
        </ol>
        <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mt-1">
          Note: First-time crypto withdrawals on Coinbase have a 7-day hold. Plan ahead!
        </p>
      </div>

      <PoolCapacityCalculator pool={pool} />

      <div className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Current Pool Balance</p>
            <p className="text-2xl font-bold tabular-nums">
              ${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleCheckBalance} disabled={isSyncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Checking...' : 'Check Balance'}
          </Button>
        </div>
        {currentBalance <= 0 && (
          <p className="text-xs text-muted-foreground">Send USDC to the contract address above, then click "Check Balance" to verify it arrived.</p>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button
          onClick={handleActivate}
          disabled={currentBalance <= 0 || updatePool.isPending}
          size="lg"
        >
          {updatePool.isPending ? 'Activating...' : 'Activate Pool — Go Live!'}
          <CheckCircle2 className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ── Main Wizard ─────────────────────────────────────────────────────

export function PoolSetupWizard({ pool, onComplete }: PoolSetupWizardProps) {
  const getInitialStep = (): Step => {
    if (!pool) return 0; // Show welcome screen first
    if (!pool.card_processor) return 1;
    if (!pool.merchant_wallet) return 2;
    if (!pool.contract_address) return 3;
    if (pool.status === 'deployed' || pool.status === 'funded') return 4;
    return 0;
  };

  const [step, setStep] = useState<Step>(getInitialStep);
  const [currentPool, setCurrentPool] = useState<PaymentPool | null>(pool);

  const STEP_ICONS: Record<Step, React.ElementType> = {
    0: Info,
    1: CreditCard,
    2: Wallet,
    3: Code2,
    4: Coins,
  };

  const StepIcon = STEP_ICONS[step];

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="space-y-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <StepIcon className="h-5 w-5 text-muted-foreground" />
            {step === 0 ? 'USDC Payment Pool' : 'Set Up USDC Payment Pool'}
          </CardTitle>
          <CardDescription className="mt-1">
            {step === 0
              ? 'Accept credit card payments without getting shut down by traditional processors.'
              : 'Follow the steps below to get your payment pool running.'}
          </CardDescription>
        </div>
        <StepIndicator currentStep={step} />
      </CardHeader>
      <CardContent>
        {step === 0 && (
          <StepWelcome onStart={() => setStep(1)} />
        )}
        {step === 1 && (
          <StepCardProcessor
            pool={currentPool}
            onBack={() => setStep(0)}
            onNext={(p) => { setCurrentPool(p); setStep(2); }}
          />
        )}
        {step === 2 && currentPool && (
          <StepConnectWallet
            pool={currentPool}
            onBack={() => setStep(1)}
            onNext={(p) => { setCurrentPool(p); setStep(3); }}
          />
        )}
        {step === 3 && currentPool && (
          <StepDeployContract
            pool={currentPool}
            onBack={() => setStep(2)}
            onNext={(p) => { setCurrentPool(p); setStep(4); }}
          />
        )}
        {step === 4 && currentPool && (
          <StepFundPool
            pool={currentPool}
            onBack={() => setStep(3)}
            onComplete={onComplete}
          />
        )}
      </CardContent>
    </Card>
  );
}
