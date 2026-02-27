import { useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/hooks/use-page-title';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Copy,
  Check,
  Key,
  Eye,
  EyeOff,
  Save,
  Link2,
  ExternalLink,
  RefreshCw,
  PackageSearch,
  Plug,
  CheckCircle2,
  ChevronDown,
  Unplug,
  Store,
} from 'lucide-react';
import { useTenantConnections, useConnectService } from '@/hooks/use-tenant-connections';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { BrandLogo } from '@/components/ui/brand-logos';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// ─── Service Configs ───

const API_KEY_SERVICES = [
  { key: 'psifi_api_key', label: 'PsiFi API Key', placeholder: 'psifi_...' },
  { key: 'psifi_webhook_secret', label: 'PsiFi Webhook Secret', placeholder: 'whsec_...' },
  { key: 'stripe_secret_key', label: 'Stripe Secret Key (optional fallback)', placeholder: 'sk_live_...' },
  { key: 'stripe_publishable_key', label: 'Stripe Publishable Key (optional)', placeholder: 'pk_live_...' },
  { key: 'shippo_api_key', label: 'Shippo API Key', placeholder: 'shippo_live_...' },
  { key: 'openai_api_key', label: 'OpenAI API Key (AI Chat)', placeholder: 'sk-...' },
] as const;

const OAUTH_SERVICES = [
  // Payments & Commerce
  { id: 'stripe', label: 'Stripe', description: 'Payment processing & invoicing', icon: '💳', category: 'Payments & Commerce' },
  { id: 'shopify', label: 'Shopify', description: 'E-commerce storefront sync', icon: '🛒', category: 'Payments & Commerce' },
  { id: 'square', label: 'Square', description: 'POS & in-person payments', icon: '🟩', category: 'Payments & Commerce' },
  // Communication
  { id: 'gmail', label: 'Gmail', description: 'Email automation & sync', icon: '📧', category: 'Communication' },
  { id: 'slack', label: 'Slack', description: 'Team messaging & alerts', icon: '💬', category: 'Communication' },
  { id: 'discord', label: 'Discord', description: 'Community & team chat', icon: '🎮', category: 'Communication' },
  { id: 'zoom', label: 'Zoom', description: 'Video meetings & webinars', icon: '📹', category: 'Communication' },
  // Productivity & Docs
  { id: 'sheets', label: 'Google Sheets', description: 'Spreadsheet data sync', icon: '📊', category: 'Productivity' },
  { id: 'drive', label: 'Google Drive', description: 'File storage & sharing', icon: '📁', category: 'Productivity' },
  { id: 'notion', label: 'Notion', description: 'Docs & knowledge base', icon: '📝', category: 'Productivity' },
  { id: 'airtable', label: 'Airtable', description: 'Database & spreadsheet hybrid', icon: '📋', category: 'Productivity' },
  // CRM & Marketing
  { id: 'hubspot', label: 'HubSpot', description: 'CRM & marketing automation', icon: '🧲', category: 'CRM & Marketing' },
  { id: 'mailchimp', label: 'Mailchimp', description: 'Email campaigns & audiences', icon: '🐵', category: 'CRM & Marketing' },
  // Scheduling
  { id: 'calendly', label: 'Calendly', description: 'Appointment scheduling', icon: '📅', category: 'Scheduling' },
  // Accounting
  { id: 'quickbooks', label: 'QuickBooks', description: 'Accounting & bookkeeping', icon: '📒', category: 'Accounting' },
  { id: 'xero', label: 'Xero', description: 'Cloud accounting & invoicing', icon: '📘', category: 'Accounting' },
  // Project Management
  { id: 'trello', label: 'Trello', description: 'Boards & task management', icon: '📌', category: 'Project Management' },
  { id: 'asana', label: 'Asana', description: 'Team projects & workflows', icon: '🎯', category: 'Project Management' },
  // Customer Support
  { id: 'zendesk', label: 'Zendesk', description: 'Help desk & ticketing', icon: '🎧', category: 'Customer Support' },
  { id: 'intercom', label: 'Intercom', description: 'Live chat & customer messaging', icon: '💭', category: 'Customer Support' },
];

// ─── OAuth Connections ───

function OAuthConnectionsSection() {
  const { data: connections = [], isLoading } = useTenantConnections();
  const connectService = useConnectService();
  const { toast } = useToast();

  const connectionMap = new Map(connections.map(c => [c.service, c]));
  const connectedCount = OAUTH_SERVICES.filter(s => connectionMap.get(s.id)?.status === 'connected').length;

  // Group services by category
  const categories = OAUTH_SERVICES.reduce<Record<string, typeof OAUTH_SERVICES>>((acc, svc) => {
    const cat = svc.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(svc);
    return acc;
  }, {});

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">One-Click Connections</CardTitle>
            <CardDescription>Connect third-party services with one click via OAuth</CardDescription>
          </div>
          {connectedCount > 0 && (
            <Badge variant="default" className="bg-primary text-xs">
              {connectedCount} connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {Object.entries(categories).map(([category, services]) => (
          <div key={category}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {services.map(svc => {
                const conn = connectionMap.get(svc.id);
                const isConnected = conn?.status === 'connected';
                const isPending = conn?.status === 'pending';
                return (
                  <div key={svc.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/40">
                    <div className="flex items-center gap-3">
                      <BrandLogo id={svc.id} fallbackEmoji={svc.icon} className="h-6 w-6" />
                      <div>
                        <p className="text-sm font-medium">{svc.label}</p>
                        <p className="text-xs text-muted-foreground">{svc.description}</p>
                      </div>
                    </div>
                    {isConnected ? (
                      <Badge variant="default" className="bg-primary text-xs gap-1">
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
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── WooCommerce One-Click Connect ───

function WooCommerceSetupSection({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [storeUrl, setStoreUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [manualConnecting, setManualConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    woo_product_count: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  } | null>(null);

  // Check WooCommerce connection status
  const { data: wooConnection, isLoading: connLoading } = useQuery({
    queryKey: ['tenant-connections', orgId, 'woocommerce'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_connections')
        .select('*')
        .eq('org_id', orgId)
        .eq('service', 'woocommerce')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data as { status: string; metadata: Record<string, any>; connected_at: string | null } | null;
    },
    enabled: !!orgId,
    refetchInterval: (query) => {
      // Poll every 3s while pending, stop once connected/disconnected
      return query.state.data?.status === 'pending' ? 3000 : false;
    },
  });

  // Listen for ?connected=woocommerce URL param (redirect from callback)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('connected=woocommerce')) {
      toast({ title: 'WooCommerce Connected!', description: 'Your store is now connected. Orders will sync automatically.' });
      queryClient.invalidateQueries({ queryKey: ['tenant-connections', orgId, 'woocommerce'] });
      // Clean up URL param
      window.location.hash = window.location.hash.replace(/[?&]connected=woocommerce/, '');
    } else if (hash.includes('error=woocommerce_denied')) {
      toast({ variant: 'destructive', title: 'Connection Denied', description: 'You declined the WooCommerce authorization. Try again when ready.' });
      window.location.hash = window.location.hash.replace(/[?&]error=woocommerce_denied/, '');
    }
  }, []);

  const isConnected = wooConnection?.status === 'connected';
  const isPending = wooConnection?.status === 'pending';
  const connectedStoreUrl = wooConnection?.metadata?.store_url || '';

  const handleConnect = async () => {
    if (!storeUrl.trim()) {
      toast({ variant: 'destructive', title: 'Enter your store URL', description: 'e.g. mystore.com or https://mystore.com' });
      return;
    }
    setConnecting(true);
    try {
      const { data, error } = await invokeEdgeFunction<{ redirect_url: string }>('woo-connect', {
        store_url: storeUrl.trim(),
        org_id: orgId,
      });
      if (error) throw new Error(error.message);
      if (data?.redirect_url) {
        window.open(data.redirect_url, '_blank', 'width=700,height=700');
        queryClient.invalidateQueries({ queryKey: ['tenant-connections', orgId, 'woocommerce'] });
        toast({ title: 'Approve access on your store', description: 'A new window opened. Log in to your WooCommerce admin and click Approve.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to start connection', description: err.message });
    } finally {
      setConnecting(false);
    }
  };

  const handleManualConnect = async () => {
    if (!storeUrl.trim() || !consumerKey.trim() || !consumerSecret.trim()) {
      toast({ variant: 'destructive', title: 'All fields required', description: 'Enter your store URL, Consumer Key, and Consumer Secret.' });
      return;
    }
    setManualConnecting(true);
    try {
      const { data, error } = await invokeEdgeFunction<{ success: boolean; webhook_created: boolean; webhook_error?: string }>('woo-manual-connect', {
        store_url: storeUrl.trim(),
        consumer_key: consumerKey.trim(),
        consumer_secret: consumerSecret.trim(),
        org_id: orgId,
      });
      if (error) throw new Error(error.message);
      queryClient.invalidateQueries({ queryKey: ['tenant-connections', orgId, 'woocommerce'] });
      setConsumerKey('');
      setConsumerSecret('');
      if (data?.webhook_created) {
        toast({ title: 'WooCommerce Connected!', description: 'Your store is connected and order sync webhook was auto-created.' });
      } else {
        toast({ title: 'WooCommerce Connected!', description: 'Keys saved. Webhook could not be auto-created — you may need to add it manually in WooCommerce.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Connection failed', description: err.message });
    } finally {
      setManualConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await supabase
        .from('tenant_connections')
        .update({ status: 'disconnected', state_token: null })
        .eq('org_id', orgId)
        .eq('service', 'woocommerce');
      queryClient.invalidateQueries({ queryKey: ['tenant-connections', orgId, 'woocommerce'] });
      toast({ title: 'WooCommerce disconnected' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to disconnect', description: err.message });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSyncProducts = useCallback(async () => {
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
        description: (err as any)?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  }, [queryClient, toast]);

  if (connLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BrandLogo id="woocommerce" className="h-6 w-6 inline-block align-middle mr-1" /> WooCommerce Integration
          {isConnected && (
            <Badge variant="default" className="bg-green-600 text-xs ml-auto">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
            </Badge>
          )}
          {isPending && (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs ml-auto">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Waiting for approval...
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Connect your WooCommerce store to automatically sync orders, contacts, and inventory
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ─── Connected State ─── */}
        {isConnected && (
          <>
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 flex items-center gap-3">
              <Store className="h-5 w-5 text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-400">Store Connected</p>
                <p className="text-xs text-muted-foreground truncate">{connectedStoreUrl}</p>
                {wooConnection?.connected_at && (
                  <p className="text-xs text-muted-foreground">
                    Connected {format(new Date(wooConnection.connected_at), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive shrink-0"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              </Button>
            </div>

            {/* Product Sync */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <PackageSearch className="h-4 w-4" /> Sync Product Catalog
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Import your WooCommerce products as peptides.
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled={syncing} onClick={handleSyncProducts}>
                  {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {syncing ? 'Syncing...' : 'Sync Products'}
                </Button>
              </div>
              {syncResult && (
                <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs space-y-1">
                  <p className="font-medium text-primary">Sync Results</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold">{syncResult.woo_product_count}</p>
                      <p className="text-muted-foreground">WooCommerce</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-primary">{syncResult.created}</p>
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
                    <p className="text-red-400">Warning: {syncResult.errors} error(s) during sync</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── Pending State ─── */}
        {isPending && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 text-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-amber-400" />
            <p className="text-sm font-medium">Waiting for approval on your WooCommerce store...</p>
            <p className="text-xs text-muted-foreground">
              A window should have opened on your store. Log in as admin and click Approve.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                // Re-open the auth window if they closed it
                handleConnect();
              }}
            >
              Re-open authorization window
            </Button>
          </div>
        )}

        {/* ─── Not Connected State ─── */}
        {!isConnected && !isPending && (
          <>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Your WooCommerce Store URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={storeUrl}
                    onChange={e => setStoreUrl(e.target.value)}
                    placeholder="mystore.com"
                    onKeyDown={e => e.key === 'Enter' && handleConnect()}
                  />
                  <Button onClick={handleConnect} disabled={connecting}>
                    {connecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="mr-2 h-4 w-4" />
                    )}
                    {connecting ? 'Connecting...' : 'Connect WooCommerce'}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                You'll approve access on your own store. No passwords are shared with us — WooCommerce generates secure API keys automatically.
              </p>
            </div>

            {/* Paste API Keys Fallback */}
            <Accordion type="single" collapsible className="border-t pt-2">
              <AccordionItem value="manual" className="border-none">
                <AccordionTrigger className="text-xs text-muted-foreground hover:no-underline py-2">
                  <Key className="h-3.5 w-3.5 mr-1.5 inline" />
                  Or paste API keys instead
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <div className="rounded-lg bg-secondary/30 border border-border/40 p-4 space-y-3">
                    <p className="text-sm font-medium">Quick 3-step setup:</p>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>In your WooCommerce admin go to <span className="font-mono">Settings → Advanced → REST API</span></li>
                      <li>Click <strong>Add Key</strong>, name it anything, set permissions to <strong>Read/Write</strong>, click <strong>Generate</strong></li>
                      <li>Copy the <strong>Consumer Key</strong> and <strong>Consumer Secret</strong> and paste them below</li>
                    </ol>
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Consumer Key</Label>
                      <Input
                        value={consumerKey}
                        onChange={e => setConsumerKey(e.target.value)}
                        placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        type="password"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Consumer Secret</Label>
                      <Input
                        value={consumerSecret}
                        onChange={e => setConsumerSecret(e.target.value)}
                        placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        type="password"
                      />
                    </div>
                    <Button
                      onClick={handleManualConnect}
                      disabled={manualConnecting || !storeUrl.trim() || !consumerKey.trim() || !consumerSecret.trim()}
                      className="w-full"
                    >
                      {manualConnecting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Key className="mr-2 h-4 w-4" />
                      )}
                      {manualConnecting ? 'Connecting...' : 'Connect with API Keys'}
                    </Button>
                    <p className="text-[10px] text-muted-foreground text-center">
                      We'll store your keys securely and auto-create the order sync webhook on your store.
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Scraped Peptides Review ───

interface ScrapedPeptide {
  id: string;
  org_id: string;
  name: string;
  price: number | null;
  description: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  imported_peptide_id: string | null;
  source_url: string | null;
  image_url?: string | null;
  confidence?: number;
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

      const { error: updateErr } = await supabase
        .from('scraped_peptides')
        .update({ status: 'accepted', imported_peptide_id: newPeptide.id })
        .eq('id', item.id);

      if (updateErr) throw updateErr;

      queryClient.invalidateQueries({ queryKey: ['scraped-peptides'] });
      queryClient.invalidateQueries({ queryKey: ['peptides'] });
      toast({ title: `Imported "${item.name}"` });
    } catch (err) {
      toast({ title: 'Import failed', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
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
              <Badge variant="default" className="bg-primary">{accepted.length} imported</Badge>
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
                  {(item.confidence ?? 0) > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {Math.round((item.confidence ?? 0) * 100)}% confidence
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

// ─── API Keys Section ───

function ApiKeysSection({ orgId }: { orgId: string }) {
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
      toast({ title: 'Failed to save keys', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const savedMap = new Map(savedKeys?.map(k => [k.service, k]) || []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">API Keys</CardTitle>
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

// ─── Main Page ───

export default function Integrations() {
  usePageTitle('Integrations');
  const { organization } = useAuth();

  if (!organization?.id) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-4xl"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="flex items-center gap-3"
      >
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Plug className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Connect your services to sync products, orders, and communications.
            Connected services are automatically available to your AI assistant.
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
        className="space-y-6"
      >
        <OAuthConnectionsSection />
        <WooCommerceSetupSection orgId={organization.id} />
        <ScrapedPeptidesReview orgId={organization.id} />
        <ApiKeysSection orgId={organization.id} />
      </motion.div>
    </motion.div>
  );
}
