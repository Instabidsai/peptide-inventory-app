import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
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
            What Early Testers Are Saying
          </h2>
          <p className="mt-3 text-muted-foreground">
            Feedback from our beta program participants.
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
              className="relative rounded-xl p-px transition-all duration-300 group"
              style={{ background: "linear-gradient(135deg, hsl(var(--border) / 0.6), hsl(var(--border) / 0.3))" }}
            >
              {/* Gradient border glow on hover */}
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.5), hsl(var(--border) / 0.3) 40%, hsl(var(--primary) / 0.3))" }}
              />
              <div className="relative bg-card rounded-[11px] p-6 h-full flex flex-col shadow-card group-hover:shadow-card-hover transition-shadow">
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
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gradient-to-br from-primary/20 to-primary/10 text-primary ring-1 ring-primary/20">
                    {t.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.title}, {t.company}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
