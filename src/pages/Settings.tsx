import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/use-page-title';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
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
    Calendar,
    Palette,
    Key,
    Eye,
    EyeOff,
    Save,
    Link2,
    ExternalLink,
    Truck,
    Globe,
    Wand2,
    RefreshCw,
    PackageSearch,
} from 'lucide-react';
import { useTenantConnections, useConnectService } from '@/hooks/use-tenant-connections';
import { invalidateTenantConfigCache } from '@/hooks/use-tenant-config';
import { QueryError } from '@/components/ui/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';

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
    app_url: '',
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['tenant-config-settings', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_config')
        .select('brand_name, admin_brand_name, support_email, logo_url, primary_color, app_url')
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
      toast({ title: 'Failed to save', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const resp = await supabase.functions.invoke('scrape-brand', {
        body: { url: scrapeUrl, persist: true },
      });
      if (resp.error) throw resp.error;
      const result = resp.data;
      if (result?.brand) {
        const b = result.brand;
        setBrand(prev => ({
          ...prev,
          brand_name: b.company_name || prev.brand_name,
          logo_url: b.logo_url || prev.logo_url,
          primary_color: b.primary_color || prev.primary_color,
        }));
        queryClient.invalidateQueries({ queryKey: ['tenant-config-settings'] });
        invalidateTenantConfigCache();
        toast({
          title: 'Brand imported',
          description: `Found ${result.peptides?.length || 0} peptides. Branding fields updated — review and save.`,
        });
      }
    } catch (err) {
      toast({ title: 'Scrape failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
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
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Branding
        </Button>
      </CardContent>
    </Card>
    </div>
  );
}

// ─── Integrations / API Keys Tab ───
const API_KEY_SERVICES = [
  { key: 'psifi_api_key', label: 'PsiFi API Key', placeholder: 'psifi_...' },
  { key: 'psifi_webhook_secret', label: 'PsiFi Webhook Secret', placeholder: 'whsec_...' },
  { key: 'stripe_secret_key', label: 'Stripe Secret Key (optional fallback)', placeholder: 'sk_live_...' },
  { key: 'stripe_publishable_key', label: 'Stripe Publishable Key (optional)', placeholder: 'pk_live_...' },
  { key: 'shippo_api_key', label: 'Shippo API Key', placeholder: 'shippo_live_...' },
  { key: 'openai_api_key', label: 'OpenAI API Key (AI Chat)', placeholder: 'sk-...' },
  { key: 'woo_url', label: 'WooCommerce Store URL', placeholder: 'https://yourstore.com' },
  { key: 'woo_user', label: 'WooCommerce Username', placeholder: 'admin@yourstore.com' },
  { key: 'woo_app_pass', label: 'WooCommerce App Password', placeholder: 'xxxx xxxx xxxx xxxx' },
] as const;

const OAUTH_SERVICES = [
  { id: 'stripe', label: 'Stripe', description: 'Payment processing', icon: '💳' },
  { id: 'gmail', label: 'Gmail', description: 'Email integration', icon: '📧' },
  { id: 'sheets', label: 'Google Sheets', description: 'Spreadsheet sync', icon: '📊' },
  { id: 'shopify', label: 'Shopify', description: 'E-commerce integration', icon: '🛒' },
  { id: 'drive', label: 'Google Drive', description: 'File storage', icon: '📁' },
  { id: 'notion', label: 'Notion', description: 'Documentation', icon: '📝' },
];

function OAuthConnectionsSection() {
  const { data: connections = [], isLoading } = useTenantConnections();
  const connectService = useConnectService();
  const { toast } = useToast();

  const connectionMap = new Map(connections.map(c => [c.service, c]));

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">OAuth Connections</CardTitle>
        <CardDescription>Connect third-party services with one click</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {OAUTH_SERVICES.map(svc => {
            const conn = connectionMap.get(svc.id);
            const isConnected = conn?.status === 'connected';
            const isPending = conn?.status === 'pending';
            return (
              <div key={svc.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/40">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{svc.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{svc.label}</p>
                    <p className="text-xs text-muted-foreground">{svc.description}</p>
                  </div>
                </div>
                {isConnected ? (
                  <Badge variant="default" className="bg-emerald-600 text-xs gap-1">
                    <Link2 className="h-3 w-3" /> Connected
                  </Badge>
                ) : isPending ? (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Pending
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={connectService.isPending}
                    onClick={() => {
                      connectService.mutate(svc.id, {
                        onError: (err: Error) => {
                          toast({ title: 'Connection failed', description: err.message, variant: 'destructive' });
                        },
                      });
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Connect
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── WooCommerce Setup Section ───
function WooCommerceSetupSection({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    woo_product_count: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  } | null>(null);

  // Fetch existing WooCommerce webhook secret
  const { data: wooSecret } = useQuery({
    queryKey: ['tenant-api-keys', orgId, 'woo_webhook_secret'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_api_keys')
        .select('api_key, api_key_masked, updated_at')
        .eq('org_id', orgId)
        .eq('service', 'woo_webhook_secret')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // The webhook URL for this tenant
  const webhookUrl = `${window.location.origin}/api/webhooks/woocommerce?org=${orgId}`;

  const generateSecret = async () => {
    setGenerating(true);
    try {
      // Generate a random 32-byte secret
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const secret = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const masked = secret.slice(0, 8) + '...' + secret.slice(-4);

      const { error } = await supabase
        .from('tenant_api_keys')
        .upsert({
          org_id: orgId,
          service: 'woo_webhook_secret',
          api_key: secret,
          api_key_masked: masked,
        }, { onConflict: 'org_id,service' });

      if (error) throw error;

      // Copy secret to clipboard immediately
      await navigator.clipboard.writeText(secret);
      queryClient.invalidateQueries({ queryKey: ['tenant-api-keys', orgId, 'woo_webhook_secret'] });
      toast({ title: 'Webhook secret generated & copied', description: 'Paste this into your WooCommerce webhook settings. It won\'t be shown again in full.' });
    } catch (err) {
      toast({ title: 'Failed to generate secret', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'url' | 'secret') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
    toast({ title: `${type === 'url' ? 'Webhook URL' : 'Secret'} copied` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span className="text-xl">🛒</span> WooCommerce Integration
        </CardTitle>
        <CardDescription>
          Connect your WooCommerce store to automatically sync orders, contacts, and inventory
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Webhook URL */}
        <div className="space-y-1.5">
          <Label>Webhook Delivery URL</Label>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="text-xs font-mono" />
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl, 'url')}>
              {copiedUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Webhook Secret */}
        <div className="space-y-1.5">
          <Label>Webhook Secret</Label>
          {wooSecret ? (
            <div className="flex items-center gap-2">
              <Input value={wooSecret.api_key_masked} readOnly className="text-xs font-mono flex-1" />
              <Badge variant="default" className="bg-emerald-600 text-xs whitespace-nowrap">Active</Badge>
              <Button variant="outline" size="sm" onClick={generateSecret} disabled={generating}>
                Regenerate
              </Button>
            </div>
          ) : (
            <Button onClick={generateSecret} disabled={generating} variant="default" size="sm">
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
              Generate Webhook Secret
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            The full secret is shown only once when generated. Copy it into WooCommerce immediately.
          </p>
        </div>

        {/* Setup Instructions */}
        <div className="rounded-lg bg-secondary/30 border border-border/40 p-4 space-y-2">
          <p className="text-sm font-medium">Setup in WooCommerce:</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Go to <span className="font-mono">WooCommerce → Settings → Advanced → Webhooks</span></li>
            <li>Click <strong>Add webhook</strong></li>
            <li>Name: <span className="font-mono">ThePeptideAI Order Sync</span></li>
            <li>Status: <strong>Active</strong></li>
            <li>Topic: <strong>Order updated</strong> (fires on both create and update)</li>
            <li>Delivery URL: paste the URL above</li>
            <li>Secret: paste the generated secret</li>
            <li>API Version: <strong>WP REST API Integration v3</strong></li>
            <li>Click <strong>Save webhook</strong> — WooCommerce will send a test ping</li>
          </ol>
        </div>

        {/* Product Sync */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                <PackageSearch className="h-4 w-4" /> Sync Product Catalog
              </p>
              <p className="text-xs text-muted-foreground">
                Import your WooCommerce products as peptides. Requires Store URL + App Password above.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                setSyncResult(null);
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) throw new Error('Not authenticated');
                  const resp = await fetch('/api/integrations/woo-sync-products', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ dryRun: false }),
                  });
                  const data = await resp.json();
                  if (!resp.ok) throw new Error(data.error || 'Sync failed');
                  setSyncResult(data);
                  queryClient.invalidateQueries({ queryKey: ['peptides'] });
                  toast({
                    title: 'Product sync complete',
                    description: `${data.created} created, ${data.updated} updated, ${data.skipped} skipped`,
                  });
                } catch (err) {
                  toast({
                    title: 'Product sync failed',
                    description: err instanceof Error ? err.message : 'Unknown error',
                    variant: 'destructive',
                  });
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {syncing ? 'Syncing...' : 'Sync Products'}
            </Button>
          </div>
          {syncResult && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs space-y-1">
              <p className="font-medium text-emerald-400">Sync Results</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold">{syncResult.woo_product_count}</p>
                  <p className="text-muted-foreground">WooCommerce</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-400">{syncResult.created}</p>
                  <p className="text-muted-foreground">Created</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-400">{syncResult.updated}</p>
                  <p className="text-muted-foreground">Updated</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-400">{syncResult.skipped}</p>
                  <p className="text-muted-foreground">Skipped</p>
                </div>
              </div>
              {syncResult.errors > 0 && (
                <p className="text-red-400">⚠ {syncResult.errors} error(s) — check console</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Scraped Peptides Review Section ───
interface ScrapedPeptide {
  id: string;
  org_id: string;
  name: string;
  price: number | null;
  description: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  imported_peptide_id: string | null;
  source_url: string | null;
  created_at: string;
}

function ScrapedPeptidesReview({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState<string | null>(null);

  const { data: scraped, isLoading } = useQuery({
    queryKey: ['scraped-peptides', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scraped_peptides')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const pending = scraped?.filter(s => s.status === 'pending') || [];
  const accepted = scraped?.filter(s => s.status === 'accepted') || [];
  const rejected = scraped?.filter(s => s.status === 'rejected') || [];

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!scraped?.length) return null;

  const handleImport = async (item: ScrapedPeptide) => {
    setImporting(item.id);
    try {
      // Create peptide from scraped data
      const { data: newPeptide, error: insertErr } = await supabase
        .from('peptides')
        .insert({
          org_id: orgId,
          name: item.name,
          retail_price: item.price || null,
          description: item.description || null,
          active: true,
        })
        .select('id')
        .maybeSingle();

      if (insertErr) throw insertErr;

      // Mark as accepted with link
      const { error: updateErr } = await supabase
        .from('scraped_peptides')
        .update({ status: 'accepted', imported_peptide_id: newPeptide.id })
        .eq('id', item.id);

      if (updateErr) throw updateErr;

      queryClient.invalidateQueries({ queryKey: ['scraped-peptides'] });
      queryClient.invalidateQueries({ queryKey: ['peptides'] });
      toast({ title: `Imported "${item.name}"` });
    } catch (err) {
      toast({ title: 'Import failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setImporting(null);
    }
  };

  const handleReject = async (id: string) => {
    const { error } = await supabase
      .from('scraped_peptides')
      .update({ status: 'rejected' })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to reject', variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['scraped-peptides'] });
    }
  };

  const handleImportAll = async () => {
    setImporting('all');
    let imported = 0;
    for (const item of pending) {
      try {
        const { data: newPeptide, error: insertErr } = await supabase
          .from('peptides')
          .insert({
            org_id: orgId,
            name: item.name,
            retail_price: item.price || null,
            description: item.description || null,
            active: true,
          })
          .select('id')
          .maybeSingle();

        if (!insertErr && newPeptide) {
          await supabase
            .from('scraped_peptides')
            .update({ status: 'accepted', imported_peptide_id: newPeptide.id })
            .eq('id', item.id);
          imported++;
        }
      } catch {
        // continue with others
      }
    }
    queryClient.invalidateQueries({ queryKey: ['scraped-peptides'] });
    queryClient.invalidateQueries({ queryKey: ['peptides'] });
    toast({ title: `Imported ${imported} of ${pending.length} peptides` });
    setImporting(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <PackageSearch className="h-5 w-5" /> Scraped Peptides
            </CardTitle>
            <CardDescription>
              Peptides detected from your website during setup. Review and import into your catalog.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {pending.length > 0 && (
              <Badge variant="secondary">{pending.length} pending</Badge>
            )}
            {accepted.length > 0 && (
              <Badge variant="default" className="bg-emerald-600">{accepted.length} imported</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      {pending.length > 0 && (
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={importing === 'all'}
              onClick={handleImportAll}
            >
              {importing === 'all' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Import All ({pending.length})
            </Button>
          </div>
          {pending.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/40">
              {item.image_url && (
                <img src={item.image_url} alt={item.name} className="h-10 w-10 rounded object-cover" loading="lazy" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {item.price && <span>${Number(item.price).toFixed(2)}</span>}
                  {item.confidence > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {Math.round(item.confidence * 100)}% confidence
                    </Badge>
                  )}
                  {item.description && (
                    <span className="truncate max-w-[200px]">{item.description}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 px-2 text-xs"
                  disabled={!!importing}
                  onClick={() => handleImport(item)}
                >
                  {importing === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Import'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  disabled={!!importing}
                  onClick={() => handleReject(item.id)}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      )}
      {pending.length === 0 && (accepted.length > 0 || rejected.length > 0) && (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All scraped peptides have been reviewed. {accepted.length} imported, {rejected.length} rejected.
          </p>
        </CardContent>
      )}
    </Card>
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
      toast({ title: 'Failed to save', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
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
        <div className="grid grid-cols-3 gap-3">
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

function IntegrationsTab({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [keys, setKeys] = useState<Record<string, string>>({});

  const { data: savedKeys, isLoading } = useQuery({
    queryKey: ['tenant-api-keys', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_api_keys')
        .select('service, api_key_masked, updated_at')
        .eq('org_id', orgId);
      if (error && error.code !== 'PGRST116') throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(keys).filter(([, v]) => v.trim());
      for (const [service, apiKey] of entries) {
        const masked = apiKey.slice(0, 7) + '...' + apiKey.slice(-4);
        const { error } = await supabase
          .from('tenant_api_keys')
          .upsert({
            org_id: orgId,
            service,
            api_key: apiKey,
            api_key_masked: masked,
          }, { onConflict: 'org_id,service' });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['tenant-api-keys'] });
      setKeys({});
      toast({ title: 'API keys saved' });
    } catch (err) {
      toast({ title: 'Failed to save keys', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const savedMap = new Map(savedKeys?.map(k => [k.service, k]) || []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Connect your Stripe, Shippo, and AI services. Keys are encrypted at rest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {API_KEY_SERVICES.map(({ key, label, placeholder }) => {
          const saved = savedMap.get(key);
          return (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={visible[key] ? 'text' : 'password'}
                    value={keys[key] || ''}
                    onChange={e => setKeys(k => ({ ...k, [key]: e.target.value }))}
                    placeholder={saved ? `Current: ${saved.api_key_masked}` : placeholder}
                  />
                  <button
                    type="button"
                    onClick={() => setVisible(v => ({ ...v, [key]: !v[key] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {visible[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {saved && (
                <p className="text-xs text-muted-foreground">
                  Last updated: {format(new Date(saved.updated_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </div>
          );
        })}
        <Button onClick={handleSave} disabled={saving || !Object.values(keys).some(v => v.trim())}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
          Save Keys
        </Button>
      </CardContent>
    </Card>
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
      toast({ variant: 'destructive', title: 'Failed to update profile', description: error instanceof Error ? error.message : 'Unknown error' });
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
      toast({ variant: 'destructive', title: 'Failed to update organization', description: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setIsUpdatingOrg(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and organization</p>
      </div>

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
              <TabsTrigger value="branding" className="gap-2">
                <Palette className="h-4 w-4" />
                Branding
              </TabsTrigger>
              <TabsTrigger value="integrations" className="gap-2">
                <Key className="h-4 w-4" />
                Integrations
              </TabsTrigger>
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
                    <Input value={profile?.email || ''} disabled className="opacity-50" />
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
          <TabsContent value="integrations" className="space-y-6">
            <ShippingConfigSection orgId={organization.id} />
            <WooCommerceSetupSection orgId={organization.id} />
            <ScrapedPeptidesReview orgId={organization.id} />
            <OAuthConnectionsSection />
            <IntegrationsTab orgId={organization.id} />
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
    </div>
  );
}
