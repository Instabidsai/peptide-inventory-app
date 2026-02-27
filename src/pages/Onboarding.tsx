import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
    Loader2,
    RefreshCw,
    LogOut,
    FlaskConical,
    Building2,
    ArrowRight,
    Sparkles,
} from 'lucide-react';
import { linkReferral, consumeSessionReferral, storeSessionReferral } from '@/lib/link-referral';
import { useTenantConfig } from '@/hooks/use-tenant-config';

export default function Onboarding() {
  const [isLinking, setIsLinking] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const [failedRef, setFailedRef] = useState<{ refId: string; role: 'customer' | 'partner'; orgId?: string | null } | null>(null);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const { user, profile, refreshProfile, signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const linkAttempted = useRef(false);
  const { brand_name: brandName } = useTenantConfig();

  // Check if user came from landing page with a selected plan
  const selectedPlan = localStorage.getItem('selected_plan');

  const attemptLink = (ref: { refId: string; role: 'customer' | 'partner'; orgId?: string | null }) => {
    if (!user) return;
    setIsLinking(true);
    setLinkFailed(false);

    const email = user.email || '';
    const name = profile?.full_name || user.user_metadata?.full_name || email;

    linkReferral(user.id, email, name, ref.refId, ref.role, ref.orgId).then(async (result) => {
      if (result.success) {
        await refreshProfile();
        queryClient.invalidateQueries({ queryKey: ['client-profile'] });
        toast({
          title: 'Welcome!',
          description: result.type === 'partner' ? 'Your partner account is ready!' : 'Your account has been connected.',
        });
        navigate(result.type === 'partner' ? '/partner' : '/store', { replace: true });
      } else {
        setIsLinking(false);
        setLinkFailed(true);
        setFailedRef(ref);
        storeSessionReferral(ref.refId, ref.role, ref.orgId);
      }
    });
  };

  const handleCreateOrg = async () => {
    if (!companyName.trim() || !user) return;
    setIsCreatingOrg(true);

    try {
      const { data, error } = await invokeEdgeFunction<{ org_id?: string; error?: string }>('self-signup', {
        org_name: companyName.trim(),
        plan_name: selectedPlan || '',
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Clear the selected plan from localStorage
      localStorage.removeItem('selected_plan');

      // Refresh profile to pick up the new org_id
      await refreshProfile();

      // Fire welcome email (non-blocking — signup succeeds regardless)
      if (user.email && data?.org_id) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          fetch('/api/email/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              template: 'welcome',
              to: user.email,
              org_id: data.org_id,
              data: {
                name: user.user_metadata?.full_name || user.email,
                login_url: window.location.origin,
              },
            }),
          }).catch(() => {}); // silent fail — welcome email is non-critical
        }
      }

      toast({
        title: 'Welcome aboard!',
        description: `${companyName.trim()} is ready to go.`,
      });

      navigate('/setup-assistant', { replace: true });
    } catch (err) {
      const message = (err as any)?.message || 'Could not create your organization. Please try again.';
      toast({
        variant: 'destructive',
        title: 'Setup failed',
        description: message,
      });
      setIsCreatingOrg(false);
    }
  };

  // Check for referral in sessionStorage (Google OAuth fallback + Auth.tsx redirect)
  useEffect(() => {
    if (!user || linkAttempted.current) return;

    if (profile?.org_id) {
      navigate('/', { replace: true });
      return;
    }

    const ref = consumeSessionReferral();
    if (!ref) return;

    linkAttempted.current = true;
    attemptLink(ref);
  }, [user, profile]);

  // Redirect if user already has an org
  useEffect(() => {
    if (profile?.org_id) {
      navigate('/', { replace: true });
    }
  }, [profile, navigate]);

  const handleSignOut = async () => {
    localStorage.removeItem('selected_plan');
    await signOut();
    navigate('/auth', { replace: true });
  };

  // Show loading while auto-linking via referral
  if (isLinking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Setting up your account...</p>
      </div>
    );
  }

  // Referred client whose linking failed — show retry screen
  if (linkFailed && failedRef) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md bg-card/70 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/20">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-primary/10 rounded-xl ring-1 ring-primary/20">
                <FlaskConical className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">
              Almost There
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              We had a little trouble connecting your account. This usually fixes itself — try again below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full"
              onClick={() => {
                linkAttempted.current = false;
                attemptLink(failedRef);
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Button variant="outline" className="w-full" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out &amp; Try a Different Account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Self-service signup (user selected a plan from landing page) ──
  if (selectedPlan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse [animation-delay:1s]" />
        </div>

        <Card className="w-full max-w-md bg-card/70 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/20 relative z-10">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl ring-1 ring-primary/20">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">
              Set Up Your Business
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              {user?.email && (
                <span className="block text-xs mb-2">Signed in as {user.email}</span>
              )}
              Enter your company name to get started. Our AI Setup Assistant will help you configure everything.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <label htmlFor="company-name" className="text-sm font-medium text-foreground block mb-1.5">
                Company Name
              </label>
              <input
                id="company-name"
                type="text"
                placeholder="e.g. Pure Chain Aminos"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
                className="w-full rounded-lg border border-border/60 bg-background/80 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-shadow"
                autoFocus
                disabled={isCreatingOrg}
              />
            </div>

            <Button
              className="w-full bg-gradient-to-r from-primary to-[hsl(var(--gradient-to))] text-white border-0 hover:opacity-90 shadow-btn"
              onClick={handleCreateOrg}
              disabled={!companyName.trim() || isCreatingOrg}
            >
              {isCreatingOrg ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating your account...
                </>
              ) : (
                <>
                  Launch My Business
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              7-day free trial. No credit card required.
            </p>

            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={handleSignOut}>
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── No plan selected and no referral: invitation only ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse [animation-delay:1s]" />
      </div>

      <Card className="w-full max-w-md bg-card/70 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/20 relative z-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl ring-1 ring-primary/20">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Thanks for Your Interest
          </CardTitle>
          <CardDescription className="text-muted-foreground mt-2">
            {user?.email && (
              <span className="block text-xs mb-2">Signed in as {user.email}</span>
            )}
            ThePeptideAI is currently available by invitation only. Our team will reach out to set up your account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg border border-primary/20 bg-primary/[0.04] text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Need immediate assistance?
            </p>
            <a
              href="mailto:hello@thepeptideai.com?subject=Account Setup Request"
              className="text-primary hover:text-primary/80 font-medium text-sm underline underline-offset-2 transition-colors"
            >
              hello@thepeptideai.com
            </a>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate('/crm')}
          >
            Back to Home
          </Button>

          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
