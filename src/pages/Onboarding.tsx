import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2 } from 'lucide-react';

const onboardingSchema = z.object({
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

/**
 * Link user to a partner's org via referral stored in sessionStorage.
 * This is a fallback for Google OAuth where the redirect skips /auth.
 */
async function handleReferralLinking(
  userId: string,
  email: string,
  fullName: string,
  referrerProfileId: string,
  role: 'customer' | 'partner',
) {
  const { data: referrer } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('id', referrerProfileId)
    .maybeSingle();

  if (!referrer?.org_id) return null;

  const isPartner = role === 'partner';
  const appRole = isPartner ? 'sales_rep' : 'client';

  const profileUpdate: Record<string, unknown> = {
    org_id: referrer.org_id,
    parent_rep_id: referrer.id,
    role: appRole,
  };
  if (isPartner) {
    profileUpdate.partner_tier = 'associate';
    profileUpdate.commission_rate = 0.075;
    profileUpdate.price_multiplier = 0.75;
  }

  const { error } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('user_id', userId);

  if (error) return null;

  await supabase.from('user_roles').upsert({
    user_id: userId,
    org_id: referrer.org_id,
    role: appRole,
  }, { onConflict: 'user_id,org_id' });

  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('linked_user_id', userId)
    .eq('org_id', referrer.org_id)
    .maybeSingle();

  if (!existing) {
    await supabase.from('contacts').insert({
      name: fullName || email,
      email,
      type: isPartner ? 'partner' : 'customer',
      org_id: referrer.org_id,
      assigned_rep_id: referrer.id,
      linked_user_id: userId,
    });
  }

  return isPartner ? 'partner' : 'customer';
}

export default function Onboarding() {
  const [isLoading, setIsLoading] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const linkAttempted = useRef(false);

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { organizationName: '' },
  });

  // Redirect if user already has an org
  if (profile?.org_id) {
    navigate('/', { replace: true });
    return null;
  }

  // Check for referral in sessionStorage (Google OAuth fallback)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const refId = sessionStorage.getItem('partner_ref');
    if (!refId || !user || linkAttempted.current) return;

    linkAttempted.current = true;
    setIsLinking(true);

    const role = (sessionStorage.getItem('partner_ref_role') || 'customer') as 'customer' | 'partner';
    const email = user.email || '';
    const name = profile?.full_name || user.user_metadata?.full_name || email;

    handleReferralLinking(user.id, email, name, refId, role).then(async (result) => {
      sessionStorage.removeItem('partner_ref');
      sessionStorage.removeItem('partner_ref_role');

      if (result) {
        await refreshProfile();
        toast({
          title: 'Welcome!',
          description: result === 'partner' ? 'Your partner account is ready!' : 'Your account has been connected.',
        });
        navigate(result === 'partner' ? '/partner' : '/store', { replace: true });
      } else {
        setIsLinking(false);
      }
    });
  }, [user]);

  // Show loading while auto-linking via referral
  if (isLinking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Setting up your account...</p>
      </div>
    );
  }

  const handleSubmit = async (data: OnboardingFormData) => {
    if (!user) return;

    setIsLoading(true);

    try {
      // 1. Create organization
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: data.organizationName })
        .select()
        .single();

      if (orgError) throw orgError;

      // 2. Update profile with org_id
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ org_id: orgData.id })
        .eq('user_id', user.id);

      if (profileError) throw profileError;

      // 3. Create user_role with admin
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          org_id: orgData.id,
          role: 'admin',
        });

      if (roleError) throw roleError;

      // 4. Refresh profile context
      await refreshProfile();

      toast({
        title: 'Organization created!',
        description: `Welcome to ${data.organizationName}. You're now an admin.`,
      });

      navigate('/', { replace: true });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Setup failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Create Your Organization
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Set up your company to start tracking inventory
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="organizationName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="PureUSPeptide"
                        className="bg-secondary border-border"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Organization
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
