import { motion } from "framer-motion";
import { Wrench, Thermometer, AlertTriangle } from "lucide-react";
import { fadeInUp } from "./constants";

export function PainPoints() {
  const cards = [
    {
      icon: Wrench,
      title: "6+ Months of Customization",
      desc: "Generic CRMs like HubSpot and Salesforce need expensive consultants and months of setup for peptide workflows. Our AI handles it from day one.",
      stat: "Solved on day one",
    },
    {
      icon: Thermometer,
      title: "No Peptide-Specific Features",
      desc: "Lot tracking, COA management, and expiry alerts don't exist in off-the-shelf tools. You'd need to build them from scratch.",
      stat: "20+ built-in workflows",
    },
    {
      icon: AlertTriangle,
      title: "Manual Processes Break at Scale",
      desc: "Spreadsheets and email threads crumble when you go from 50 to 500 orders per month. Our platform scales with you automatically.",
      stat: "Built to scale",
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
