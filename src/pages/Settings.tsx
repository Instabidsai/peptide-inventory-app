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
import { Loader2, User, Building2, Users, Copy, Check, Calendar, Palette, Key, Eye, EyeOff, Save, Link2, Unlink, ExternalLink } from 'lucide-react';
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

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
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
            {brand.logo_url && <img src={brand.logo_url} alt="Logo preview" className="h-10 mt-1 rounded" />}
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
  );
}

// ─── Integrations / API Keys Tab ───
const API_KEY_SERVICES = [
  { key: 'stripe_secret_key', label: 'Stripe Secret Key', placeholder: 'sk_live_...' },
  { key: 'stripe_publishable_key', label: 'Stripe Publishable Key', placeholder: 'pk_live_...' },
  { key: 'shippo_api_key', label: 'Shippo API Key', placeholder: 'shippo_live_...' },
  { key: 'openai_api_key', label: 'OpenAI API Key (AI Chat)', placeholder: 'sk-...' },
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
                        onError: (err: any) => {
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
