import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePageTitle } from '@/hooks/use-page-title';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Loader2,
    User,
    Building2,
    Users,
    Copy,
    Check,
    CreditCard,
    Calendar,
    Palette,
    Save,
    Truck,
    Globe,
    Wand2,
    Settings2,
    Bell,
    Plus,
    Trash2,
    Phone,
    Eye,
    EyeOff,
    Wallet,
    ShoppingBag,
} from 'lucide-react';
import { invalidateTenantConfigCache } from '@/hooks/use-tenant-config';
import { QueryError } from '@/components/ui/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
});

const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
});

type ProfileFormData = z.infer<typeof profileSchema>;
type OrganizationFormData = z.infer<typeof organizationSchema>;

// ─── Branding Tab ───
function BrandingTab({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [brand, setBrand] = useState({
    brand_name: '',
    admin_brand_name: '',
    support_email: '',
    logo_url: '',
    primary_color: '#7c3aed',
    secondary_color: '',
    font_family: '',
    app_url: '',
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['tenant-config-settings', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_config')
        .select('brand_name, admin_brand_name, support_email, logo_url, primary_color, secondary_color, font_family, app_url')
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  useEffect(() => {
    if (config) setBrand(prev => ({ ...prev, ...config }));
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tenant_config')
        .update(brand)
        .eq('org_id', orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['tenant-config-settings'] });
      invalidateTenantConfigCache();
      toast({ title: 'Branding updated' });
    } catch (err) {
      toast({ title: 'Failed to save', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    try {
      const resp = await invokeEdgeFunction<{ brand?: any; error?: string }>('scrape-brand', { url: scrapeUrl, persist: true });
      if (resp.error) throw new Error(resp.error.message);
      const result = resp.data;
      if (result?.brand) {
        const b = result.brand;
        setBrand(prev => ({
          ...prev,
          brand_name: b.company_name || prev.brand_name,
          logo_url: b.logo_url || prev.logo_url,
          primary_color: b.primary_color || prev.primary_color,
          secondary_color: b.secondary_color || prev.secondary_color,
          font_family: b.font_family || prev.font_family,
        }));
        queryClient.invalidateQueries({ queryKey: ['tenant-config-settings'] });
        invalidateTenantConfigCache();
        toast({
          title: 'Brand imported',
          description: `Found ${result.peptides?.length || 0} peptides. Branding fields updated — review and save.`,
        });
      }
    } catch (err) {
      toast({ title: 'Scrape failed', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setScraping(false);
    }
  };

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-5 w-5" /> Import from Website
          </CardTitle>
          <CardDescription>
            Paste your existing website URL to auto-fill branding and detect your peptide catalog
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={scrapeUrl}
              onChange={e => setScrapeUrl(e.target.value)}
              placeholder="https://yourpeptideco.com"
              className="flex-1"
            />
            <Button onClick={handleScrape} disabled={scraping || !scrapeUrl.trim()}>
              {scraping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {scraping ? 'Scanning...' : 'Import'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            We'll extract your brand name, colors, logo, and product catalog using AI.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Customize how your portal looks to clients and staff</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Client-Facing Brand Name</Label>
            <Input value={brand.brand_name} onChange={e => setBrand(b => ({ ...b, brand_name: e.target.value }))} placeholder="My Peptide Co" />
          </div>
          <div className="space-y-2">
            <Label>Admin Brand Name</Label>
            <Input value={brand.admin_brand_name} onChange={e => setBrand(b => ({ ...b, admin_brand_name: e.target.value }))} placeholder="My Peptide Admin" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Support Email</Label>
            <Input type="email" value={brand.support_email} onChange={e => setBrand(b => ({ ...b, support_email: e.target.value }))} placeholder="support@example.com" />
          </div>
          <div className="space-y-2">
            <Label>App URL</Label>
            <Input value={brand.app_url} onChange={e => setBrand(b => ({ ...b, app_url: e.target.value }))} placeholder="https://app.example.com" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Logo URL</Label>
            <Input value={brand.logo_url} onChange={e => setBrand(b => ({ ...b, logo_url: e.target.value }))} placeholder="https://example.com/logo.png" />
            {brand.logo_url && <img src={brand.logo_url} alt="Logo preview" className="h-10 mt-1 rounded" loading="lazy" />}
          </div>
          <div className="space-y-2">
            <Label>Primary Color</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={brand.primary_color} onChange={e => setBrand(b => ({ ...b, primary_color: e.target.value }))} className="h-11 w-14 rounded-lg border border-input bg-card/50 cursor-pointer shadow-inset" />
              <Input value={brand.primary_color} onChange={e => setBrand(b => ({ ...b, primary_color: e.target.value }))} className="flex-1" />
              <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: brand.primary_color }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Secondary Color</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={brand.secondary_color || '#3b82f6'} onChange={e => setBrand(b => ({ ...b, secondary_color: e.target.value }))} className="h-11 w-14 rounded-lg border border-input bg-card/50 cursor-pointer shadow-inset" />
              <Input value={brand.secondary_color} onChange={e => setBrand(b => ({ ...b, secondary_color: e.target.value }))} className="flex-1" placeholder="Auto-derived if empty" />
              {brand.secondary_color && <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: brand.secondary_color }} />}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Font Family</Label>
            <select value={brand.font_family} onChange={e => setBrand(b => ({ ...b, font_family: e.target.value }))} className="flex h-10 w-full rounded-md border border-input bg-card/50 px-3 py-2 text-sm ring-offset-background">
              <option value="">System Default (Inter)</option>
              <option value="Inter">Inter</option>
              <option value="Montserrat">Montserrat</option>
              <option value="DM Sans">DM Sans</option>
              <option value="Poppins">Poppins</option>
              <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
              <option value="Outfit">Outfit</option>
            </select>
          </div>
        </div>
        {/* Live brand preview */}
        {(brand.primary_color && brand.primary_color !== '#7c3aed') && (
          <div className="rounded-xl overflow-hidden border border-border/40">
            <div className="h-2" style={{ background: `linear-gradient(90deg, ${brand.primary_color}, ${brand.secondary_color || brand.primary_color})` }} />
            <div className="px-4 py-3 flex items-center gap-3 bg-card/50">
              {brand.logo_url && <img src={brand.logo_url} alt="" className="h-6 w-6 rounded object-contain" />}
              <span className="text-sm font-semibold" style={{ color: brand.primary_color, fontFamily: brand.font_family || undefined }}>{brand.brand_name || 'Brand Preview'}</span>
              <span className="ml-auto text-xs text-muted-foreground">Live preview</span>
            </div>
          </div>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Branding
        </Button>
      </CardContent>
    </Card>
    </div>
  );
}


// ─── Shipping Config Section ───
function ShippingConfigSection({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [ship, setShip] = useState({
    ship_from_name: '',
    ship_from_street: '',
    ship_from_city: '',
    ship_from_state: '',
    ship_from_zip: '',
    ship_from_phone: '',
    ship_from_email: '',
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['tenant-config-shipping', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_config')
        .select('ship_from_name, ship_from_street, ship_from_city, ship_from_state, ship_from_zip, ship_from_phone, ship_from_email')
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  useEffect(() => {
    if (config) setShip(prev => ({ ...prev, ...config }));
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tenant_config')
        .update({ ...ship, ship_from_country: 'US' })
        .eq('org_id', orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['tenant-config-shipping'] });
      invalidateTenantConfigCache();
      toast({ title: 'Ship-from address saved' });
    } catch (err) {
      toast({ title: 'Failed to save', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const isFilled = ship.ship_from_name && ship.ship_from_street && ship.ship_from_city && ship.ship_from_state && ship.ship_from_zip;

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-5 w-5" /> Ship-From Address
        </CardTitle>
        <CardDescription>
          Return address printed on shipping labels. Required before creating labels.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Business / Sender Name</Label>
          <Input value={ship.ship_from_name} onChange={e => setShip(s => ({ ...s, ship_from_name: e.target.value }))} placeholder="My Peptide Company LLC" />
        </div>
        <div className="space-y-2">
          <Label>Street Address</Label>
          <Input value={ship.ship_from_street} onChange={e => setShip(s => ({ ...s, ship_from_street: e.target.value }))} placeholder="123 Main St, Suite 100" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={ship.ship_from_city} onChange={e => setShip(s => ({ ...s, ship_from_city: e.target.value }))} placeholder="Tampa" />
          </div>
          <div className="space-y-2">
            <Label>State</Label>
            <Input value={ship.ship_from_state} onChange={e => setShip(s => ({ ...s, ship_from_state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="FL" maxLength={2} />
          </div>
          <div className="space-y-2">
            <Label>ZIP Code</Label>
            <Input value={ship.ship_from_zip} onChange={e => setShip(s => ({ ...s, ship_from_zip: e.target.value }))} placeholder="33601" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={ship.ship_from_phone} onChange={e => setShip(s => ({ ...s, ship_from_phone: e.target.value }))} placeholder="(555) 123-4567" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={ship.ship_from_email} onChange={e => setShip(s => ({ ...s, ship_from_email: e.target.value }))} placeholder="shipping@example.com" />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Address
        </Button>
        {!isFilled && (
          <p className="text-xs text-amber-500">Fill in all address fields to enable shipping label creation.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Payment Methods Tab ───

const CARD_PROCESSOR_SERVICES = [
  { service: 'psifi_api_key', label: 'PsiFi API Key', placeholder: 'psifi_...', group: 'psifi' },
  { service: 'psifi_webhook_secret', label: 'PsiFi Webhook Secret', placeholder: 'whsec_...', group: 'psifi' },
  { service: 'paygate365_wallet_address', label: 'PayGate365 Wallet Address', placeholder: '0x...', group: 'paygate365' },
] as const;

interface CryptoWalletEntry {
  id: string;
  type: string;
  chain: string;
  address: string;
  label: string;
  enabled: boolean;
}

const CRYPTO_TYPES = ['USDC', 'USDT', 'BTC', 'ETH', 'SOL', 'DAI'] as const;
const CRYPTO_CHAINS = ['SOL', 'ETH', 'POLYGON', 'BTC', 'BASE', 'TRON', 'BSC'] as const;

function PaymentMethodsTab({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [payment, setPayment] = useState({
    zelle_email: '',
    venmo_handle: '',
    cashapp_handle: '',
  });

  // Crypto wallets
  const [cryptoWallets, setCryptoWallets] = useState<CryptoWalletEntry[]>([]);
  const [savingCrypto, setSavingCrypto] = useState(false);
  const [newWallet, setNewWallet] = useState({ type: 'USDC', chain: 'SOL', address: '', label: '' });

  // Card processor API keys
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [keyVisible, setKeyVisible] = useState<Record<string, boolean>>({});
  const [savingKeys, setSavingKeys] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['tenant-config-payment', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_config')
        .select('zelle_email, venmo_handle, cashapp_handle, crypto_wallets')
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: savedKeys } = useQuery({
    queryKey: ['tenant-api-keys', orgId, 'payment'],
    queryFn: async () => {
      const services = CARD_PROCESSOR_SERVICES.map(s => s.service);
      const { data, error } = await supabase
        .from('tenant_api_keys')
        .select('service, api_key_masked, updated_at')
        .eq('org_id', orgId)
        .in('service', services);
      if (error && error.code !== 'PGRST116') throw error;
      return (data || []) as { service: string; api_key_masked: string; updated_at: string }[];
    },
    enabled: !!orgId,
  });

  const savedMap = new Map(savedKeys?.map(k => [k.service, k]) || []);

  useEffect(() => {
    if (config) {
      setPayment(prev => ({ ...prev, zelle_email: config.zelle_email || '', venmo_handle: config.venmo_handle || '', cashapp_handle: config.cashapp_handle || '' }));
      setCryptoWallets(Array.isArray(config.crypto_wallets) ? config.crypto_wallets : []);
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tenant_config')
        .update(payment)
        .eq('org_id', orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['tenant-config-payment'] });
      invalidateTenantConfigCache();
      toast({ title: 'Payment methods saved' });
    } catch (err) {
      toast({ title: 'Failed to save', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKeys = async () => {
    const entries = Object.entries(apiKeys).filter(([, v]) => v.trim());
    if (entries.length === 0) return;
    setSavingKeys(true);
    try {
      for (const [service, rawKey] of entries) {
        const trimmed = rawKey.trim();
        const masked = trimmed.length > 11
          ? trimmed.slice(0, 7) + '...' + trimmed.slice(-4)
          : trimmed.slice(0, 4) + '...';
        const { error } = await supabase
          .from('tenant_api_keys')
          .upsert({ org_id: orgId, service, api_key: trimmed, api_key_masked: masked }, { onConflict: 'org_id,service' });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['tenant-api-keys'] });
      setApiKeys({});
      toast({ title: 'Card processor keys saved' });
    } catch (err) {
      toast({ title: 'Failed to save keys', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSavingKeys(false);
    }
  };

  const hasKeyEdits = Object.values(apiKeys).some(v => v.trim());

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-6">
      {/* Manual Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Manual Payment Methods
          </CardTitle>
          <CardDescription>
            Zelle, Venmo, and CashApp handles shown to customers at checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Zelle Email / Phone</Label>
            <Input
              value={payment.zelle_email}
              onChange={e => setPayment(p => ({ ...p, zelle_email: e.target.value }))}
              placeholder="email@example.com or (555) 123-4567"
            />
            <p className="text-xs text-muted-foreground">Customers will see this on checkout when paying via Zelle</p>
          </div>
          <div className="space-y-2">
            <Label>Venmo Handle</Label>
            <Input
              value={payment.venmo_handle}
              onChange={e => setPayment(p => ({ ...p, venmo_handle: e.target.value }))}
              placeholder="@YourVenmoHandle"
            />
          </div>
          <div className="space-y-2">
            <Label>CashApp Handle</Label>
            <Input
              value={payment.cashapp_handle}
              onChange={e => setPayment(p => ({ ...p, cashapp_handle: e.target.value }))}
              placeholder="$YourCashTag"
            />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Payment Methods
          </Button>
        </CardContent>
      </Card>

      {/* Crypto Wallet Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Crypto Wallet Payments
          </CardTitle>
          <CardDescription>
            Add crypto wallets so customers can pay with USDC, USDT, BTC, etc. at checkout. Each wallet specifies the token type, blockchain, and wallet address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing wallets */}
          {cryptoWallets.length > 0 && (
            <div className="space-y-2">
              {cryptoWallets.map((w) => (
                <div key={w.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/60 bg-card/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{w.type} on {w.chain}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{w.address}</p>
                    {w.label && <p className="text-xs text-muted-foreground">{w.label}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      setCryptoWallets(prev => prev.map(x => x.id === w.id ? { ...x, enabled: !x.enabled } : x));
                    }}
                    aria-label={w.enabled ? 'Disable wallet' : 'Enable wallet'}
                  >
                    {w.enabled ? <Check className="h-4 w-4 text-green-500" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    onClick={() => {
                      setCryptoWallets(prev => prev.filter(x => x.id !== w.id));
                    }}
                    aria-label="Remove wallet"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new wallet form */}
          <div className="space-y-3 border border-dashed border-border/60 rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground">Add Crypto Wallet</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Token Type</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={newWallet.type}
                  onChange={e => setNewWallet(prev => ({ ...prev, type: e.target.value }))}
                >
                  {CRYPTO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Blockchain</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={newWallet.chain}
                  onChange={e => setNewWallet(prev => ({ ...prev, chain: e.target.value }))}
                >
                  {CRYPTO_CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Wallet Address</Label>
              <Input
                value={newWallet.address}
                onChange={e => setNewWallet(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Paste your wallet address"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label (optional)</Label>
              <Input
                value={newWallet.label}
                onChange={e => setNewWallet(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g. Main Treasury"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!newWallet.address.trim()}
              onClick={() => {
                const entry: CryptoWalletEntry = {
                  id: crypto.randomUUID(),
                  type: newWallet.type,
                  chain: newWallet.chain,
                  address: newWallet.address.trim(),
                  label: newWallet.label.trim(),
                  enabled: true,
                };
                setCryptoWallets(prev => [...prev, entry]);
                setNewWallet({ type: 'USDC', chain: 'SOL', address: '', label: '' });
              }}
            >
              <Plus className="mr-1 h-3 w-3" /> Add Wallet
            </Button>
          </div>

          <Button
            onClick={async () => {
              setSavingCrypto(true);
              try {
                const { error } = await supabase
                  .from('tenant_config')
                  .update({ crypto_wallets: cryptoWallets })
                  .eq('org_id', orgId);
                if (error) throw error;
                queryClient.invalidateQueries({ queryKey: ['tenant-config-payment'] });
                invalidateTenantConfigCache();
                toast({ title: 'Crypto wallets saved' });
              } catch (err) {
                toast({ title: 'Failed to save', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
              } finally {
                setSavingCrypto(false);
              }
            }}
            disabled={savingCrypto}
          >
            {savingCrypto ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Crypto Wallets
          </Button>
        </CardContent>
      </Card>

      {/* Card Processor Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Card Payment Processors
          </CardTitle>
          <CardDescription>
            Connect a card processor so customers can pay by debit/credit card. Card checkout will appear once configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* PsiFi */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              PsiFi (Card Payments)
            </h4>
            <p className="text-xs text-muted-foreground">
              Debit/credit card checkout.{' '}
              <a href="https://dashboard.psifi.app" target="_blank" rel="noopener noreferrer" className="underline">
                Get API keys from PsiFi
              </a>
            </p>
            {CARD_PROCESSOR_SERVICES.filter(s => s.group === 'psifi').map(svc => {
              const saved = savedMap.get(svc.service);
              return (
                <div key={svc.service} className="space-y-1">
                  <Label className="text-xs">{svc.label}</Label>
                  <div className="relative">
                    <Input
                      type={keyVisible[svc.service] ? 'text' : 'password'}
                      placeholder={saved ? `Current: ${saved.api_key_masked}` : svc.placeholder}
                      value={apiKeys[svc.service] || ''}
                      onChange={e => setApiKeys(prev => ({ ...prev, [svc.service]: e.target.value }))}
                      className="pr-10 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setKeyVisible(prev => ({ ...prev, [svc.service]: !prev[svc.service] }))}
                    >
                      {keyVisible[svc.service] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {saved && (
                    <p className="text-[10px] text-muted-foreground">
                      Updated {format(new Date(saved.updated_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t" />

          {/* PayGate365 */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              PayGate365 (Alt Card Processor)
            </h4>
            <p className="text-xs text-muted-foreground">
              Card payments settled as USDC. Enter your Polygon wallet address.
            </p>
            {CARD_PROCESSOR_SERVICES.filter(s => s.group === 'paygate365').map(svc => {
              const saved = savedMap.get(svc.service);
              return (
                <div key={svc.service} className="space-y-1">
                  <Label className="text-xs">{svc.label}</Label>
                  <div className="relative">
                    <Input
                      type={keyVisible[svc.service] ? 'text' : 'password'}
                      placeholder={saved ? `Current: ${saved.api_key_masked}` : svc.placeholder}
                      value={apiKeys[svc.service] || ''}
                      onChange={e => setApiKeys(prev => ({ ...prev, [svc.service]: e.target.value }))}
                      className="pr-10 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setKeyVisible(prev => ({ ...prev, [svc.service]: !prev[svc.service] }))}
                    >
                      {keyVisible[svc.service] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {saved && (
                    <p className="text-[10px] text-muted-foreground">
                      Updated {format(new Date(saved.updated_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {hasKeyEdits && (
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveKeys} disabled={savingKeys}>
                {savingKeys ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Card Processor Keys
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// ─── Notifications Tab (SMS alerts for new orders) ───
interface SmsPhoneEntry {
  phone: string;
  label: string;
  enabled: boolean;
}

function NotificationsTab({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phones, setPhones] = useState<SmsPhoneEntry[]>([]);
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const { data: config, isLoading } = useQuery({
    queryKey: ['tenant-config-notifications', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_config')
        .select('order_sms_enabled, order_sms_phones')
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  useEffect(() => {
    if (config) {
      setSmsEnabled(config.order_sms_enabled ?? false);
      setPhones(config.order_sms_phones ?? []);
    }
  }, [config]);

  const handleAddPhone = () => {
    const cleaned = newPhone.replace(/[^\d+]/g, '');
    if (!cleaned || cleaned.length < 10) {
      toast({ title: 'Invalid phone number', description: 'Enter a valid phone number with area code', variant: 'destructive' });
      return;
    }
    if (phones.some(p => p.phone === cleaned)) {
      toast({ title: 'Duplicate', description: 'This number is already in the list', variant: 'destructive' });
      return;
    }
    setPhones(prev => [...prev, { phone: cleaned, label: newLabel || 'Unlabeled', enabled: true }]);
    setNewPhone('');
    setNewLabel('');
  };

  const handleRemovePhone = (index: number) => {
    setPhones(prev => prev.filter((_, i) => i !== index));
  };

  const handleTogglePhone = (index: number) => {
    setPhones(prev => prev.map((p, i) => i === index ? { ...p, enabled: !p.enabled } : p));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tenant_config')
        .update({ order_sms_enabled: smsEnabled, order_sms_phones: phones })
        .eq('org_id', orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['tenant-config-notifications'] });
      invalidateTenantConfigCache();
      toast({ title: 'Notification settings saved' });
    } catch (err) {
      toast({ title: 'Failed to save', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-5 w-5" /> Order SMS Notifications
          </CardTitle>
          <CardDescription>
            Get a text message whenever a new order arrives in your fulfillment queue — from WooCommerce, Shopify, or manual orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Enable SMS notifications</Label>
              <p className="text-xs text-muted-foreground">Send a text to the numbers below when new orders come in</p>
            </div>
            <Switch checked={smsEnabled} onCheckedChange={setSmsEnabled} />
          </div>

          {/* Phone list */}
          {phones.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Notification Numbers</Label>
              {phones.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3 bg-secondary/30">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.label}</p>
                    <p className="text-xs text-muted-foreground">{entry.phone}</p>
                  </div>
                  <Switch
                    checked={entry.enabled}
                    onCheckedChange={() => handleTogglePhone(i)}
                    aria-label={`Toggle ${entry.label}`}
                  />
                  <Button variant="ghost" size="icon" onClick={() => handleRemovePhone(i)} className="shrink-0 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new phone */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Add a phone number</Label>
            <div className="flex gap-2">
              <Input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Label (e.g. Justin's cell)"
                className="flex-1"
              />
              <Input
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="flex-1"
                onKeyDown={e => e.key === 'Enter' && handleAddPhone()}
              />
              <Button variant="outline" onClick={handleAddPhone} disabled={!newPhone.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Each number receives a text when a new order enters the fulfillment queue. Standard SMS rates apply via Textbelt.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Notification Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


// ─── Store Settings Tab ───
const DISCOUNT_PRESETS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 50];

function StoreSettingsTab({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [discount, setDiscount] = useState(20);

  const { data: config, isLoading } = useQuery({
    queryKey: ['tenant-config-store', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_config')
        .select('default_customer_discount')
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  useEffect(() => {
    if (config?.default_customer_discount != null) {
      setDiscount(config.default_customer_discount);
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tenant_config')
        .update({ default_customer_discount: discount })
        .eq('org_id', orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['tenant-config-store'] });
      invalidateTenantConfigCache();
      toast({ title: 'Store discount updated', description: `Customers will now see ${discount}% off retail pricing.` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to save', description: (err as any)?.message || 'Unknown error' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const multiplier = ((100 - discount) / 100).toFixed(2);

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Customer Store Pricing
          </CardTitle>
          <CardDescription>
            Set the default discount off retail (MSRP) that customers see in your store. This applies to all customer orders for your organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Default Customer Discount</Label>
            <div className="flex flex-wrap gap-2">
              {DISCOUNT_PRESETS.map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setDiscount(pct)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    discount === pct
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary/50 text-foreground border-border hover:bg-secondary'
                  }`}
                >
                  {pct === 0 ? 'Full Price' : `${pct}% off`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Or enter custom:</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={discount}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 0 && val <= 100) setDiscount(val);
                }}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">% off retail</span>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 space-y-1">
            <p className="text-sm font-medium">Preview</p>
            <p className="text-sm text-muted-foreground">
              A product with <span className="font-medium text-foreground">$100 retail price</span> will show as{' '}
              <span className="font-medium text-green-600">${(100 * (100 - discount) / 100).toFixed(2)}</span> for customers
              {discount > 0 && <span className="text-xs ml-1">({discount}% off, multiplier: {multiplier}x)</span>}
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Store Pricing'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


export default function Settings() {
  usePageTitle('Settings');
  const { profile, organization, userRole, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingOrg, setIsUpdatingOrg] = useState(false);

  const isAdmin = userRole?.role === 'admin' || userRole?.role === 'super_admin';
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyInviteLink = async () => {
    const signupUrl = `${window.location.origin}/auth`;
    try {
      await navigator.clipboard.writeText(signupUrl);
    } catch {
      const input = document.createElement('input');
      input.value = signupUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopiedLink(true);
    toast({ title: 'Invite link copied to clipboard' });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: profile?.full_name || '' },
  });

  const orgForm = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: { name: organization?.name || '' },
  });

  // Fetch team members
  const { data: teamMembers, isError: teamError, refetch: teamRefetch } = useQuery({
    queryKey: ['team-members', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*, user_roles!inner(role)')
        .eq('org_id', organization.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && isAdmin,
  });

  const handleUpdateProfile = async (data: ProfileFormData) => {
    if (!profile) return;
    setIsUpdatingProfile(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: data.full_name })
        .eq('id', profile.id);

      if (error) throw error;

      await refreshProfile();
      toast({ title: 'Profile updated successfully' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to update profile', description: (error as any)?.message || 'Unknown error' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdateOrganization = async (data: OrganizationFormData) => {
    if (!organization) return;
    setIsUpdatingOrg(true);

    try {
      const { error } = await supabase
        .from('organizations')
        .update({ name: data.name })
        .eq('id', organization.id);

      if (error) throw error;

      await refreshProfile();
      toast({ title: 'Organization updated successfully' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to update organization', description: (error as any)?.message || 'Unknown error' });
    } finally {
      setIsUpdatingOrg(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-3xl"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="flex items-center gap-3"
      >
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account and organization</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
      >
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="organization" className="gap-2">
                <Building2 className="h-4 w-4" />
                Organization
              </TabsTrigger>
              {organization?.id && (
                <>
                  <TabsTrigger value="branding" className="gap-2">
                    <Palette className="h-4 w-4" />
                    Branding
                  </TabsTrigger>
                  <TabsTrigger value="shipping" className="gap-2">
                    <Truck className="h-4 w-4" />
                    Shipping
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="gap-2">
                    <CreditCard className="h-4 w-4" />
                    Payments
                  </TabsTrigger>
                  <TabsTrigger value="notifications" className="gap-2">
                    <Bell className="h-4 w-4" />
                    Notifications
                  </TabsTrigger>
                  <TabsTrigger value="store" className="gap-2">
                    <ShoppingBag className="h-4 w-4" />
                    Store
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger value="team" className="gap-2">
                <Users className="h-4 w-4" />
                Team
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="profile">
          <Card className="bg-card border-border/60">
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(handleUpdateProfile)} className="space-y-4">
                  <FormField
                    control={profileForm.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <FormLabel>Email</FormLabel>
                    <Input value={profile?.email || ''} readOnly className="bg-muted/50 opacity-70 focus-visible:ring-0 cursor-not-allowed" />
                    <p className="text-xs text-muted-foreground">
                      Email cannot be changed
                    </p>
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Role</FormLabel>
                    <div>
                      <Badge>{userRole?.role || 'No role'}</Badge>
                    </div>
                  </div>
                  <Button type="submit" disabled={isUpdatingProfile}>
                    {isUpdatingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="organization">
            <Card className="bg-card border-border/60">
              <CardHeader>
                <CardTitle>Organization Settings</CardTitle>
                <CardDescription>Manage your organization details</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...orgForm}>
                  <form onSubmit={orgForm.handleSubmit(handleUpdateOrganization)} className="space-y-4">
                    <FormField
                      control={orgForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Organization Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isUpdatingOrg}>
                      {isUpdatingOrg && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && organization?.id && (
          <TabsContent value="branding">
            <BrandingTab orgId={organization.id} />
          </TabsContent>
        )}

        {isAdmin && organization?.id && (
          <TabsContent value="shipping">
            <ShippingConfigSection orgId={organization.id} />
          </TabsContent>
        )}

        {isAdmin && organization?.id && (
          <TabsContent value="payments">
            <PaymentMethodsTab orgId={organization.id} />
          </TabsContent>
        )}

        {isAdmin && organization?.id && (
          <TabsContent value="notifications">
            <NotificationsTab orgId={organization.id} />
          </TabsContent>
        )}

        {isAdmin && organization?.id && (
          <TabsContent value="store">
            <StoreSettingsTab orgId={organization.id} />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="team" className="space-y-6">
            <Card className="bg-card border-border/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Team Members</CardTitle>
                    <CardDescription>
                      {teamMembers?.length || 0} member{(teamMembers?.length || 0) !== 1 ? 's' : ''} in your organization
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopyInviteLink}>
                    {copiedLink ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                    {copiedLink ? 'Copied!' : 'Copy Invite Link'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {teamError ? (
                  <QueryError message="Failed to load team members." onRetry={teamRefetch} />
                ) : (
                <div className="space-y-3">
                  {teamMembers?.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                          {(member.full_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{member.full_name || 'Unnamed'}</p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {member.created_at && (
                          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            Joined {format(new Date(member.created_at), 'MMM d, yyyy')}
                          </div>
                        )}
                        <Badge>
                          {member.user_roles?.[0]?.role || 'No role'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {(!teamMembers || teamMembers.length === 0) && (
                    <p className="text-center text-muted-foreground py-4">
                      No team members found
                    </p>
                  )}
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
      </motion.div>
    </motion.div>
  );
}
