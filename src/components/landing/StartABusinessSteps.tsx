import { motion } from "framer-motion";
import { FlaskConical, Palette, TrendingUp, Truck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeInUp, scrollTo } from "./constants";

export function StartABusinessSteps() {
  const steps = [
    {
      icon: Palette,
      title: "Name & Brand Your Company",
      desc: "Choose your company name, upload a logo, and pick your brand colors. Your clients see your brand — not ours.",
    },
    {
      icon: FlaskConical,
      title: "Product Catalog Ready to Go",
      desc: "Launch with a pre-loaded catalog of research peptides from our wholesale network, or import your own existing inventory.",
    },
    {
      icon: TrendingUp,
      title: "Set Your Markup & Start Selling",
      desc: "Choose your retail markup over wholesale cost. See live margin previews. Your branded storefront is ready in minutes.",
    },
    {
      icon: Truck,
      title: "Two Fulfillment Options",
      desc: "Hold your own inventory with full lot tracking, or use our white-label service — we label, pack, and ship under your brand.",
    },
  ];

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            Start a Business
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Launch Your Peptide Business — Fast
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Choose your model: source and hold your own inventory, or use our
            white-label fulfillment service. No tech team to hire — everything is included.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center"
            >
              <div className="relative mx-auto mb-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto">
                  <s.icon className="w-6 h-6 text-primary" />
                </div>
                <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
              </div>
              <h3 className="font-semibold text-foreground mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                {s.desc}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeInUp} className="text-center mt-10">
          <Button
            size="lg"
            onClick={() => {
              sessionStorage.setItem("onboarding_path", "new");
              scrollTo("final-cta");
            }}
            className="bg-gradient-to-r from-primary to-[hsl(var(--gradient-to))] text-white border-0 hover:opacity-90 text-base px-8 py-3 h-auto"
          >
            Start My Business
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
