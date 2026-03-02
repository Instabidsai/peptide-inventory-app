import { useState, useEffect, lazy, Suspense, startTransition, Component, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ChevronRight, Lock, FlaskConical, TrendingUp, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeInUp, shimmerStyle, shimmerKeyframes, scrollTo } from "./constants";

const MoleculeScene = lazy(() =>
  import("./3d/MoleculeScene")
    .then(m => ({ default: m.MoleculeScene }))
    .catch(() => ({ default: (() => null) as React.FC }))
);

class Scene3DErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() { /* decorative 3D — swallow silently */ }
  render() { return this.state.hasError ? null : this.props.children; }
}

function tryReload(): boolean {
  const key = 'chunk_reload';
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last > 30_000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
    return true;
  }
  return false;
}
function retryImport<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    if (tryReload()) return new Promise<never>(() => {});
    throw err;
  });
}
const AiDemoChat = lazy(() => retryImport(() => import("@/components/crm/AiDemoChat").then(m => ({ default: m.AiDemoChat }))));
const LiveBuildPreview = lazy(() => retryImport(() => import("@/components/crm/LiveBuildPreview").then(m => ({ default: m.LiveBuildPreview }))));

const ROTATING_WORDS = ["Inventory", "Orders", "Fulfillment", "Commissions", "Client Health", "Compliance"];

export function Hero() {
  const navigate = useNavigate();
  const [wordIdx, setWordIdx] = useState(0);
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIdx((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  // Defer heavy demo chat mount to after initial paint to avoid a single long task.
  // startTransition lets React break the render into smaller chunks (concurrent mode).
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(() => startTransition(() => setShowDemo(true)), { timeout: 1500 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(() => startTransition(() => setShowDemo(true)), 100);
    return () => clearTimeout(id);
  }, []);

  const heroMessages = [
    {
      role: "user" as const,
      text: 'Create a live dashboard for BPC-157 — show inventory by lot, expiry alerts, and reorder buttons.',
    },
    {
      role: "ai" as const,
      text: "Dashboard is live — 2,450 vials across 8 lots. LOT-2024-A expires in 28 days, flagged amber. Reorder buttons active. Added to your sidebar.",
    },
    {
      role: "user" as const,
      text: "What's my top seller this month?",
    },
    {
      role: "ai" as const,
      text: "BPC-157 leads at $12,450 (340 vials), then TB-500 at $9,100. BPC-157 is up 18% vs last month.",
    },
    {
      role: "user" as const,
      text: "TB-500 is getting low. Set up a reorder alert at 200 units.",
    },
    {
      role: "ai" as const,
      text: "Done — TB-500 alert is live. Current stock: 147 units, so you'll get notified immediately. I've also drafted a PO for your top supplier.",
    },
  ];

  const dashboardPreview = (
    <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          BPC-157 Command Dashboard
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">
          Live
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "In Stock", value: "2,450", sub: "vials" },
          { label: "Expiring <30d", value: "120", sub: "vials" },
          { label: "Active Lots", value: "8", sub: "tracked" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-card/80 rounded p-2 border border-border/30"
          >
            <p className="text-lg font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">
              {s.label} ({s.sub})
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {["LOT-A", "LOT-B", "LOT-C"].map((lot) => (
            <span
              key={lot}
              className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
            >
              {lot}
            </span>
          ))}
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
          Reorder TB-500
        </span>
      </div>
    </div>
  );

  return (
    <section
      id="hero"
      className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 overflow-hidden"
    >
      {/* Inject shimmer + orb keyframes */}
      <style>{shimmerKeyframes}{`
        @keyframes orb-drift-right { 0%,100%{transform:translateX(0)} 50%{transform:translateX(30px)} }
        @keyframes orb-drift-left  { 0%,100%{transform:translateX(0)} 50%{transform:translateX(-20px)} }
      `}</style>
      {/* Animated gradient background orbs — parallax on scroll */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div
        className="absolute top-20 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none will-change-transform animate-[orb-drift-right_8s_ease-in-out_infinite]"
      />
      <div
        className="absolute bottom-10 left-10 w-72 h-72 bg-primary/[0.08] rounded-full blur-[100px] pointer-events-none will-change-transform animate-[orb-drift-left_10s_ease-in-out_infinite]"
      />
      {/* 3D molecule background — hidden on mobile for performance */}
      <div className="hidden lg:block absolute inset-0 pointer-events-none opacity-40">
        <Scene3DErrorBoundary>
          <Suspense fallback={null}>
            <MoleculeScene />
          </Suspense>
        </Scene3DErrorBoundary>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — copy */}
          <motion.div {...fadeInUp}>
            {/* Industry badge */}
            <div className="flex items-center gap-2 mb-6">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <img src="/logo.png" alt="Logo" className="w-3.5 h-3.5 object-contain" />
                <span className="text-xs font-medium text-primary">Purpose-Built for the Peptide Industry</span>
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
              Your AI-Powered{" "}
              <span className="bg-gradient-to-r from-primary to-[hsl(var(--gradient-to))] bg-clip-text text-transparent">
                Peptide Command Center
              </span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-lg leading-relaxed">
              One AI that{" "}
              <strong className="text-foreground">runs your entire business</strong> —{" "}
              <span className="inline-block w-[130px] text-left align-bottom">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={ROTATING_WORDS[wordIdx]}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                    className="inline-block text-primary font-semibold"
                  >
                    {ROTATING_WORDS[wordIdx]}
                  </motion.span>
                </AnimatePresence>
              </span>{" "}
              and more — and{" "}
              <strong className="text-foreground">builds new features on demand</strong>.
              Dashboards, automations, entire modules — in minutes, not months.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={() => {
                  localStorage.setItem("selected_plan", "professional");
                  navigate("/get-started");
                }}
                className="shadow-btn hover:shadow-btn-hover bg-gradient-to-r from-primary to-[hsl(var(--gradient-to))] text-white border-0 hover:opacity-90 text-base px-8 py-3 h-auto"
                style={shimmerStyle}
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => scrollTo("ai-showcase")}
                className="text-base px-8 py-3 h-auto border-border/60 hover:border-primary/50"
              >
                See It In Action
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Built for peptide businesses. $799/mo — 7-day free trial.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 border border-border/40">
                <FlaskConical className="w-3 h-3 text-primary" />
                100+ features built
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 border border-border/40">
                <TrendingUp className="w-3 h-3 text-primary" />
                20+ peptide workflows
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 border border-border/40">
                <Shield className="w-3 h-3 text-primary" />
                100% data isolation
              </span>
            </div>
          </motion.div>

          {/* Right — animated chat */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="h-[400px] overflow-hidden"
          >
            {showDemo ? (
              <Suspense fallback={<div className="h-[400px] rounded-xl bg-card/80 animate-pulse" />}>
                <AiDemoChat
                  messages={heroMessages}
                  resultElement={dashboardPreview}
                  loop
                  typingSpeed={22}
                  buildSteps={[
                    "Analyzing inventory schema...",
                    "Designing dashboard layout...",
                    "Connecting live data feeds...",
                    "Deploying to your CRM...",
                  ]}
                  buildPreview={(phase) => <LiveBuildPreview phase={phase} variant="dashboard" />}
                />
              </Suspense>
            ) : (
              <div className="h-[400px] rounded-xl bg-card/80 animate-pulse" />
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
