import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiDemoChat } from "@/components/crm/AiDemoChat";
import { LiveBuildPreview } from "@/components/crm/LiveBuildPreview";
import { fadeInUp, shimmerStyle, shimmerKeyframes, scrollTo } from "./constants";

export function Hero() {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const orbY1 = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const orbY2 = useTransform(scrollYProgress, [0, 1], [0, -50]);

  const heroMessages = [
    {
      role: "user" as const,
      text: 'Create a live dashboard for BPC-157 — show inventory by lot, expiry alerts, and reorder buttons.',
    },
    {
      role: "ai" as const,
      text: "Dashboard is live — 2,450 vials across 8 lots. LOT-2024-A expires in 28 days, flagged amber. Reorder buttons active. Added to your sidebar.",
    },
    {
      role: "user" as const,
      text: "What's my top seller this month?",
    },
    {
      role: "ai" as const,
      text: "BPC-157 leads at $12,450 (340 vials), then TB-500 at $9,100. BPC-157 is up 18% vs last month.",
    },
    {
      role: "user" as const,
      text: "TB-500 is getting low. Set up a reorder alert at 200 units.",
    },
    {
      role: "ai" as const,
      text: "Done — TB-500 alert is live. Current stock: 147 units, so you'll get notified immediately. I've also drafted a PO for your top supplier.",
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
            {/* Industry badge */}
            <div className="flex items-center gap-2 mb-6">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <img src="/logo.png" alt="Logo" className="w-3.5 h-3.5 object-contain" />
                <span className="text-xs font-medium text-primary">Purpose-Built for the Peptide Industry</span>
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
              Your AI-Powered{" "}
              <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
                Peptide Command Center
              </span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-lg leading-relaxed">
              One AI that{" "}
              <strong className="text-foreground">runs your entire business</strong> —
              inventory, orders, fulfillment, client health, commissions — and{" "}
              <strong className="text-foreground">builds new features on demand</strong>.
              Dashboards, automations, entire modules — in minutes, not months.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={() => {
                  sessionStorage.setItem("selected_plan", "professional");
                  navigate("/get-started");
                }}
                className="shadow-btn hover:shadow-btn-hover bg-gradient-to-r from-primary to-emerald-500 text-white border-0 hover:opacity-90 text-base px-8 py-3 h-auto"
                style={shimmerStyle}
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => scrollTo("ai-showcase")}
                className="text-base px-8 py-3 h-auto border-border/60 hover:border-primary/50"
              >
                See It In Action
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Built for peptide businesses. $799/mo — 7-day free trial.
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
              buildPreview={(phase) => <LiveBuildPreview phase={phase} variant="dashboard" />}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
