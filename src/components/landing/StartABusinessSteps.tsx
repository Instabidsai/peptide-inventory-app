import { motion } from "framer-motion";
import { FlaskConical, Palette, TrendingUp, Truck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeInUp, scrollTo } from "./constants";

export function StartABusinessSteps() {
  const steps = [
    {
      icon: Palette,
      title: "Name & Brand Your Company",
      desc: "Choose your company name, upload a logo, pick your brand colors, and claim your subdomain — yourname.thepeptideai.com.",
    },
    {
      icon: FlaskConical,
      title: "50+ Products Pre-Loaded",
      desc: "Your store launches with a full catalog of research peptides, ready to sell. No sourcing, no spreadsheets, no data entry.",
    },
    {
      icon: TrendingUp,
      title: "Set Your Markup & Start Selling",
      desc: "Choose your retail markup over wholesale cost. See live margin previews. Your branded storefront is live in minutes.",
    },
    {
      icon: Truck,
      title: "We Handle Fulfillment",
      desc: "When your customers order, we pick, pack, and ship under your brand. You focus on growing your client base — we handle the rest.",
    },
  ];

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2 block">
            Start a Business
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Launch Your Peptide Business in 10 Minutes
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            No inventory to buy. No warehouse to rent. No tech team to hire.
            Everything is included from day one.
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
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto">
                  <s.icon className="w-6 h-6 text-emerald-400" />
                </div>
                <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center">
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
            className="bg-gradient-to-r from-emerald-500 to-primary text-white border-0 hover:opacity-90 text-base px-8 py-3 h-auto"
          >
            Start My Business
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
