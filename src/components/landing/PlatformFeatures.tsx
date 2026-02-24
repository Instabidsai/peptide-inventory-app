import { motion } from "framer-motion";
import {
  Brain,
  Bot,
  Wand2,
  Zap,
  Sparkles,
  FlaskConical,
  Package,
  Truck,
  ShoppingCart,
  Heart,
  Activity,
  Users,
  TrendingUp,
  CreditCard,
  BarChart3,
  Palette,
  Building2,
  UserPlus,
  Shield,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fadeInUp } from "./constants";

export function PlatformFeatures() {
  const categories = [
    {
      id: "ai",
      label: "AI & Automation",
      icon: Brain,
      features: [
        { icon: Bot, title: "AI Chat Assistant", desc: "AI-powered chat with RAG knowledge base. Ask about inventory, protocols, client health — get instant answers with citations." },
        { icon: Wand2, title: "AI Feature Builder", desc: "Describe what you need in plain English. The AI creates custom dashboards, data fields, entities, and automations — deployed in minutes." },
        { icon: Zap, title: "Smart Automations", desc: "Automated payment matching, email scanning, restock alerts, and custom workflow triggers. Set rules once, the AI handles the rest." },
        { icon: Sparkles, title: "AI Agent Framework", desc: "Extensible agent framework. New specialized AI agents deploy as your business grows — each one built for a specific task." },
      ],
    },
    {
      id: "inventory",
      label: "Inventory & Fulfillment",
      icon: Package,
      features: [
        { icon: FlaskConical, title: "Peptide Catalog", desc: "Full catalog with SKU management, retail pricing, active/inactive status, search, CSV export, and AI-powered restock suggestions." },
        { icon: Package, title: "Lot & Bottle Tracking", desc: "Track every vial from receipt to sale. 7 bottle statuses, lot expiry alerts, COA management, and cost-per-unit tracking." },
        { icon: Truck, title: "Fulfillment Center", desc: "Integrated Shippo shipping — compare carrier rates, generate labels, print, and track deliveries. Full order pipeline with daily hours logging." },
        { icon: ShoppingCart, title: "Supplier Orders", desc: "Purchase order creation, receiving workflow with actual-vs-expected quantities, automatic lot generation on receive." },
      ],
    },
    {
      id: "client",
      label: "Client Experience",
      icon: Heart,
      features: [
        { icon: Heart, title: "Digital Fridge & Protocols", desc: "Gamified client portal with Digital Fridge, PeptideRings, dose tracking, compliance heatmaps, and protocol assignment." },
        { icon: Activity, title: "Health & Wellness Hub", desc: "Photo-based macro tracking with AI analysis, body composition logging, water tracker, weekly compliance trends, and barcode scanning." },
        { icon: ShoppingCart, title: "Client & Partner Stores", desc: "Tiered pricing stores with multiple payment methods — card, Zelle, CashApp, Venmo. Protocol-guided product discovery." },
        { icon: Users, title: "Community & Resources", desc: "Discussion forums, resource library with videos and articles, client messaging system, households, and in-app notifications." },
      ],
    },
    {
      id: "revenue",
      label: "Sales & Revenue",
      icon: TrendingUp,
      features: [
        { icon: Users, title: "4-Tier Partner Program", desc: "Senior (50% off), Standard (35%), Associate (25%), Executive (50%). Automated tier management and partner onboarding." },
        { icon: TrendingUp, title: "Commission Engine", desc: "3-level deep commission tracking across partners and reps. Automated calculations, payout management, and reporting." },
        { icon: CreditCard, title: "Flexible Payments", desc: "Accept card (with merchant fee), Zelle, CashApp, Venmo (no fee). Automated payment email scanning and confidence-based matching." },
        { icon: BarChart3, title: "Financial Dashboard", desc: "Revenue tracking, expense management by category, financial metrics charts, bulk payment processing, and profit analysis." },
      ],
    },
    {
      id: "platform",
      label: "White-Label Platform",
      icon: Palette,
      features: [
        { icon: Palette, title: "Custom Branding", desc: "Your logo, colors, company name, and domain. Clients see your brand — not ours. Fully customizable per tenant." },
        { icon: Building2, title: "Multi-Tenant Architecture", desc: "Complete data isolation with Row-Level Security on 15+ tables. Each tenant gets their own universe — invisible to others." },
        { icon: UserPlus, title: "Self-Service Onboarding", desc: "Invite links, referral tracking, self-service signup with plan selection. Clients go from signup to operational in minutes." },
        { icon: Shield, title: "Vendor Dashboard", desc: "Super admin control panel for managing all tenants. Provision new accounts, monitor subscriptions, and track platform health." },
      ],
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
            Purpose-built features across inventory, client experience,
            sales, fulfillment — plus an AI that builds whatever else you need.
          </p>
        </motion.div>

        <Tabs defaultValue="ai" className="w-full">
          <TabsList className="flex w-full max-w-3xl mx-auto mb-8 h-auto gap-1 flex-wrap justify-center">
            {categories.map((cat) => (
              <TabsTrigger key={cat.id} value={cat.id} className="text-xs sm:text-sm px-3 py-2.5 gap-1.5">
                <cat.icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{cat.label}</span>
                <span className="sm:hidden">{cat.label.split(" & ")[0].split(" ")[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map((cat) => (
            <TabsContent key={cat.id} value={cat.id}>
              <div className="grid sm:grid-cols-2 gap-5">
                {cat.features.map((f, i) => (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.08 }}
                    className="group relative overflow-hidden rounded-xl border border-border/60 p-6 bg-card shadow-card transition-all duration-300 hover:shadow-card-hover hover:scale-[1.01] hover:border-primary/30"
                  >
                    <div className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className="relative">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                        <f.icon className="w-5 h-5" />
                      </div>
                      <h3 className="font-semibold text-foreground mb-1.5">{f.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <motion.div {...fadeInUp} className="text-center mt-10">
          <p className="text-sm text-muted-foreground">
            <span className="text-primary font-semibold">100+ features</span> across 5 categories — and the AI builds more on demand.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
