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
    Calendar,
    Palette,
    Save,
    Truck,
    Globe,
    Wand2,
    Settings2,
} from 'lucide-react';
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
              <TabsTrigger value="branding" className="gap-2">
                <Palette className="h-4 w-4" />
                Branding
              </TabsTrigger>
              <TabsTrigger value="shipping" className="gap-2">
                <Truck className="h-4 w-4" />
                Shipping
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
          <TabsContent value="shipping">
            <ShippingConfigSection orgId={organization.id} />
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
