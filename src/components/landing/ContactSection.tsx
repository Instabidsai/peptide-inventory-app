import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, MessageSquare, Phone, ArrowRight, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/sb_client/client";
import { PLATFORM, fadeInUp } from "./constants";

export function ContactSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from("lead_submissions").insert({
        name: name.trim() || null,
        email: email.trim(),
        message: message.trim(),
        source: "contact_section",
      });
      if (error) throw error;
      setSubmitted(true);
    } catch {
      window.open(
        `mailto:${PLATFORM.supportEmail}?subject=${encodeURIComponent("Contact — ThePeptideAI")}&body=${encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`)}`,
        "_blank",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-border/60 bg-background/80 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-shadow";

  return (
    <section id="contact" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Get In Touch
          </h2>
          <p className="mt-4 text-muted-foreground max-w-lg mx-auto">
            Book a meeting, text us directly, or send a message — we respond within 24 hours.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {/* Book a Meeting */}
          <motion.div {...fadeInUp} className="relative rounded-xl overflow-hidden" style={{ padding: "1px", background: "linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(var(--border) / 0.3))" }}>
            <div className="rounded-[11px] bg-card p-6 h-full flex flex-col items-center text-center">
              <div className="p-3 rounded-xl bg-primary/10 mb-4">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Book a Meeting</h3>
              <p className="text-sm text-muted-foreground mb-6 flex-1">
                Schedule a 30-minute call to discuss your peptide business needs.
              </p>
              <Button
                className="w-full"
                onClick={() => window.open(PLATFORM.calUrl, "_blank")}
              >
                Schedule Now
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>

          {/* Text or Call */}
          <motion.div {...fadeInUp} className="relative rounded-xl overflow-hidden" style={{ padding: "1px", background: "linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(var(--border) / 0.3))" }}>
            <div className="rounded-[11px] bg-card p-6 h-full flex flex-col items-center text-center">
              <div className="p-3 rounded-xl bg-primary/10 mb-4">
                <Phone className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Text or Call</h3>
              <p className="text-sm text-muted-foreground mb-4 flex-1">
                Reach us directly at <span className="text-foreground font-medium">{PLATFORM.phoneDisplay}</span>
              </p>
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(`sms:${PLATFORM.phone}`, "_self")}
                >
                  Text Us
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(`tel:${PLATFORM.phone}`, "_self")}
                >
                  Call Us
                </Button>
              </div>
            </div>
          </motion.div>

          {/* Send a Message */}
          <motion.div {...fadeInUp} className="relative rounded-xl overflow-hidden" style={{ padding: "1px", background: "linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(var(--border) / 0.3))" }}>
            <div className="rounded-[11px] bg-card p-6 h-full flex flex-col items-center text-center">
              <div className="p-3 rounded-xl bg-primary/10 mb-4">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Send a Message</h3>
              {submitted ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-primary" />
                  <p className="text-sm text-muted-foreground">Message sent! We'll reply within 24 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="w-full space-y-2 flex-1 flex flex-col">
                  <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                  <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required />
                  <textarea placeholder="Your message..." value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={inputCls + " resize-none flex-1"} required />
                  <Button type="submit" disabled={submitting} className="w-full">
                    {submitting ? "Sending..." : "Send Message"}
                    {!submitting && <Send className="w-4 h-4 ml-2" />}
                  </Button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
