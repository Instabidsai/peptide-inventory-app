import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PLATFORM, fadeInUp } from "./constants";

export function Faq() {
  const items = [
    {
      q: "What makes this different from HubSpot or Salesforce?",
      a: `${PLATFORM.name} is purpose-built for peptide businesses — lot tracking, COA management, expiry alerts, and protocol management come built-in. But the real difference is the AI: where generic CRMs require expensive consultants and months of customization, our AI builds custom dashboards, automations, and modules in minutes from a plain-English description. One AI handles everything — operating your CRM, managing inventory, processing orders, and building new features on demand.`,
    },
    {
      q: "How does the AI actually control my entire CRM?",
      a: "The AI has full access to your CRM data and actions. It can look up inventory levels, process orders, generate shipping labels, send customer notifications, create reports, and manage contacts — all through natural conversation. Ask it 'process order #4521 and notify the customer' and it handles every step: payment, label, email. It goes further — creating new database tables, building custom forms, setting up automations, and adding entirely new modules to your sidebar.",
    },
    {
      q: "Is my data secure? What about compliance?",
      a: "Every tenant is fully isolated with Row-Level Security — your data is invisible to other tenants. Data is encrypted at rest and in transit via Supabase's infrastructure. We follow industry-standard security practices with role-based access control, rate limiting, and input validation across all endpoints. Your peptide inventory, client data, and financial records are protected with multiple security layers.",
    },
    {
      q: "Can I import data from my current system?",
      a: "Yes. We support CSV imports for inventory, contacts, and orders. You can also tell the AI 'import my data from this spreadsheet' and it handles the mapping. If you're migrating from another CRM, our team helps with data migration. Enterprise plans include a dedicated onboarding specialist.",
    },
    {
      q: "What does the free trial include?",
      a: "Every paid plan starts with a 7-day free trial — full access to all features in your chosen plan, no credit card required. Starter includes AI chat, inventory, order tracking, and up to 5 users. You can upgrade to Professional (AI Feature Builder, white-label, commissions) or Enterprise (unlimited everything, custom domain, API access) at any time.",
    },
    {
      q: "Do you offer white-label and custom domains?",
      a: "Yes, on Professional and Enterprise plans. Customize your portal with your company logo, colors, and domain (e.g., app.yourcompany.com). Your clients see your brand, not ours. Each tenant is fully isolated — their experience is indistinguishable from custom-built software.",
    },
  ];

  return (
    <section id="faq" className="py-16 sm:py-24 bg-card/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-10">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            FAQ
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to know before getting started.
          </p>
        </motion.div>
        <motion.div {...fadeInUp}>
          <Accordion type="single" collapsible className="space-y-3">
            {items.map((item, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border border-border/40 rounded-lg bg-card px-4 data-[state=open]:border-primary/30 transition-colors"
              >
                <AccordionTrigger className="text-sm font-medium text-foreground hover:text-primary text-left gap-3">
                  <span className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                      {i + 1}
                    </span>
                    {item.q}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pl-9">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
