import { motion } from "framer-motion";
import { Bot, Wand2, Blocks, Brain, Sparkles, Check } from "lucide-react";
import { fadeInUp } from "./constants";

export function TwoAiBrains() {
  const capabilities = [
    {
      icon: Bot,
      title: "Runs Your Operations",
      desc: "Manages inventory, processes orders, handles customer chat, generates shipping labels, and monitors your entire business in real time.",
    },
    {
      icon: Wand2,
      title: "Builds Itself Continuously",
      desc: "Describe what you need in plain English. The AI creates custom dashboards, data modules, automations, and reports — then deploys them in minutes.",
    },
    {
      icon: Blocks,
      title: "Adds Agentic Capabilities",
      desc: "New AI agents are added to your CRM as your business grows — each one specialized for a specific task.",
    },
  ];

  const sdkFeatures = [
    "Autonomous order processing & fulfillment",
    "Intelligent client health monitoring",
    "Protocol optimization from real-time data",
    "Automated compliance & reporting",
    "Smart restock alerts & supplier management",
    "Custom workflow agents built on demand",
  ];

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            AI-Native Architecture
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            One AI. Infinite Capabilities.
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Other platforms bolt on a chatbot. Ours is different — a single AI
            controls your entire CRM, continuously builds new features, and
            deploys specialized agents as your business evolves.
          </p>
        </motion.div>

        {/* Central brain visual + 3 capability cards */}
        <div className="max-w-4xl mx-auto">
          {/* Brain hub */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex justify-center mb-8"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "2.5s" }} />
              <div className="absolute -inset-4 rounded-full bg-primary/5 animate-pulse" style={{ animationDuration: "3s" }} />
              <div className="relative w-16 h-16 rounded-full bg-background border-2 border-primary/50 flex items-center justify-center shadow-lg shadow-primary/25">
                <Brain className="w-7 h-7 text-primary" />
              </div>
            </div>
          </motion.div>

          {/* 3 capability cards */}
          <div className="grid sm:grid-cols-3 gap-5 mb-10">
            {capabilities.map((cap, i) => (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.12 }}
                className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center"
              >
                <div className="w-11 h-11 rounded-lg bg-primary/15 text-primary flex items-center justify-center mx-auto mb-3">
                  <cap.icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  {cap.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {cap.desc}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Jarvis SDK feature list */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 to-transparent p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
                <Sparkles className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">AI Agent Framework</h4>
                <p className="text-xs text-muted-foreground">Agentic capabilities that grow with your business</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {sdkFeatures.map((feat) => (
                <div key={feat} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                  {feat}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
