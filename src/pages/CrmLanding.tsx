import { useState, useEffect } from "react";
import { motion } from "framer-motion";
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
  transition: { duration: 0.5, ease: "easeOut" },
};

const stagger = {
  whileInView: { transition: { staggerChildren: 0.1 } },
  viewport: { once: true },
};

// ─── Nav ──────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
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
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {l.label}
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
            >
              Start Free
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

  const heroMessages = [
    {
      role: "user" as const,
      text: 'Create a dashboard showing BPC-157 inventory with expiry alerts',
    },
    {
      role: "ai" as const,
      text: "Building your inventory dashboard with expiry tracking... Done! You now have real-time BPC-157 stock levels, lot-by-lot expiry dates, and automatic alerts at 30/60/90 days.",
    },
  ];

  const dashboardPreview = (
    <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          BPC-157 Inventory
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
          Live
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "In Stock", value: "2,450", sub: "vials" },
          { label: "Expiring <30d", value: "120", sub: "vials" },
          { label: "Lots", value: "8", sub: "active" },
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
      <div className="flex gap-1.5">
        {["LOT-2024-A", "LOT-2024-B", "LOT-2024-C"].map((lot) => (
          <span
            key={lot}
            className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
          >
            {lot}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <section
      id="hero"
      className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 overflow-hidden"
    >
      {/* Gradient bg */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-20 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — copy */}
          <motion.div {...fadeInUp}>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
              Your AI-Powered{" "}
              <span className="text-primary">Peptide Command Center</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-lg leading-relaxed">
              Tell your AI what you need. Watch it build custom tools for your
              peptide business — inventory, orders, protocols, and compliance —
              in real time.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={() => navigate("/auth?mode=signup&plan=free")}
                className="shadow-btn hover:shadow-btn-hover"
              >
                Start Free — No Credit Card
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => scrollTo("ai-showcase")}
              >
                Watch Demo
              </Button>
            </div>
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
              typingSpeed={25}
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
    { icon: Zap, text: "4 Plan Tiers" },
    { icon: Bot, text: "AI-Powered" },
    { icon: Shield, text: "SOC2 Ready" },
    { icon: FileText, text: "HIPAA Aware" },
  ];

  return (
    <section className="py-10 border-y border-border/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Trusted by peptide researchers, compounding pharmacies, and
          distributors
        </p>
        <div className="flex flex-wrap justify-center gap-6 sm:gap-10">
          {stats.map((s) => (
            <div
              key={s.text}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <s.icon className="w-4 h-4 text-primary/70" />
              <span className="text-sm font-medium">{s.text}</span>
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
      title: "Months of Customization",
      desc: "Generic CRMs like HubSpot and Salesforce need expensive consultants and months of setup for peptide workflows.",
    },
    {
      icon: Thermometer,
      title: "No Peptide-Specific Features",
      desc: "Lot tracking, COA management, cold chain compliance, and expiry alerts don't exist in off-the-shelf tools.",
    },
    {
      icon: AlertTriangle,
      title: "Manual Processes Break at Scale",
      desc: "Spreadsheets and email threads crumble when you go from 50 to 500 orders per month.",
    },
  ];

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground">
            The Problem with Generic CRMs
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
              className="bg-card rounded-lg border border-border/60 p-6 shadow-card"
            >
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
                <c.icon className="w-5 h-5 text-destructive" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{c.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {c.desc}
              </p>
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
          <h2 className="text-3xl font-bold text-foreground">How It Works</h2>
          <p className="mt-3 text-muted-foreground">
            Three steps from idea to live feature.
          </p>
        </motion.div>
        <div className="grid sm:grid-cols-3 gap-8 relative">
          {/* Connector line (desktop only) */}
          <div className="hidden sm:block absolute top-12 left-[16.5%] right-[16.5%] h-px bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0" />

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
      desc: "Describe what you need in plain English. A second AI architect designs and builds it live — dashboards, automations, reports.",
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
    <section id="features" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground">
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
              className={`rounded-xl border border-border/60 p-6 bg-card shadow-card hover:shadow-card-hover transition-shadow ${
                f.hero ? "sm:col-span-1 ring-1 ring-primary/20" : ""
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${
                  f.hero
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
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
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── AI Showcase ──────────────────────────────────────────────────
function AiShowcase() {
  const demos: Record<
    string,
    {
      messages: { role: "user" | "ai"; text: string }[];
      result: React.ReactNode;
    }
  > = {
    dashboard: {
      messages: [
        {
          role: "user",
          text: "Build me a dashboard that shows daily order volume and revenue by peptide.",
        },
        {
          role: "ai",
          text: "I've created your analytics dashboard with daily order counts, revenue breakdown by peptide, and a trend line for the past 30 days. It auto-refreshes every 5 minutes.",
        },
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
    automate: {
      messages: [
        {
          role: "user",
          text: "Set up automatic reorder alerts when any peptide drops below 200 units.",
        },
        {
          role: "ai",
          text: "Done! I've configured threshold alerts for all peptides at 200 units. When stock dips below, your team gets email + in-app notifications with a one-click reorder button.",
        },
      ],
      result: (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs font-medium text-yellow-300">
              Reorder Alert
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">TB-500</strong> is at{" "}
            <strong className="text-yellow-400">147 units</strong> (threshold:
            200)
          </p>
          <div className="mt-2 flex gap-2">
            <span className="text-[10px] px-2 py-1 rounded bg-primary/20 text-primary cursor-pointer">
              Reorder Now
            </span>
            <span className="text-[10px] px-2 py-1 rounded bg-card text-muted-foreground cursor-pointer">
              Dismiss
            </span>
          </div>
        </div>
      ),
    },
    reports: {
      messages: [
        {
          role: "user",
          text: "Generate a monthly compliance report showing all COA expirations and cold chain events.",
        },
        {
          role: "ai",
          text: "Your compliance report is ready — it includes COA status for all active lots, cold chain deviations flagged by severity, and an exportable PDF for auditors.",
        },
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
    <section id="ai-showcase" className="py-16 sm:py-24 bg-card/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            The Differentiator
          </span>
          <h2 className="text-3xl font-bold text-foreground">
            Your AI Builds Custom Features on Demand
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            No feature requests. No dev tickets. Describe what you want and
            watch it appear.
          </p>
        </motion.div>

        <motion.div {...fadeInUp}>
          <Tabs defaultValue="dashboard" className="w-full">
            <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto mb-8">
              <TabsTrigger value="dashboard">
                <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="automate">
                <Bell className="w-3.5 h-3.5 mr-1.5" />
                Automate
              </TabsTrigger>
              <TabsTrigger value="reports">
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Reports
              </TabsTrigger>
            </TabsList>
            {Object.entries(demos).map(([key, demo]) => (
              <TabsContent key={key} value={key}>
                <div className="max-w-2xl mx-auto">
                  <AiDemoChat
                    messages={demo.messages}
                    resultElement={demo.result}
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
          <h2 className="text-3xl font-bold text-foreground">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-3 text-muted-foreground">
            Start free. Scale as you grow. No hidden fees.
          </p>

          {/* Toggle */}
          <div className="mt-6 inline-flex items-center gap-3 bg-card rounded-full p-1 border border-border/40">
            <button
              onClick={() => setPeriod("monthly")}
              className={`text-sm px-4 py-1.5 rounded-full transition-all ${
                period === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPeriod("yearly")}
              className={`text-sm px-4 py-1.5 rounded-full transition-all ${
                period === "yearly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              <span className="ml-1.5 text-[10px] font-medium text-emerald-400">
                Save ~17%
              </span>
            </button>
          </div>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {displayPlans.map((plan) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
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
      a: "PeptideCRM is purpose-built for peptide businesses. Out of the box you get lot tracking, COA management, cold chain monitoring, and peptide protocol management — features that would take months to customize in a generic CRM. Plus, our AI Feature Builder lets you create any custom tool instantly by just describing what you need.",
    },
    {
      q: "How does the AI actually build custom features?",
      a: "When you describe a feature in the chat, our AI architect analyzes your request, generates the code, and deploys it to your CRM in real time. It creates dashboards, automations, reports, and workflows that are fully integrated with your data. No coding required.",
    },
    {
      q: "Is my data secure? What about compliance?",
      a: "Absolutely. Every tenant is fully isolated with Row-Level Security. Data is encrypted at rest and in transit. We're building toward SOC2 compliance and follow HIPAA-aware practices for health-related data. Your peptide inventory, client data, and financial records are protected.",
    },
    {
      q: "Can I import data from my current system?",
      a: "Yes. We support CSV imports for inventory, contacts, and orders. If you're migrating from another CRM, our team can help with data migration. The Enterprise plan includes a dedicated onboarding specialist.",
    },
    {
      q: "What does the free trial include?",
      a: "The free trial gives you full access to the Starter features for 14 days — AI chat assistant, inventory management, order tracking, and up to 2 users. No credit card required to start.",
    },
    {
      q: "Do you offer white-label and custom domains?",
      a: "Yes, on Professional and Enterprise plans. You can customize your portal with your company logo, colors, and domain (e.g., app.yourcompany.com). Your clients will see your brand, not ours.",
    },
  ];

  return (
    <section id="faq" className="py-16 sm:py-24 bg-card/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-10">
          <h2 className="text-3xl font-bold text-foreground">
            Frequently Asked Questions
          </h2>
        </motion.div>
        <motion.div {...fadeInUp}>
          <Accordion type="single" collapsible className="space-y-3">
            {items.map((item, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border border-border/40 rounded-lg bg-card px-4"
              >
                <AccordionTrigger className="text-sm font-medium text-foreground hover:text-primary text-left">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
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
          className="relative rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-8 sm:p-12 text-center overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground relative">
            Ready to Transform Your Peptide Business?
          </h2>
          <p className="mt-4 text-muted-foreground max-w-lg mx-auto relative">
            Join the peptide companies replacing spreadsheets and generic CRMs
            with an AI-powered command center.
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
              className="flex-1 rounded-lg border border-border/60 bg-background/80 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <Button type="submit" className="shadow-btn hover:shadow-btn-hover">
              Start Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground relative">
            No credit card required. Set up in 2 minutes.
          </p>
        </motion.div>
      </div>
    </section>
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
    <footer className="border-t border-border/30 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical className="w-5 h-5 text-primary" />
              <span className="font-bold">PeptideCRM</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The AI-powered command center for peptide businesses.
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

        <div className="mt-10 pt-6 border-t border-border/20 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} PeptideCRM. All rights reserved.
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
      <Nav />
      <Hero />
      <TrustBar />
      <PainPoints />
      <HowItWorks />
      <FeaturesBento />
      <AiShowcase />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}
