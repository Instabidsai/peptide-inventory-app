import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FlaskConical, Eye, EyeOff, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/sb_client/client';
import { Separator } from '@/components/ui/separator';
import { motion, AnimatePresence } from 'framer-motion';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

function LoginForm({
  onSubmit,
  onForgotPassword,
  isLoading
}: {
  onSubmit: (data: LoginFormData) => void;
  onForgotPassword: (email: string) => void;
  isLoading: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  className="bg-secondary border-border"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Password</FormLabel>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => onForgotPassword(form.getValues('email'))}
                >
                  Forgot password?
                </Button>
              </div>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="bg-secondary border-border pr-10"
                    autoComplete="current-password"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign In
        </Button>
      </form>
    </Form>
  );
}

function SignupForm({
  onSubmit,
  isLoading
}: {
  onSubmit: (data: SignupFormData) => void;
  isLoading: boolean;
}) {
  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', confirmPassword: '', fullName: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="John Doe"
                  className="bg-secondary border-border"
                  autoComplete="name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  className="bg-secondary border-border"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="••••••••"
                  className="bg-secondary border-border"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="••••••••"
                  className="bg-secondary border-border"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Account
        </Button>
      </form>
    </Form>
  );
}

/**
 * Link a newly authenticated user to a partner's org via referral.
 * Creates profile updates, user_role, and contact record.
 */
async function linkReferralUser(
  userId: string,
  email: string,
  fullName: string,
  referrerProfileId: string,
  inviteRole: 'customer' | 'partner' = 'customer',
) {
  // 1. Look up referrer's profile for org_id
  const { data: referrer } = await supabase
    .from('profiles')
    .select('id, org_id, full_name')
    .eq('id', referrerProfileId)
    .maybeSingle();

  if (!referrer?.org_id) return false;

  const isPartner = inviteRole === 'partner';
  const appRole = isPartner ? 'sales_rep' : 'client';

  // 2. Update new user's profile
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

  const { error: profileErr } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('user_id', userId);

  if (profileErr) {
    console.error('Referral: profile update failed', profileErr);
    return false;
  }

  // 3. Create user_role
  await supabase.from('user_roles').upsert({
    user_id: userId,
    org_id: referrer.org_id,
    role: appRole,
  }, { onConflict: 'user_id,org_id' });

  // 4. Create contact record linked to referrer
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('linked_user_id', userId)
    .eq('org_id', referrer.org_id)
    .maybeSingle();

  if (!existingContact) {
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

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { signIn, signUp, user, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const referralHandled = useRef(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  // Detect referral param from URL or sessionStorage (persists across Google OAuth redirect)
  const refParam = searchParams.get('ref') || sessionStorage.getItem('partner_ref');
  const roleParam = (searchParams.get('role') || sessionStorage.getItem('partner_ref_role') || 'customer') as 'customer' | 'partner';
  const isPartnerInvite = roleParam === 'partner';

  // Auto-switch to signup mode when coming via referral link
  useEffect(() => {
    if (refParam && mode === 'login') {
      setMode('signup');
    }
  }, [refParam]);

  // Handle referral linking for already-authenticated users (Google OAuth return, or login with ref)
  useEffect(() => {
    if (!loading && user && profile && refParam && !referralHandled.current) {
      // If user already has an org, just redirect normally
      if (profile.org_id) {
        sessionStorage.removeItem('partner_ref');
        navigate(from, { replace: true });
        return;
      }

      // User has no org — link them via referral
      referralHandled.current = true;
      const email = user.email || '';
      const name = profile.full_name || user.user_metadata?.full_name || email;

      linkReferralUser(user.id, email, name, refParam, roleParam).then(async (result) => {
        sessionStorage.removeItem('partner_ref');
        sessionStorage.removeItem('partner_ref_role');
        if (result) {
          await refreshProfile();
          toast({ title: 'Welcome!', description: result === 'partner' ? 'Your partner account is ready.' : 'Your account has been connected.' });
          navigate(result === 'partner' ? '/partner' : '/store', { replace: true });
        } else {
          navigate('/onboarding', { replace: true });
        }
      });
      return;
    }

    // Normal redirect (no referral)
    if (!loading && user) {
      if (profile?.org_id) {
        navigate(from, { replace: true });
      } else if (!refParam) {
        navigate('/onboarding', { replace: true });
      }
    }
  }, [loading, user, profile, navigate, from, refParam]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    const { error } = await signIn(data.email, data.password);
    setIsLoading(false);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Login failed',
        description: error.message === 'Invalid login credentials'
          ? 'Invalid email or password. Please try again.'
          : error.message,
      });
    }
  };

  const handleSignup = async (data: SignupFormData) => {
    setIsLoading(true);
    const { error } = await signUp(data.email, data.password, data.fullName);

    if (error) {
      setIsLoading(false);
      let message = error.message;
      if (error.message.includes('already registered')) {
        message = 'This email is already registered. Please log in instead.';
      }
      toast({
        variant: 'destructive',
        title: 'Signup failed',
        description: message,
      });
      return;
    }

    // If referral param exists, try to link immediately
    if (refParam) {
      // Get the just-created user
      const { data: { user: newUser } } = await supabase.auth.getUser();
      if (newUser) {
        const result = await linkReferralUser(newUser.id, data.email, data.fullName, refParam, roleParam);
        sessionStorage.removeItem('partner_ref');
        sessionStorage.removeItem('partner_ref_role');
        if (result) {
          await refreshProfile();
          setIsLoading(false);
          toast({ title: 'Welcome!', description: result === 'partner' ? 'Your partner account is ready!' : 'Your account has been created and connected.' });
          navigate(result === 'partner' ? '/partner' : '/store', { replace: true });
          return;
        }
      }
    }

    setIsLoading(false);
    toast({
      title: 'Account created!',
      description: 'Please check your email to confirm your account, or log in if email confirmation is disabled.',
    });
    setMode('login');
  };

  const handleForgotPassword = async (email: string) => {
    if (!email) {
      toast({
        variant: 'destructive',
        title: 'Email required',
        description: 'Please enter your email address first, then click "Forgot password?"',
      });
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/update-password`,
    });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Reset failed',
        description: error.message,
      });
    } else {
      toast({
        title: 'Reset email sent',
        description: 'Check your inbox for a password reset link.',
      });
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    // Persist referral params across OAuth redirect
    if (refParam) {
      sessionStorage.setItem('partner_ref', refParam);
      sessionStorage.setItem('partner_ref_role', roleParam);
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setIsGoogleLoading(false);
      toast({
        variant: 'destructive',
        title: 'Google sign in failed',
        description: error.message,
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-[100px] animate-pulse [animation-delay:1s]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="bg-card/70 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/20">
          <CardHeader className="text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 15 }}
              className="flex justify-center mb-4"
            >
              <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl ring-1 ring-primary/20 glow-primary">
                <FlaskConical className="h-8 w-8 text-primary" />
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <CardTitle className="text-2xl font-bold text-foreground">
                {refParam
                  ? isPartnerInvite ? 'Join as a Partner' : "You've Been Invited"
                  : mode === 'login' ? 'Welcome Back' : 'Create Account'}
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-1">
                {refParam
                  ? isPartnerInvite
                    ? 'Create your partner account to start earning'
                    : 'Create an account to access exclusive partner pricing'
                  : mode === 'login'
                    ? 'Sign in to your peptide inventory account'
                    : 'Get started with your inventory tracker'}
              </CardDescription>
            </motion.div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Referral banner */}
            {refParam && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-violet-500/20 bg-violet-500/[0.06]">
                <UserPlus className="h-4 w-4 text-violet-400 shrink-0" />
                <p className="text-xs text-violet-300">
                  {isPartnerInvite
                    ? 'Sign up to join as a partner — you\'ll get your own store, referral link, and commissions.'
                    : 'Sign up to get connected with your partner and access the store.'}
                </p>
              </div>
            )}

            {/* Google Sign In Button */}
            <Button
              type="button"
              variant="outline"
              className="w-full hover:bg-secondary/80 transition-all"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading}
            >
              {isGoogleLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              Continue with Google
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card/70 px-4 text-muted-foreground/80 font-medium">Or continue with email</span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: mode === 'login' ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === 'login' ? 10 : -10 }}
                transition={{ duration: 0.2 }}
              >
                {mode === 'login' ? (
                  <LoginForm onSubmit={handleLogin} onForgotPassword={handleForgotPassword} isLoading={isLoading} />
                ) : (
                  <SignupForm onSubmit={handleSignup} isLoading={isLoading} />
                )}
              </motion.div>
            </AnimatePresence>
          </CardContent>

          <CardFooter className="flex justify-center">
            <Button
              variant="link"
              className="text-muted-foreground hover:text-primary transition-colors"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </Button>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-muted-foreground/50 mt-4">
          Peptide Inventory Tracker v2.7
        </p>
      </motion.div>
    </div>
  );
}
