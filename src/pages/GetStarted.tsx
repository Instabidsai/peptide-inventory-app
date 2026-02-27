import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FlaskConical, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/sb_client/client';
import { Separator } from '@/components/ui/separator';
import { motion, AnimatePresence } from 'framer-motion';

/*
 * /get-started — Dedicated SaaS signup page.
 * Completely separate from /auth (internal app login).
 * Landing page CTAs point here. After auth, routes to /onboarding
 * which picks up `selected_plan` from localStorage.
 */

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  agreedToTerms: z.literal(true, { errorMap: () => ({ message: 'You must agree to the terms' }) }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { score: 20, label: 'Weak', color: 'bg-red-500' };
  if (score <= 2) return { score: 40, label: 'Fair', color: 'bg-orange-500' };
  if (score <= 3) return { score: 60, label: 'Good', color: 'bg-yellow-500' };
  if (score <= 4) return { score: 80, label: 'Strong', color: 'bg-primary' };
  return { score: 100, label: 'Very Strong', color: 'bg-primary' };
}

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

export default function GetStarted() {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp, user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Ensure selected_plan is always set for SaaS flow
  useEffect(() => {
    if (!localStorage.getItem('selected_plan')) {
      localStorage.setItem('selected_plan', 'professional');
    }
  }, []);

  // Redirect authenticated users
  useEffect(() => {
    if (loading || !user) return;

    if (profile?.org_id) {
      // Already has a business set up — go to their dashboard
      navigate('/', { replace: true });
    } else if (profile) {
      // Authenticated but no org — send to onboarding to create one
      navigate('/onboarding', { replace: true });
    }
  }, [loading, user, profile, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user is logged in, show a brief loading state while redirect useEffect fires
  if (user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Setting up your account...</p>
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
    // On success, useEffect above handles redirect
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

    setIsLoading(false);
    toast({
      title: 'Account created!',
      description: 'Check your email to confirm, then log in to set up your business.',
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
      toast({ variant: 'destructive', title: 'Reset failed', description: error.message });
    } else {
      toast({ title: 'Reset email sent', description: 'Check your inbox for a password reset link.' });
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    // Ensure plan is set before OAuth redirect (localStorage survives new tabs)
    localStorage.setItem('selected_plan', 'professional');

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setIsGoogleLoading(false);
      toast({ variant: 'destructive', title: 'Google sign in failed', description: error.message });
    }
  };

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', confirmPassword: '', fullName: '', agreedToTerms: false as unknown as true },
  });

  const watchPassword = signupForm.watch('password');
  const strength = watchPassword ? getPasswordStrength(watchPassword) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse [animation-delay:1s]" />
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
              <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl ring-1 ring-primary/20">
                <FlaskConical className="h-8 w-8 text-primary" />
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <CardTitle className="text-2xl font-bold text-foreground">
                {mode === 'signup' ? 'Start Your Business' : 'Welcome Back'}
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-1">
                {mode === 'signup'
                  ? 'Create your account to get started — 7-day free trial, no credit card required'
                  : 'Sign in to continue setting up your business'}
              </CardDescription>
            </motion.div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Google Sign In */}
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
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
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
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="you@example.com" className="bg-secondary border-border/60" autoComplete="email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Password</FormLabel>
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 text-xs text-muted-foreground"
                                onClick={() => handleForgotPassword(loginForm.getValues('email'))}
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
                                  {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full bg-gradient-to-r from-primary to-[hsl(var(--gradient-to))] text-white border-0 hover:opacity-90" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Sign In
                      </Button>
                    </form>
                  </Form>
                ) : (
                  <Form {...signupForm}>
                    <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
                      <FormField
                        control={signupForm.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input placeholder="John Doe" className="bg-secondary border-border/60" autoComplete="name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="you@company.com" className="bg-secondary border-border/60" autoComplete="email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" className="bg-secondary border-border/60" autoComplete="new-password" {...field} />
                            </FormControl>
                            {strength && (
                              <div className="space-y-1 pt-1">
                                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-300 ${strength.color}`} style={{ width: `${strength.score}%` }} />
                                </div>
                                <p className="text-[11px] text-muted-foreground">{strength.label}</p>
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" className="bg-secondary border-border/60" autoComplete="new-password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="agreedToTerms"
                        render={({ field }) => (
                          <FormItem>
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.value === true}
                                onChange={(e) => field.onChange(e.target.checked ? true : false)}
                                className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                              />
                              <span className="text-xs text-muted-foreground leading-tight">
                                I agree to the{' '}
                                <a href="/#/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Terms of Service</a>
                                {' '}and{' '}
                                <a href="/#/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a>
                              </span>
                            </label>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full bg-gradient-to-r from-primary to-[hsl(var(--gradient-to))] text-white border-0 hover:opacity-90" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Start Free Trial
                      </Button>
                    </form>
                  </Form>
                )}
              </motion.div>
            </AnimatePresence>
          </CardContent>

          <CardFooter className="flex flex-col items-center gap-2">
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
          <button onClick={() => navigate('/crm')} className="text-primary/70 hover:text-primary transition-colors underline underline-offset-2">
            <ArrowLeft className="w-3 h-3 inline mr-1" />
            Back to Home
          </button>
        </p>
      </motion.div>
    </div>
  );
}
