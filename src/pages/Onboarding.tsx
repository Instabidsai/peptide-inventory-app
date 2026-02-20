import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, LogOut, FlaskConical, Building2, ArrowRight } from 'lucide-react';
import { linkReferral, consumeSessionReferral, storeSessionReferral } from '@/lib/link-referral';
import { useTenantConfig } from '@/hooks/use-tenant-config';

export default function Onboarding() {
  const [isLinking, setIsLinking] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const [failedRef, setFailedRef] = useState<{ refId: string; role: 'customer' | 'partner' } | null>(null);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const linkAttempted = useRef(false);
  const { brand_name: brandName } = useTenantConfig();

  // Check if user came from landing page with a selected plan
  const selectedPlan = sessionStorage.getItem('selected_plan');

  const attemptLink = (ref: { refId: string; role: 'customer' | 'partner' }) => {
    if (!user) return;
    setIsLinking(true);
    setLinkFailed(false);

    const email = user.email || '';
    const name = profile?.full_name || user.user_metadata?.full_name || email;

    linkReferral(user.id, email, name, ref.refId, ref.role).then(async (result) => {
      if (result.success) {
        await refreshProfile();
        toast({
          title: 'Welcome!',
          description: result.type === 'partner' ? 'Your partner account is ready!' : 'Your account has been connected.',
        });
        navigate(result.type === 'partner' ? '/partner' : '/store', { replace: true });
      } else {
        setIsLinking(false);
        setLinkFailed(true);
        setFailedRef(ref);
        storeSessionReferral(ref.refId, ref.role);
      }
    });
  };

  const handleCreateOrg = async () => {
    if (!companyName.trim() || !user) return;
    setIsCreatingOrg(true);

    try {
      const { data, error } = await supabase.functions.invoke('self-signup', {
        body: {
          org_name: companyName.trim(),
          plan_name: selectedPlan || '',
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Clear the selected plan from sessionStorage
      sessionStorage.removeItem('selected_plan');

      // Refresh profile to pick up the new org_id
      await refreshProfile();

      toast({
        title: 'Welcome aboard!',
        description: `${companyName.trim()} is ready to go.`,
      });

      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Self-signup error:', err);
      toast({
        variant: 'destructive',
        title: 'Setup failed',
        description: err.message || 'Could not create your organization. Please try again.',
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
    sessionStorage.removeItem('selected_plan');
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

  // ── Self-service signup: user selected a plan from the landing page ──
  if (selectedPlan) {
    const planDisplay = selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] animate-pulse [animation-delay:1s]" />
        </div>

        <Card className="w-full max-w-md bg-card/70 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/20 relative z-10">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-gradient-to-br from-primary/20 to-emerald-500/10 rounded-xl ring-1 ring-primary/20">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">
              Set Up Your Account
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              {user?.email && (
                <span className="block text-xs mb-1">Signed in as {user.email}</span>
              )}
              You selected the <span className="text-primary font-medium">{planDisplay}</span> plan.
              Enter your company name to get started.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                placeholder="e.g. Acme Peptides"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && companyName.trim()) handleCreateOrg();
                }}
                disabled={isCreatingOrg}
                autoFocus
              />
            </div>

            <Button
              className="w-full bg-gradient-to-r from-primary to-emerald-500 text-white hover:opacity-90"
              onClick={handleCreateOrg}
              disabled={!companyName.trim() || isCreatingOrg}
            >
              {isCreatingOrg ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating your workspace...
                </>
              ) : (
                <>
                  Create My Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              14-day free trial. No credit card required.
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

  // Default: user has no org and no referral — show friendly screen with sign out
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-[100px] animate-pulse [animation-delay:1s]" />
      </div>

      <Card className="w-full max-w-md bg-card/70 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/20 relative z-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl ring-1 ring-primary/20">
              <FlaskConical className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Welcome to {brandName}
          </CardTitle>
          <CardDescription className="text-muted-foreground mt-2">
            {user?.email
              ? `Signed in as ${user.email}`
              : 'Your account needs to be connected to a provider.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            If you received an invite link from your provider, please use that link to get set up. Otherwise, sign out and try again.
          </p>

          <Button
            className="w-full"
            onClick={async () => {
              // Try refreshing profile in case it was fixed server-side
              await refreshProfile();
              if (profile?.org_id) {
                navigate('/', { replace: true });
              } else {
                toast({ title: 'Not connected yet', description: 'Please use the invite link from your provider to get started.' });
              }
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh My Account
          </Button>

          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>

          <p className="text-center text-xs text-muted-foreground/50 mt-4">
            {brandName}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
