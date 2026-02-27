import { motion } from "framer-motion";
import { MessageSquare, Wand2, Rocket } from "lucide-react";
import { fadeInUp } from "./constants";

export function HowItWorks() {
  const steps = [
    {
      icon: MessageSquare,
      title: "Describe What You Need",
      desc: 'Type it in plain English: "I need a reorder alert when BPC-157 drops below 500 vials."',
    },
    {
      icon: Wand2,
      title: "We Build It in Minutes",
      desc: "Custom dashboards, automations, reports — designed, built, and deployed while you watch. No consultants, no dev team required.",
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
        <div className="grid sm:grid-cols-3 gap-6 relative">
          {/* Connector line (desktop only) — animated gradient */}
          <div className="hidden sm:block absolute top-16 left-[16.5%] right-[16.5%] h-px overflow-hidden z-0">
            <div
              className="h-full w-full"
              style={{
                background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.5), hsl(var(--primary) / 0.4), hsl(var(--primary) / 0.5), transparent)",
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
              className="text-center relative bg-card rounded-xl border border-border/40 p-8 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group"
            >
              <div className="relative mx-auto mb-5 w-16 h-16">
                {/* Floating number badge */}
                <div className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-[hsl(var(--gradient-to))] flex items-center justify-center z-10 shadow-md shadow-primary/25">
                  <span className="text-white text-xs font-bold">{i + 1}</span>
                </div>
                {/* Icon container */}
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/15 group-hover:border-primary/30 transition-colors">
                  <s.icon className="w-7 h-7 text-primary" />
                </div>
              </div>
              <h3 className="font-semibold text-lg text-foreground mb-2">{s.title}</h3>
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
