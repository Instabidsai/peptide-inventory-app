import { useState } from "react";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { PricingCard } from "@/components/crm/PricingCard";
import { useSubscriptionPlans } from "@/hooks/use-subscription";
import { fadeInUp, scrollTo } from "./constants";

export function Pricing() {
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  const { data: plans } = useSubscriptionPlans();

  // Show all active plans including free tier (best for conversion)
  const visiblePlans = (plans ?? [])
    .filter((p) => p.active)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Fallback plans if DB isn't seeded
  const fallbackPlans = [
    {
      id: "1",
      name: "starter",
      display_name: "Starter",
      price_monthly: 49900,
      price_yearly: 499900,
      max_users: 5,
      max_peptides: 50,
      max_orders_per_month: 500,
      features: [
        "PsiFi payment processing pre-configured",
        "Pre-loaded supplier catalog",
        "AI Chat Assistant",
        "Branded client portal",
        "Inventory & order tracking",
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
      price_monthly: 89900,
      price_yearly: 899900,
      max_users: 25,
      max_peptides: 200,
      max_orders_per_month: 2000,
      features: [
        "Everything in Starter",
        "AI Feature Builder",
        "Advanced fulfillment & shipping",
        "Partner network & commissions",
        "White-label branding",
        "Automations & workflows",
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
      price_monthly: 129900,
      price_yearly: 1299000,
      max_users: 999999,
      max_peptides: 999999,
      max_orders_per_month: 999999,
      features: [
        "Everything in Professional",
        "Full Jarvis AI ecosystem",
        "Autonomous operations",
        "Multi-location support",
        "Custom integrations & API",
        "Dedicated account manager",
        "Custom domain & SLA",
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
            Software + supplier catalog + fulfillment + PsiFi payment processing — all in one price. No hidden fees, no setup costs. Every plan includes AI.
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
                    : "Book a Demo"
                }
                onSelect={() => scrollTo("final-cta")}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
