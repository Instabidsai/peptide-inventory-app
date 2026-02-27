import { motion } from "framer-motion";
import { Building2, Rocket, ArrowRight } from "lucide-react";
import { fadeInUp, scrollTo } from "./constants";

export function TwoPathFork() {
  const handlePath = (path: "existing" | "new") => {
    sessionStorage.setItem("onboarding_path", path);
    scrollTo("final-cta");
  };

  const paths = [
    {
      icon: Building2,
      title: "I Have a Peptide Business",
      desc: "Replace your spreadsheets and cobbled-together tools with one AI-powered platform. Import your catalog, manage your own inventory, or connect to our wholesale sourcing and white-label fulfillment.",
      cta: "Upgrade My Business",
      path: "existing" as const,
      gradient: "from-primary/10 to-primary/5",
      border: "border-primary/30 hover:border-primary/50",
      iconBg: "bg-primary/15 text-primary",
    },
    {
      icon: Rocket,
      title: "Start a New Peptide Business",
      desc: "Get started fast. Pre-loaded catalog, branded storefront, wholesale pricing, AI assistant, and optional white-label fulfillment — all included.",
      cta: "Launch My Business",
      path: "new" as const,
      gradient: "from-primary/10 to-primary/5",
      border: "border-primary/30 hover:border-primary/50",
      iconBg: "bg-primary/15 text-primary",
    },
  ];

  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            Two Paths. One Powerful Platform.
          </h2>
          <p className="mt-2 text-muted-foreground">
            Whether you're scaling an existing company or starting fresh — we've got you covered.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-6">
          {paths.map((p, i) => (
            <motion.button
              key={p.path}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              onClick={() => handlePath(p.path)}
              className={`text-left rounded-2xl border ${p.border} bg-gradient-to-br ${p.gradient} p-6 sm:p-8 transition-all duration-300 hover:shadow-lg hover:scale-[1.02] cursor-pointer group`}
            >
              <div className={`w-12 h-12 rounded-xl ${p.iconBg} flex items-center justify-center mb-4`}>
                <p.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">{p.desc}</p>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                {p.cta}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
