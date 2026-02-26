import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, Shield, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "./constants";

const FEATURES = [
  "AI-powered business management",
  "AI Feature Builder — new modules on demand",
  "Full inventory, lot & bottle tracking",
  "Unlimited orders & fulfillment",
  "Branded client portal",
  "Partner network & commissions",
  "White-label branding",
  "Payment processing (Stripe + manual)",
  "Supplier catalog access",
  "Automations & workflows",
  "Unlimited users",
  "Priority support",
];

export function Pricing() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    sessionStorage.setItem("selected_plan", "professional");
    navigate("/auth");
  };

  return (
    <section id="pricing" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-10">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            One Plan. Everything Included.
          </h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Software + AI + supplier catalog + fulfillment + payment processing — all in one price.
            No tiers to compare, no features locked behind upgrades.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="max-w-lg mx-auto"
        >
          <div className="relative rounded-xl border border-primary bg-primary/5 shadow-card-hover p-8 flex flex-col">
            {/* Badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-gradient-to-r from-primary to-emerald-500 text-white text-xs font-semibold px-4 py-1.5 rounded-full flex items-center gap-1.5">
                <Zap className="w-3 h-3" />
                All-In-One
              </span>
            </div>

            <div className="text-center mb-6 mt-2">
              <h3 className="text-xl font-semibold text-foreground">ThePeptideAI</h3>
              <div className="mt-4 flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold text-foreground">$799</span>
                <span className="text-muted-foreground text-lg">/mo</span>
              </div>
              <p className="text-xs text-emerald-400 font-medium mt-2 flex items-center justify-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                7-day free trial included
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                API credits billed separately based on usage
              </p>
            </div>

            {/* Limits */}
            <div className="grid grid-cols-3 gap-2 mb-6 p-3 rounded-lg bg-background/50 border border-border/30">
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Unlimited</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Users</p>
              </div>
              <div className="text-center border-x border-border/30">
                <p className="text-sm font-semibold text-foreground">Unlimited</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Products</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Unlimited</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Orders</p>
              </div>
            </div>

            {/* Features */}
            <ul className="space-y-2.5 mb-8">
              {FEATURES.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              size="lg"
              onClick={handleGetStarted}
              className="w-full font-semibold bg-gradient-to-r from-primary to-emerald-500 text-white border-0 hover:opacity-90 shadow-btn hover:shadow-btn-hover text-base py-3 h-auto"
            >
              Start 7-Day Free Trial
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <p className="mt-4 text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              30-day money-back guarantee. Cancel anytime.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
