import { motion } from "framer-motion";
import { Star, Quote, BadgeCheck } from "lucide-react";
import { fadeInUp } from "./constants";

export function Testimonials() {
  const testimonials = [
    {
      quote:
        "We were spending hours every week on spreadsheets just to track lot numbers and expiry dates. This handles all of that automatically — plus the AI built us a custom reorder dashboard in under a minute.",
      name: "Early Adopter",
      title: "Operations Manager",
      company: "Peptide Distribution Company",
      stars: 5,
    },
    {
      quote:
        "The fact that I can tell the AI what I need and it just builds it — no developers, no tickets, no waiting — completely changed how we think about our tech stack.",
      name: "Beta User",
      title: "Founder",
      company: "Compounding Pharmacy",
      stars: 5,
    },
    {
      quote:
        "White-label branding, built-in payment processing, and real inventory management in one platform. Our clients think it's our proprietary software. That's exactly what we wanted.",
      name: "Partner Pilot",
      title: "CEO",
      company: "Wellness Distribution Group",
      stars: 5,
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-card/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Trusted by Peptide Leaders
          </h2>
          <p className="mt-3 text-muted-foreground">
            See why peptide companies are switching to AI-powered CRM.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-card rounded-xl border border-border/60 p-6 shadow-card flex flex-col transition-all duration-300 hover:shadow-card-hover hover:border-primary/20"
            >
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: t.stars }).map((_, si) => (
                  <Star
                    key={si}
                    className="w-4 h-4 fill-yellow-400 text-yellow-400"
                  />
                ))}
              </div>
              <Quote className="w-6 h-6 text-primary/30 mb-2" />
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                {t.quote}
              </p>
              <div className="mt-4 pt-4 border-t border-border/30 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? "bg-primary/20 text-primary" :
                  i === 1 ? "bg-emerald-500/20 text-emerald-400" :
                  "bg-blue-500/20 text-blue-400"
                }`}>
                  {t.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    {t.name}
                    <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t.title}, {t.company}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
