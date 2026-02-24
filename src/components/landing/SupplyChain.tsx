import { motion } from "framer-motion";
import {
  FlaskConical,
  Truck,
  Package,
  TrendingUp,
  ShoppingCart,
  ArrowRight,
  BarChart3,
  CreditCard,
} from "lucide-react";
import { fadeInUp } from "./constants";

export function SupplyChain() {
  const benefits = [
    {
      icon: FlaskConical,
      title: "Wholesale Peptide Sourcing",
      desc: "Access verified wholesale peptide supply directly through the platform. No middlemen, no separate ordering systems.",
    },
    {
      icon: Truck,
      title: "Direct Supply Chain Integration",
      desc: "Orders placed in the CRM flow straight to fulfillment. Your clients' inventory replenishes automatically from our wholesale pipeline.",
    },
    {
      icon: Package,
      title: "Lot Tracking from Source",
      desc: "Every vial tracked from supplier to client. COA documentation, expiry management, and cold chain compliance built in from day one.",
    },
    {
      icon: TrendingUp,
      title: "Margin & Cost Analysis",
      desc: "Real-time cost-per-unit tracking, supplier price comparison, and margin analysis — so your clients always know their numbers.",
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-card/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            Supply Chain
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Wholesale Peptide Sourcing, Built Into the CRM
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Your clients don't just manage their peptide business — they source product directly
            through the platform. Our wholesale supply chain back-channels into every tenant.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {benefits.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="rounded-xl border border-border/60 bg-card p-6 hover:border-primary/30 transition-all hover:shadow-card-hover"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                <b.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-foreground mb-1.5">{b.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Supply chain flow */}
        <motion.div
          {...fadeInUp}
          className="mt-10 max-w-3xl mx-auto"
        >
          <div className="rounded-xl border border-primary/15 bg-gradient-to-r from-primary/5 via-emerald-500/5 to-primary/5 p-6">
            <p className="text-xs text-muted-foreground text-center mb-4 font-medium uppercase tracking-wider">How It Works for Your Clients</p>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {[
                { step: "Client Orders in CRM", icon: ShoppingCart },
                { step: "Wholesale Sourced", icon: FlaskConical },
                { step: "Direct to Client", icon: Truck },
                { step: "Auto-Tracked", icon: Package },
              ].map((s, i) => (
                <div key={s.step} className="flex items-center gap-2">
                  {i > 0 && <ArrowRight className="w-4 h-4 text-primary/40 shrink-0 hidden sm:block" />}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/80 border border-border/40">
                    <s.icon className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs text-foreground font-medium whitespace-nowrap">{s.step}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Three revenue streams callout */}
        <motion.div {...fadeInUp} className="mt-10 text-center">
          <div className="inline-flex flex-wrap items-center justify-center gap-4 sm:gap-8">
            {[
              { label: "CRM Subscriptions", icon: BarChart3 },
              { label: "Payment Processing", icon: CreditCard },
              { label: "Wholesale Supply", icon: FlaskConical },
            ].map((stream) => (
              <div key={stream.label} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <stream.icon className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="text-sm font-medium text-foreground">{stream.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Three revenue streams from one partnership.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
