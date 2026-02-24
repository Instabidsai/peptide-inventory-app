import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Rocket, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/sb_client/client";
import { fadeInUp } from "./constants";

export function FinalCta() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessStatus, setBusinessStatus] = useState<string>(
    sessionStorage.getItem("onboarding_path") || ""
  );
  const [volume, setVolume] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from("lead_submissions").insert({
        name: name.trim() || null,
        email: email.trim(),
        business_status: businessStatus || null,
        expected_volume: volume || null,
        source: "landing_page",
      });
      if (error) throw error;
      setSubmitted(true);
    } catch {
      // Fallback to mailto if Supabase insert fails
      const lines = [
        `Name: ${name || "Not provided"}`,
        `Email: ${email || "Not provided"}`,
        `Business Status: ${businessStatus === "new" ? "Starting a New Business" : businessStatus === "existing" ? "I Have an Existing Business" : "Not specified"}`,
        `Expected Monthly Volume: ${volume || "Not specified"}`,
      ];
      const body = `Hi, I'd like to apply to join ThePeptideAI.\n\n${lines.join("\n")}`;
      window.open(
        `mailto:hello@thepeptideai.com?subject=${encodeURIComponent("Application to Join — ThePeptideAI")}&body=${encodeURIComponent(body)}`,
        "_self",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-border/60 bg-background/80 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 focus:shadow-[0_0_20px_hsl(var(--primary)/0.15)] transition-shadow";

  return (
    <section id="final-cta" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          {...fadeInUp}
          className="relative rounded-2xl overflow-hidden"
          style={{ padding: "1px", background: "linear-gradient(135deg, hsl(var(--primary) / 0.5), hsl(var(--border) / 0.3) 40%, hsl(142 76% 36% / 0.5))" }}
        >
        <div className="rounded-[15px] bg-gradient-to-br from-primary/10 via-card to-card p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-[60px] pointer-events-none" />
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 mb-4 relative">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs font-medium text-yellow-300">
              Now accepting applications
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground relative">
            Apply to Join ThePeptideAI
          </h2>
          <p className="mt-4 text-muted-foreground max-w-lg mx-auto relative">
            Whether you're launching a new peptide business or upgrading an existing one,
            tell us about yourself and we'll get you set up.
          </p>
          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-8 max-w-md mx-auto relative text-center space-y-3"
            >
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-xl font-semibold text-foreground">Application Received</h3>
              <p className="text-sm text-muted-foreground">
                We'll review your application and reach out to <span className="text-foreground font-medium">{email}</span> within 24 hours to get you set up.
              </p>
            </motion.div>
          ) : (
          <>
          <form
            onSubmit={handleSubmit}
            className="mt-8 max-w-md mx-auto space-y-3 relative text-left"
          >
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
            <input
              type="email"
              placeholder="you@peptidecompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setBusinessStatus("existing")}
                className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  businessStatus === "existing"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 bg-background/80 text-muted-foreground hover:border-primary/40"
                }`}
              >
                <Building2 className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                Existing Business
              </button>
              <button
                type="button"
                onClick={() => setBusinessStatus("new")}
                className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  businessStatus === "new"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-border/60 bg-background/80 text-muted-foreground hover:border-emerald-500/40"
                }`}
              >
                <Rocket className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                Starting New
              </button>
            </div>
            <select
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              className={inputCls + " appearance-none"}
            >
              <option value="">Expected monthly volume</option>
              <option value="1-50">1-50 orders/month</option>
              <option value="50-200">50-200 orders/month</option>
              <option value="200-500">200-500 orders/month</option>
              <option value="500+">500+ orders/month</option>
            </select>
            <Button type="submit" disabled={submitting} className="w-full shadow-btn hover:shadow-btn-hover">
              {submitting ? "Submitting..." : "Apply to Join"}
              {!submitting && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap justify-center gap-4 relative">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                window.open(
                  "mailto:hello@thepeptideai.com?subject=" + encodeURIComponent("Demo Request — ThePeptideAI"),
                  "_self",
                );
              }}
            >
              Or schedule a call instead
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground relative">
            We review applications within 24 hours.
          </p>
          </>
          )}
        </div>
        </motion.div>
      </div>
    </section>
  );
}
