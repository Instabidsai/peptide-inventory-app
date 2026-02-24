import { motion } from "framer-motion";
import { CreditCard, Wallet, Zap, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeInUp, scrollTo } from "./constants";

export function PaymentIntegration() {
  const methods = [
    { icon: CreditCard, name: "PsiFi Credit Card Processing", desc: "Full credit & debit card processing powered by PsiFi — already live and accepting payments today", badge: "Live" },
    { icon: Wallet, name: "Zelle", desc: "Direct bank transfers with automated reconciliation", badge: "No Fee" },
    { icon: Wallet, name: "CashApp", desc: "Mobile-first payments your clients already use", badge: "No Fee" },
    { icon: Wallet, name: "Venmo", desc: "Social payments with instant confirmation", badge: "No Fee" },
  ];

  const automations = [
    "Automated payment email scanning & matching",
    "Confidence-based auto-reconciliation (high / medium / low)",
    "Real-time payment status tracking per order",
    "Merchant fee calculation per payment method",
    "Commission auto-calculation on every sale",
    "Bulk payment processing for supplier orders",
  ];

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2 block">
            Integrated Payments
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            PsiFi Payment Processing, Built In
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Real credit card processing powered by PsiFi — already live and taking payments.
            Your merchant account, your rates, your revenue. Plus Zelle, CashApp, and Venmo built right in.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Left: Payment methods */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground mb-6">
              Accept Every Way Your Clients Pay
            </h3>
            {methods.map((m, i) => (
              <motion.div
                key={m.name}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex items-start gap-4 p-4 rounded-xl border border-border/60 bg-card hover:border-emerald-500/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <m.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground">{m.name}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                      {m.badge}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Right: Automation features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-emerald-500/5 p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-lg bg-primary/15 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Payment Automation</h3>
                <p className="text-xs text-muted-foreground">Set it once — the AI handles the rest</p>
              </div>
            </div>
            <div className="space-y-3">
              {automations.map((feat) => (
                <div key={feat} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  {feat}
                </div>
              ))}
            </div>

            {/* Revenue flow visual */}
            <div className="mt-8 pt-6 border-t border-primary/10">
              <p className="text-xs text-muted-foreground mb-3">Revenue Flow</p>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {["Client Pays", "Auto-Matched", "Commission Split", "Revenue Tracked"].map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    {i > 0 && <ArrowRight className="w-3 h-3 text-primary/40 shrink-0" />}
                    <span className="px-2.5 py-1 rounded-lg bg-background/60 border border-border/30 text-foreground whitespace-nowrap">
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Partner CTA */}
        <motion.div
          {...fadeInUp}
          className="mt-12 text-center p-8 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-primary/5 to-emerald-500/10 border border-emerald-500/20"
        >
          <h3 className="text-xl font-bold text-foreground mb-2">
            Distribution Partners
          </h3>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-4">
            Your clients get the platform, you keep the payment processing revenue,
            and wholesale peptide sourcing flows directly through the CRM.
            One partnership, three revenue streams.
          </p>
          <Button
            onClick={() => scrollTo("final-cta")}
            className="bg-gradient-to-r from-emerald-500 to-primary text-white border-0 hover:opacity-90"
          >
            Become a Distribution Partner
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
