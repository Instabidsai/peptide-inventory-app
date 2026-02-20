import { useState, useEffect, useRef } from "react";
import { motion, useInView, useScroll, useTransform, useMotionValueEvent, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  FlaskConical,
  Menu,
  MessageSquare,
  Wand2,
  Rocket,
  Wrench,
  Thermometer,
  AlertTriangle,
  Bot,
  Blocks,
  Package,
  ShoppingCart,
  FileText,
  Building2,
  Shield,
  Zap,
  BarChart3,
  Bell,
  ArrowRight,
  Brain,
  Star,
  Quote,
  Truck,
  Users,
  Sparkles,
  Check,
  Lock,
  BadgeCheck,
  ChevronRight,
  Twitter,
  Linkedin,
  Github,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AiDemoChat } from "@/components/crm/AiDemoChat";
import { PricingCard } from "@/components/crm/PricingCard";
import { useSubscriptionPlans } from "@/hooks/use-subscription";

// ─── Helpers ──────────────────────────────────────────────────────
const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
};

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { type: "spring", stiffness: 100, damping: 20 },
};

/* Shimmer animation for premium CTA buttons */
const shimmerStyle: React.CSSProperties = {
  backgroundSize: "200% 100%",
  animation: "shimmer 2.5s ease-in-out infinite",
};

const shimmerKeyframes = `
@keyframes shimmer { 0%,100%{background-position:100% 0} 50%{background-position:0 0} }
@keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
@keyframes gradient-slide { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
`;

// ─── Animated Counter ────────────────────────────────────────────
function AnimatedCounter({
  target,
  suffix = "",
}: {
  target: number;
  suffix?: string;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const duration = 1800;
    const steps = 50;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [inView, target]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

// ─── Scroll Progress Bar ─────────────────────────────────────────
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const [progress, setProgress] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setProgress(v));

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-[3px]">
      <div
        className="h-full bg-gradient-to-r from-primary via-emerald-400 to-primary rounded-r-full transition-[width] duration-75"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Track active section via IntersectionObserver
  useEffect(() => {
    const ids = ["features", "ai-showcase", "pricing", "faq"];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const links = [
    { label: "Features", id: "features" },
    { label: "AI", id: "ai-showcase" },
    { label: "Pricing", id: "pricing" },
    { label: "FAQ", id: "faq" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border/40 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => scrollTo("hero")}
            className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
          >
            <FlaskConical className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">PeptideCRM</span>
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-6">
            {links.map((l) => (
              <button
                key={l.id}
                onClick={() => scrollTo(l.id)}
                className={`text-sm transition-colors relative ${
                  activeSection === l.id
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
                {activeSection === l.id && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => scrollTo("final-cta")}
            >
              Book Demo
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/auth?mode=signup&plan=free")}
              className="bg-gradient-to-r from-primary to-emerald-500 text-white border-0 hover:opacity-90 shadow-sm"
            >
              Start Free
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>

          {/* Mobile menu */}
          <div className="md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <div className="flex flex-col gap-4 mt-8">
                  {links.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        setMobileOpen(false);
                        setTimeout(() => scrollTo(l.id), 150);
                      }}
                      className="text-left text-lg text-foreground hover:text-primary transition-colors py-2"
                    >
                      {l.label}
                    </button>
                  ))}
                  <hr className="border-border/40 my-2" />
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMobileOpen(false);
                      scrollTo("final-cta");
                    }}
                  >
                    Book Demo
                  </Button>
                  <Button
                    onClick={() => navigate("/auth?mode=signup&plan=free")}
                  >
                    Start Free
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────
function Hero() {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const orbY1 = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const orbY2 = useTransform(scrollYProgress, [0, 1], [0, -50]);

  const heroMessages = [
    {
      role: "user" as const,
      text: 'Create a live dashboard for BPC-157 — show inventory by lot, expiry alerts, and a reorder button when stock drops below 200.',
    },
    {
      role: "ai" as const,
      text: "Your BPC-157 command dashboard is live! Real-time stock by lot, color-coded expiry alerts at 30/60/90 days, and one-click reorder buttons. I've also added it to your sidebar for quick access.",
    },
  ];

  const dashboardPreview = (
    <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          BPC-157 Command Dashboard
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
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
      ref={heroRef}
      id="hero"
      className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 overflow-hidden"
    >
      {/* Inject shimmer keyframes */}
      <style>{shimmerKeyframes}</style>
      {/* Animated gradient background orbs — parallax on scroll */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
      <motion.div
        className="absolute top-20 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none"
        style={{ y: orbY1 }}
        animate={{ x: [0, 30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-10 left-10 w-72 h-72 bg-emerald-500/8 rounded-full blur-[100px] pointer-events-none"
        style={{ y: orbY2 }}
        animate={{ x: [0, -20, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — copy */}
          <motion.div {...fadeInUp}>
            {/* Avatar social proof group */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex -space-x-2">
                {["SC", "MR", "EP", "JK"].map((initials, i) => (
                  <div key={initials} className={`w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-bold ${
                    i === 0 ? "bg-primary/30 text-primary" :
                    i === 1 ? "bg-emerald-500/30 text-emerald-400" :
                    i === 2 ? "bg-blue-500/30 text-blue-400" :
                    "bg-purple-500/30 text-purple-400"
                  }`}>
                    {initials}
                  </div>
                ))}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">4.9/5</span>
                </div>
                <span className="text-xs text-muted-foreground">Trusted by <strong className="text-foreground">1,200+</strong> peptide companies</span>
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
              Your AI-Powered{" "}
              <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
                Peptide Command Center
              </span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-lg leading-relaxed">
              Two AIs work for you: one{" "}
              <strong className="text-foreground">runs your CRM</strong> —
              answering questions, managing inventory, processing orders. The
              other{" "}
              <strong className="text-foreground">builds new features</strong>{" "}
              on demand — dashboards, automations, entire modules — in seconds.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={() => navigate("/auth?mode=signup&plan=free")}
                className="shadow-btn hover:shadow-btn-hover bg-gradient-to-r from-primary to-emerald-500 text-white border-0 hover:opacity-90 text-base px-8 py-3 h-auto"
                style={shimmerStyle}
              >
                Start Free — No Credit Card
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => scrollTo("ai-showcase")}
                className="text-base px-8 py-3 h-auto border-border/60 hover:border-primary/50"
              >
                Watch AI Build Live
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              14-day free trial. No credit card required.
            </p>
          </motion.div>

          {/* Right — animated chat */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
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
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── Trust Bar ────────────────────────────────────────────────────
function TrustBar() {
  const stats = [
    {
      icon: Users,
      value: 1200,
      suffix: "+",
      label: "Peptide Companies",
    },
    {
      icon: Package,
      value: 50000,
      suffix: "+",
      label: "Vials Tracked",
    },
    {
      icon: Zap,
      value: 10000,
      suffix: "+",
      label: "AI Features Built",
    },
    {
      icon: Shield,
      value: 99.9,
      suffix: "%",
      label: "Uptime SLA",
    },
  ];

  return (
    <section className="py-10 border-y border-border/30 bg-card/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Trusted by logos — infinite marquee */}
        <div className="relative mb-8 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-card/20 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-card/20 to-transparent z-10 pointer-events-none" />
          <div
            className="flex gap-12 opacity-40 whitespace-nowrap"
            style={{ animation: "marquee 25s linear infinite", width: "max-content" }}
          >
            {[...Array(2)].flatMap((_, dup) =>
              ["Pacific Compounding", "BioVantage", "NovaPeptide", "PeptideLogix", "ColdChain Rx", "VialTrack", "PeptideWorks", "BioFreeze Labs"].map((name) => (
                <div key={`${name}-${dup}`} className="flex items-center gap-1.5 shrink-0">
                  <FlaskConical className="w-4 h-4" />
                  <span className="text-xs font-semibold tracking-wide uppercase">{name}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <s.icon className="w-5 h-5 text-primary/70 mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">
                <AnimatedCounter
                  target={s.value}
                  suffix={s.suffix}
                />
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pain Points ──────────────────────────────────────────────────
function PainPoints() {
  const cards = [
    {
      icon: Wrench,
      title: "6+ Months of Customization",
      desc: "Generic CRMs like HubSpot and Salesforce need $50K+ in consulting and months of setup for peptide workflows. Our AI does it in seconds.",
      stat: "Save $50K+",
    },
    {
      icon: Thermometer,
      title: "No Peptide-Specific Features",
      desc: "Lot tracking, COA management, cold chain compliance, and expiry alerts don't exist in off-the-shelf tools. You'd need to build them from scratch.",
      stat: "200+ hours saved",
    },
    {
      icon: AlertTriangle,
      title: "Manual Processes Break at Scale",
      desc: "Spreadsheets and email threads crumble when you go from 50 to 500 orders per month. Our platform scales with you automatically.",
      stat: "10x faster setup",
    },
  ];

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-destructive uppercase tracking-wider mb-2 block">
            The Problem
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Why Generic CRMs Fail Peptide Companies
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Peptide businesses have unique needs that no general-purpose platform
            was built to handle.
          </p>
        </motion.div>
        <div className="grid sm:grid-cols-3 gap-6">
          {cards.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-card rounded-lg border border-border/60 p-6 shadow-card transition-all duration-300 hover:shadow-card-hover hover:scale-[1.02] hover:border-destructive/30"
            >
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
                <c.icon className="w-5 h-5 text-destructive" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{c.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                {c.desc}
              </p>
              <span className="inline-block text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                {c.stat}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      icon: MessageSquare,
      title: "Tell the AI What You Need",
      desc: 'Describe your workflow in plain English. "I need a reorder alert when BPC-157 drops below 500 vials."',
    },
    {
      icon: Wand2,
      title: "Watch It Build in Real Time",
      desc: "Our AI architect designs, codes, and deploys your custom feature — dashboards, automations, reports — in seconds.",
    },
    {
      icon: Rocket,
      title: "Use It Immediately",
      desc: "No waiting for dev sprints. Your feature is live, integrated into your CRM, and ready for your team.",
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-card/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-14">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            3 Simple Steps
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">How It Works</h2>
          <p className="mt-3 text-muted-foreground">
            Three steps from idea to live feature.
          </p>
        </motion.div>
        <div className="grid sm:grid-cols-3 gap-8 relative">
          {/* Connector line (desktop only) — animated gradient */}
          <div className="hidden sm:block absolute top-12 left-[16.5%] right-[16.5%] h-px overflow-hidden">
            <div
              className="h-full w-full"
              style={{
                background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.5), hsl(142 76% 36% / 0.5), hsl(var(--primary) / 0.5), transparent)",
                backgroundSize: "200% 100%",
                animation: "gradient-slide 3s ease-in-out infinite",
              }}
            />
          </div>

          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="text-center relative"
            >
              <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto mb-4 relative z-10">
                <s.icon className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xs font-medium text-primary mb-2 block">
                Step {i + 1}
              </span>
              <h3 className="font-semibold text-foreground mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                {s.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Two AI Brains ───────────────────────────────────────────────
function TwoAiBrains() {
  const brains = [
    {
      icon: Bot,
      title: "AI Operator",
      subtitle: "Runs Your Business",
      color: "emerald",
      features: [
        "Answers questions about inventory, orders, and clients",
        "Processes orders and generates shipping labels",
        "Monitors stock levels and sends alerts",
        "Creates reports and tracks compliance",
        "Manages customer communications",
      ],
    },
    {
      icon: Blocks,
      title: "AI Architect",
      subtitle: "Builds New Features",
      color: "primary",
      features: [
        "Creates custom dashboards from a description",
        "Builds new data modules and forms",
        "Sets up automations and workflows",
        "Generates custom reports with charts",
        "Adds fields, entities, and integrations",
      ],
    },
  ];

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            Dual AI Architecture
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Two AI Brains. One Powerful Platform.
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Most platforms give you a chatbot. We give you two specialized AIs
            that work together — one runs your day-to-day operations, the other
            builds exactly what you need.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto relative">
          {/* Connection line with pulse */}
          <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "2s" }} />
              <div className="relative w-12 h-12 rounded-full bg-background border-2 border-primary/40 flex items-center justify-center shadow-lg shadow-primary/20">
                <Brain className="w-5 h-5 text-primary" />
              </div>
            </div>
          </div>

          {brains.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, x: i === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className={`rounded-xl border p-6 ${
                i === 0
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-primary/30 bg-primary/5"
              }`}
            >
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
                  i === 0
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-primary/15 text-primary"
                }`}
              >
                <b.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {b.title}
              </h3>
              <p
                className={`text-sm font-medium mb-4 ${
                  i === 0 ? "text-emerald-400" : "text-primary"
                }`}
              >
                {b.subtitle}
              </p>
              <ul className="space-y-2">
                {b.features.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <Check
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        i === 0 ? "text-emerald-400" : "text-primary"
                      }`}
                    />
                    {feat}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features Bento ───────────────────────────────────────────────
function FeaturesBento() {
  const features = [
    {
      icon: Bot,
      title: "AI Chat Assistant",
      desc: "Ask anything about your peptides, protocols, or business metrics. Get instant, accurate answers.",
      hero: true,
    },
    {
      icon: Blocks,
      title: "AI Feature Builder",
      desc: "Describe what you need in plain English. The AI architect designs, builds, and deploys it live — dashboards, automations, entire modules.",
      hero: true,
    },
    {
      icon: Package,
      title: "Inventory & Lot Tracking",
      desc: "COA management, cold chain monitoring, expiry alerts, and multi-location stock levels.",
    },
    {
      icon: ShoppingCart,
      title: "Order & Fulfillment",
      desc: "Client portal, Stripe checkout, shipping label generation, and real-time delivery tracking.",
    },
    {
      icon: FileText,
      title: "Protocol Management",
      desc: "Build, assign, and track peptide protocols for clients. Dosing schedules and progress monitoring.",
    },
    {
      icon: Building2,
      title: "Multi-Tenant White Label",
      desc: "Your brand, your domain, your portal. Each tenant is fully isolated with custom branding.",
    },
  ];

  return (
    <section id="features" className="py-16 sm:py-24 bg-card/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            Platform
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Everything Your Peptide Business Needs
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Purpose-built features for peptide companies — plus an AI that
            builds whatever else you need.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className={`group relative overflow-hidden rounded-xl border border-border/60 p-6 bg-card shadow-card transition-all duration-300 hover:shadow-card-hover hover:scale-[1.01] ${
                f.hero
                  ? "sm:col-span-1 ring-1 ring-primary/20 hover:ring-primary/40 bg-gradient-to-br from-card to-primary/[0.03]"
                  : "hover:border-primary/30"
              }`}
            >
              {/* Glow effect on hover */}
              <div className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${
                    f.hero
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors"
                  }`}
                >
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground mb-1.5">
                  {f.title}
                  {f.hero && (
                    <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase">
                      AI
                    </span>
                  )}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {f.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── AI Showcase (6 demos) ───────────────────────────────────────
function AiShowcase() {
  const demos: Record<
    string,
    {
      label: string;
      icon: React.ElementType;
      messages: { role: "user" | "ai"; text: string }[];
      buildSteps: string[];
      result: React.ReactNode;
    }
  > = {
    dashboard: {
      label: "Dashboard",
      icon: BarChart3,
      messages: [
        {
          role: "user",
          text: "Build me a dashboard showing daily order volume and revenue by peptide.",
        },
        {
          role: "ai",
          text: "Your analytics dashboard is live with daily orders, revenue by peptide, and 30-day trends. It auto-refreshes every 5 minutes.",
        },
      ],
      buildSteps: [
        "Analyzing your data schema...",
        "Designing dashboard layout...",
        "Connecting live data feeds...",
        "Deploying widget...",
      ],
      result: (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">Revenue by Peptide</span>
            <span className="text-[10px] text-muted-foreground">
              Last 30 days
            </span>
          </div>
          <div className="space-y-1.5">
            {[
              { name: "BPC-157", pct: 85, amt: "$12,450" },
              { name: "TB-500", pct: 62, amt: "$9,100" },
              { name: "GHK-Cu", pct: 45, amt: "$6,600" },
              { name: "KPV", pct: 30, amt: "$4,400" },
            ].map((p) => (
              <div key={p.name} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-14 shrink-0">
                  {p.name}
                </span>
                <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full"
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-foreground w-14 text-right">
                  {p.amt}
                </span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    inventory: {
      label: "Inventory",
      icon: Package,
      messages: [
        {
          role: "user",
          text: "Show me all BPC-157 lots and let me adjust the stock count for LOT-2024-C.",
        },
        {
          role: "ai",
          text: "Here's your BPC-157 inventory by lot. LOT-2024-C is highlighted and editable — adjust the count directly. Changes sync across all systems instantly.",
        },
      ],
      buildSteps: [
        "Loading inventory records...",
        "Fetching lot details...",
        "Enabling inline editing...",
        "Ready for changes...",
      ],
      result: (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">BPC-157 Lot Inventory</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">
              Editing
            </span>
          </div>
          {[
            { lot: "LOT-2024-A", qty: 840, exp: "2026-08-15", active: false },
            { lot: "LOT-2024-B", qty: 620, exp: "2026-11-20", active: false },
            { lot: "LOT-2024-C", qty: 450, exp: "2027-01-10", active: true },
          ].map((row) => (
            <div
              key={row.lot}
              className={`flex items-center justify-between text-xs p-1.5 rounded ${
                row.active
                  ? "bg-primary/10 border border-primary/30"
                  : "bg-card/60"
              }`}
            >
              <span className="font-mono text-[10px]">{row.lot}</span>
              <span className={row.active ? "text-primary font-bold" : ""}>
                {row.active ? (
                  <span className="border-b border-primary/50 px-1">
                    {row.qty}
                  </span>
                ) : (
                  row.qty
                )}{" "}
                vials
              </span>
              <span className="text-muted-foreground text-[10px]">
                Exp: {row.exp}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    orders: {
      label: "Orders",
      icon: Truck,
      messages: [
        {
          role: "user",
          text: "Process order #4521 — charge the card, generate a shipping label, and notify the customer.",
        },
        {
          role: "ai",
          text: "Order #4521 complete! Payment captured ($347.00), USPS Priority label generated via Shippo, and customer notified with tracking number 9400111899223456789.",
        },
      ],
      buildSteps: [
        "Verifying order details...",
        "Processing payment via Stripe...",
        "Generating shipping label...",
        "Sending customer notification...",
      ],
      result: (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Order #4521</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
              Fulfilled
            </span>
          </div>
          <div className="space-y-1.5">
            {[
              {
                step: "Payment captured",
                detail: "$347.00 via Stripe",
                done: true,
              },
              {
                step: "Label generated",
                detail: "USPS Priority 2-Day",
                done: true,
              },
              {
                step: "Customer notified",
                detail: "Email + tracking sent",
                done: true,
              },
            ].map((s) => (
              <div
                key={s.step}
                className="flex items-center gap-2 text-[10px]"
              >
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-foreground">{s.step}</span>
                <span className="text-muted-foreground">— {s.detail}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    automate: {
      label: "Automate",
      icon: Bell,
      messages: [
        {
          role: "user",
          text: "Set up automatic reorder alerts when any peptide drops below 200 units.",
        },
        {
          role: "ai",
          text: "Automation active! When stock dips below 200, your team gets email + in-app alerts with a one-click reorder button. I'm monitoring all 24 peptide SKUs.",
        },
      ],
      buildSteps: [
        "Analyzing inventory thresholds...",
        "Creating automation rule...",
        "Configuring notifications...",
        "Activating real-time monitor...",
      ],
      result: (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs font-medium text-yellow-300">
              Reorder Alert
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 ml-auto">
              24 SKUs monitored
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">TB-500</strong> is at{" "}
            <strong className="text-yellow-400">147 units</strong> (threshold:
            200)
          </p>
          <div className="mt-2 flex gap-2">
            <span className="text-[10px] px-2 py-1 rounded bg-primary/20 text-primary cursor-pointer hover:bg-primary/30 transition-colors">
              Reorder Now
            </span>
            <span className="text-[10px] px-2 py-1 rounded bg-card text-muted-foreground cursor-pointer">
              Dismiss
            </span>
          </div>
        </div>
      ),
    },
    build: {
      label: "Build",
      icon: Blocks,
      messages: [
        {
          role: "user",
          text: 'Create a new "Protocols" module where I can build peptide dosing schedules and assign them to clients.',
        },
        {
          role: "ai",
          text: 'Your Protocols module is live! I created a database table with fields for peptide, dose, frequency, duration, and notes. Built the form, list view, and client assignment panel. It\'s in your sidebar under "Protocols".',
        },
      ],
      buildSteps: [
        "Designing data schema...",
        "Creating database table...",
        "Building UI components...",
        "Adding to navigation...",
      ],
      result: (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">
                Protocols Module
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">
              Just Created
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              "Peptide (select)",
              "Dose (mg)",
              "Frequency (select)",
              "Duration (weeks)",
              "Client (relation)",
              "Notes (text)",
            ].map((field) => (
              <div
                key={field}
                className="text-[10px] px-2 py-1 rounded bg-background/60 border border-border/30 text-muted-foreground"
              >
                {field}
              </div>
            ))}
          </div>
          <div className="flex gap-2 text-[9px]">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              Form ready
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              List view ready
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              In sidebar
            </span>
          </div>
        </div>
      ),
    },
    reports: {
      label: "Reports",
      icon: FileText,
      messages: [
        {
          role: "user",
          text: "Generate a monthly compliance report showing all COA expirations and cold chain events.",
        },
        {
          role: "ai",
          text: "Your compliance report is ready — COA status for all active lots, cold chain deviations flagged by severity, and an exportable PDF for auditors.",
        },
      ],
      buildSteps: [
        "Querying compliance data...",
        "Analyzing COA status...",
        "Generating charts...",
        "Compiling report...",
      ],
      result: (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              Compliance Report — Feb 2026
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
              Passed
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Active COAs", value: "24", ok: true },
              { label: "Expiring", value: "3", ok: false },
              { label: "Chain Events", value: "0", ok: true },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-card/80 rounded p-1.5 border border-border/30"
              >
                <p
                  className={`text-sm font-bold ${s.ok ? "text-emerald-400" : "text-yellow-400"}`}
                >
                  {s.value}
                </p>
                <p className="text-[9px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  };

  return (
    <section id="ai-showcase" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            The Differentiator
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Watch Your AI Control the Entire CRM
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Not just reports and dashboards — your AI manages inventory,
            processes orders, builds new modules, and automates workflows.
            Click each tab to see it in action.
          </p>
        </motion.div>

        <motion.div {...fadeInUp}>
          <Tabs defaultValue="dashboard" className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 max-w-2xl mx-auto mb-8 h-auto gap-1">
              {Object.entries(demos).map(([key, demo]) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="text-xs sm:text-sm px-2 py-2"
                >
                  <demo.icon className="w-3.5 h-3.5 mr-1 shrink-0" />
                  <span className="hidden sm:inline">{demo.label}</span>
                  <span className="sm:hidden">{demo.label.slice(0, 5)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {Object.entries(demos).map(([key, demo]) => (
              <TabsContent key={key} value={key}>
                <div className="max-w-2xl mx-auto">
                  <AiDemoChat
                    messages={demo.messages}
                    resultElement={demo.result}
                    buildSteps={demo.buildSteps}
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Testimonials ────────────────────────────────────────────────
function Testimonials() {
  const testimonials = [
    {
      quote:
        "We replaced Salesforce with PeptideCRM and saved $48K in the first year. The AI built our entire lot tracking system in 20 minutes — our Salesforce consultant quoted 6 weeks.",
      name: "Dr. Sarah Chen",
      title: "Director of Operations",
      company: "Pacific Compounding Pharmacy",
      stars: 5,
    },
    {
      quote:
        "I told the AI to create a reorder automation and it was live in 30 seconds. No tickets, no developers, no waiting. This is what every CRM should be.",
      name: "Marcus Rodriguez",
      title: "CEO",
      company: "BioVantage Peptides",
      stars: 5,
    },
    {
      quote:
        "The white-label feature means our clients think they're using our proprietary software. The dual-AI architecture is the real differentiator — one AI runs the show, the other builds new tools whenever we ask.",
      name: "Emily Park",
      title: "Founder",
      company: "NovaPeptide Distribution",
      stars: 5,
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-card/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Trusted by Peptide Leaders
          </h2>
          <p className="mt-3 text-muted-foreground">
            See why peptide companies are switching to AI-powered CRM.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-card rounded-xl border border-border/60 p-6 shadow-card flex flex-col transition-all duration-300 hover:shadow-card-hover hover:border-primary/20"
            >
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: t.stars }).map((_, si) => (
                  <Star
                    key={si}
                    className="w-4 h-4 fill-yellow-400 text-yellow-400"
                  />
                ))}
              </div>
              <Quote className="w-6 h-6 text-primary/30 mb-2" />
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                {t.quote}
              </p>
              <div className="mt-4 pt-4 border-t border-border/30 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? "bg-primary/20 text-primary" :
                  i === 1 ? "bg-emerald-500/20 text-emerald-400" :
                  "bg-blue-500/20 text-blue-400"
                }`}>
                  {t.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    {t.name}
                    <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t.title}, {t.company}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────
function Pricing() {
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  const navigate = useNavigate();
  const { data: plans } = useSubscriptionPlans();

  // Filter out free plan and sort
  const visiblePlans = (plans ?? [])
    .filter((p) => p.name !== "free" && p.active)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Fallback plans if DB isn't seeded
  const fallbackPlans = [
    {
      id: "1",
      name: "starter",
      display_name: "Starter",
      price_monthly: 9900,
      price_yearly: 99900,
      max_users: 5,
      max_peptides: 50,
      max_orders_per_month: 500,
      features: [
        "AI Chat Assistant",
        "Inventory management",
        "Order tracking",
        "5 user accounts",
        "Email support",
      ],
      stripe_monthly_price_id: null,
      stripe_yearly_price_id: null,
      sort_order: 1,
      active: true,
    },
    {
      id: "2",
      name: "professional",
      display_name: "Professional",
      price_monthly: 19900,
      price_yearly: 199900,
      max_users: 25,
      max_peptides: 200,
      max_orders_per_month: 2000,
      features: [
        "Everything in Starter",
        "AI Feature Builder",
        "Protocol management",
        "White-label branding",
        "Shipping integration",
        "Priority support",
      ],
      stripe_monthly_price_id: null,
      stripe_yearly_price_id: null,
      sort_order: 2,
      active: true,
    },
    {
      id: "3",
      name: "enterprise",
      display_name: "Enterprise",
      price_monthly: 49900,
      price_yearly: 499900,
      max_users: 999999,
      max_peptides: 999999,
      max_orders_per_month: 999999,
      features: [
        "Everything in Professional",
        "Unlimited users & peptides",
        "Custom AI integrations",
        "Dedicated account manager",
        "SLA guarantee",
        "Custom domain",
        "API access",
      ],
      stripe_monthly_price_id: null,
      stripe_yearly_price_id: null,
      sort_order: 3,
      active: true,
    },
  ];

  const displayPlans = visiblePlans.length > 0 ? visiblePlans : fallbackPlans;

  return (
    <section id="pricing" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-10">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Start free. Scale as you grow. No hidden fees. Every plan includes AI.
          </p>

          {/* Premium toggle */}
          <div className="mt-6 inline-flex items-center gap-1 bg-card/80 rounded-full p-1 border border-border/40 shadow-sm">
            <button
              onClick={() => setPeriod("monthly")}
              className={`text-sm px-5 py-2 rounded-full transition-all font-medium ${
                period === "monthly"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPeriod("yearly")}
              className={`text-sm px-5 py-2 rounded-full transition-all font-medium relative ${
                period === "yearly"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              <span className="absolute -top-2.5 -right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">
                -17%
              </span>
            </button>
          </div>
          {/* Guarantee */}
          <p className="mt-4 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            30-day money-back guarantee. Cancel anytime.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {displayPlans.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.12 }}
            >
              <PricingCard
                name={plan.name}
                displayName={plan.display_name}
                priceMonthly={plan.price_monthly}
                priceYearly={plan.price_yearly}
                billingPeriod={period}
                features={plan.features}
                maxUsers={plan.max_users}
                maxPeptides={plan.max_peptides}
                maxOrdersPerMonth={plan.max_orders_per_month}
                popular={plan.name === "professional"}
                ctaLabel={
                  plan.name === "enterprise"
                    ? "Contact Sales"
                    : "Start Free Trial"
                }
                onSelect={() => {
                  if (plan.name === "enterprise") {
                    scrollTo("final-cta");
                  } else {
                    navigate(`/auth?mode=signup&plan=${plan.name}`);
                  }
                }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────
function Faq() {
  const items = [
    {
      q: "What makes this different from HubSpot or Salesforce?",
      a: "PeptideCRM is purpose-built for peptide businesses — lot tracking, COA management, cold chain monitoring, and protocol management come built-in. But the real difference is the AI: where HubSpot charges $150/hour for consultant customization, our AI builds custom dashboards, automations, and entire modules in seconds from a plain-English description. Two AIs work together — one operates your CRM, one builds new features on demand.",
    },
    {
      q: "How does the AI actually control my entire CRM?",
      a: "The AI Operator has full access to your CRM data and actions. It can look up inventory levels, process orders, generate shipping labels, send customer notifications, create reports, and manage contacts — all through natural conversation. Ask it 'process order #4521 and notify the customer' and it handles every step: payment, label, email. The AI Architect goes further — it can create new database tables, build custom forms, set up automations, and add entirely new modules to your sidebar.",
    },
    {
      q: "Is my data secure? What about compliance?",
      a: "Every tenant is fully isolated with Row-Level Security — your data is invisible to other tenants. Data is encrypted at rest and in transit. We follow SOC2-ready practices and HIPAA-aware data handling for health-related records. Your peptide inventory, client data, and financial records are protected by enterprise-grade security.",
    },
    {
      q: "Can I import data from my current system?",
      a: "Yes. We support CSV imports for inventory, contacts, and orders. You can also tell the AI 'import my data from this spreadsheet' and it handles the mapping. If you're migrating from another CRM, our team helps with data migration. Enterprise plans include a dedicated onboarding specialist.",
    },
    {
      q: "What does the free trial include?",
      a: "The free trial gives you full access to Starter features for 14 days — AI chat assistant, inventory management, order tracking, and up to 2 users. No credit card required. You can upgrade to Professional (AI Feature Builder, white-label, protocols) or Enterprise (unlimited everything, custom domain, API access) at any time.",
    },
    {
      q: "Do you offer white-label and custom domains?",
      a: "Yes, on Professional and Enterprise plans. Customize your portal with your company logo, colors, and domain (e.g., app.yourcompany.com). Your clients see your brand, not ours. Each tenant is fully isolated — their experience is indistinguishable from custom-built software.",
    },
  ];

  return (
    <section id="faq" className="py-16 sm:py-24 bg-card/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-10">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            FAQ
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to know before getting started.
          </p>
        </motion.div>
        <motion.div {...fadeInUp}>
          <Accordion type="single" collapsible className="space-y-3">
            {items.map((item, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border border-border/40 rounded-lg bg-card px-4 data-[state=open]:border-primary/30 transition-colors"
              >
                <AccordionTrigger className="text-sm font-medium text-foreground hover:text-primary text-left gap-3">
                  <span className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                      {i + 1}
                    </span>
                    {item.q}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pl-9">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────
function FinalCta() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({ mode: "signup", plan: "free" });
    if (email) params.set("email", email);
    navigate(`/auth?${params.toString()}`);
  };

  return (
    <section id="final-cta" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          {...fadeInUp}
          className="relative rounded-2xl overflow-hidden"
          style={{ padding: "1px", background: "linear-gradient(135deg, hsl(var(--primary) / 0.5), hsl(var(--border) / 0.3) 40%, hsl(142 76% 36% / 0.5))" }}
        >
        <div className="rounded-[15px] bg-gradient-to-br from-primary/10 via-card to-card p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-[60px] pointer-events-none" />
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 mb-4 relative">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs font-medium text-yellow-300">
              Limited beta — 47 spots remaining
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground relative">
            Ready to Transform Your Peptide Business?
          </h2>
          <p className="mt-4 text-muted-foreground max-w-lg mx-auto relative">
            Join the peptide companies replacing spreadsheets and generic CRMs
            with an AI-powered command center that builds itself.
          </p>
          <form
            onSubmit={handleSubmit}
            className="mt-8 flex flex-col sm:flex-row gap-3 max-w-md mx-auto relative"
          >
            <input
              type="email"
              placeholder="you@peptidecompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-lg border border-border/60 bg-background/80 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 focus:shadow-[0_0_20px_hsl(var(--primary)/0.15)] transition-shadow"
            />
            <Button type="submit" className="shadow-btn hover:shadow-btn-hover">
              Start Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap justify-center gap-4 relative">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                window.location.href = "mailto:sales@peptidecrm.com?subject=Demo Request";
              }}
            >
              Book a Live Demo
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground relative">
            No credit card required. Set up in 2 minutes.
          </p>
        </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Sticky Mobile CTA ──────────────────────────────────────────
function StickyMobileCta() {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background/95 backdrop-blur-md border-t border-border/40 px-4 py-3"
        >
          <Button
            className="w-full shadow-btn bg-gradient-to-r from-primary to-emerald-500 text-white border-0"
            onClick={() => navigate("/auth?mode=signup&plan=free")}
          >
            Start Free — No Credit Card
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Footer ───────────────────────────────────────────────────────
function Footer() {
  const cols = [
    {
      title: "Product",
      links: [
        { label: "Features", action: () => scrollTo("features") },
        { label: "AI Builder", action: () => scrollTo("ai-showcase") },
        { label: "Pricing", action: () => scrollTo("pricing") },
        { label: "FAQ", action: () => scrollTo("faq") },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", action: () => {} },
        { label: "Blog", action: () => {} },
        { label: "Careers", action: () => {} },
        { label: "Contact", action: () => scrollTo("final-cta") },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", action: () => {} },
        { label: "Terms of Service", action: () => {} },
        { label: "Cookie Policy", action: () => {} },
      ],
    },
  ];

  return (
    <footer className="border-t border-border/30 py-12 pb-20 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical className="w-5 h-5 text-primary" />
              <span className="font-bold">PeptideCRM</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The AI-powered command center for peptide businesses. Two AIs,
              one platform, infinite possibilities.
            </p>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-foreground mb-3">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <button
                      onClick={l.action}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {l.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Security badges */}
        <div className="mt-8 flex flex-wrap justify-center gap-6">
          {[
            { icon: Shield, label: "SOC2 Ready" },
            { icon: Lock, label: "256-bit Encrypted" },
            { icon: BadgeCheck, label: "HIPAA Aware" },
          ].map((badge) => (
            <div key={badge.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <badge.icon className="w-3.5 h-3.5 text-emerald-400/70" />
              {badge.label}
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-border/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} PeptideCRM. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            {[
              { icon: Twitter, label: "Twitter" },
              { icon: Linkedin, label: "LinkedIn" },
              { icon: Github, label: "GitHub" },
            ].map((social) => (
              <button
                key={social.label}
                className="w-8 h-8 rounded-full bg-card border border-border/40 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
                aria-label={social.label}
              >
                <social.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function CrmLanding() {
  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ScrollProgress />
      <Nav />
      <Hero />
      <TrustBar />
      <PainPoints />
      <HowItWorks />
      <TwoAiBrains />
      <FeaturesBento />
      <AiShowcase />
      <Testimonials />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
      <StickyMobileCta />
    </div>
  );
}
