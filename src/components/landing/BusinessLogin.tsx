import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, Loader2, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/sb_client/client";
import { fadeInUp } from "./constants";

export function BusinessLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);
    if (error) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message,
      });
    } else {
      navigate("/");
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setIsGoogleLoading(false);
      toast({
        variant: "destructive",
        title: "Google sign in failed",
        description: error.message,
      });
    }
  };

  return (
    <section className="py-16 sm:py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] to-transparent pointer-events-none" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — copy */}
          <motion.div {...fadeInUp}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <span className="text-sm font-medium text-primary">Already a customer?</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
              Business Login
            </h2>
            <p className="mt-3 text-muted-foreground max-w-md leading-relaxed">
              Sign in to access your organization's dashboard, manage inventory, track orders, and run your entire peptide business.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 border border-border/40">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Real-time inventory
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 border border-border/40">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Order management
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 border border-border/40">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                AI assistant
              </span>
            </div>
          </motion.div>

          {/* Right — login form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl shadow-black/10 p-6 sm:p-8 max-w-md mx-auto lg:ml-auto">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="biz-email" className="block text-sm font-medium text-foreground mb-1.5">
                    Email
                  </label>
                  <Input
                    id="biz-email"
                    type="email"
                    placeholder="you@yourbusiness.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label htmlFor="biz-password" className="block text-sm font-medium text-foreground mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="biz-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-[hsl(var(--gradient-to))] text-white border-0 hover:opacity-90"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  Sign In
                </Button>
              </form>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/40" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card/70 px-3 text-xs text-muted-foreground">or</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full border-border/60 hover:border-primary/40"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                Continue with Google
              </Button>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                Don't have an account?{" "}
                <button
                  onClick={() => navigate("/get-started")}
                  className="text-primary hover:underline font-medium"
                >
                  Start your business
                </button>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
