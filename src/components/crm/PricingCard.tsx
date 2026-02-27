import { memo } from 'react';
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PricingCardProps {
  name: string;
  displayName: string;
  priceMonthly: number; // cents
  priceYearly: number; // cents
  billingPeriod: "monthly" | "yearly";
  features: string[];
  maxUsers: number;
  maxPeptides: number;
  maxOrdersPerMonth: number;
  popular?: boolean;
  onSelect: () => void;
  ctaLabel?: string;
}

function PricingCardBase({
  displayName,
  priceMonthly,
  priceYearly,
  billingPeriod,
  features,
  maxUsers,
  maxPeptides,
  maxOrdersPerMonth,
  popular = false,
  onSelect,
  ctaLabel = "Start Free Trial",
}: PricingCardProps) {
  const price = billingPeriod === "yearly" ? priceYearly : priceMonthly;
  const monthlyEquivalent =
    billingPeriod === "yearly" ? Math.round(price / 12) : price;
  const savings =
    billingPeriod === "yearly"
      ? Math.round(((priceMonthly * 12 - priceYearly) / (priceMonthly * 12)) * 100)
      : 0;

  const formatLimit = (val: number) =>
    val >= 999999 ? "Unlimited" : val.toLocaleString();

  return (
    <div
      className={cn(
        "relative rounded-xl border p-6 flex flex-col transition-all duration-300",
        popular
          ? "border-primary bg-primary/5 shadow-card-hover scale-[1.02]"
          : "border-border/60 bg-card shadow-card hover:shadow-card-hover hover:scale-[1.01] hover:border-primary/20"
      )}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">{displayName}</h3>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-4xl font-bold text-foreground">
            ${Math.round(monthlyEquivalent / 100)}
          </span>
          <span className="text-muted-foreground text-sm">/mo</span>
        </div>
        {billingPeriod === "yearly" && savings > 0 && (
          <p className="text-xs text-primary mt-1">
            Save {savings}% with annual billing
          </p>
        )}
        {billingPeriod === "yearly" && (
          <p className="text-xs text-muted-foreground mt-0.5">
            ${(price / 100).toLocaleString()}/year billed annually
          </p>
        )}
        <p className="text-xs text-primary font-medium mt-1.5">
          7-day free trial included
        </p>
      </div>

      {/* Limits */}
      <div className="grid grid-cols-3 gap-2 mb-5 p-3 rounded-lg bg-background/50 border border-border/30">
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            {formatLimit(maxUsers)}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Users
          </p>
        </div>
        <div className="text-center border-x border-border/30">
          <p className="text-sm font-semibold text-foreground">
            {formatLimit(maxPeptides)}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Peptides
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            {formatLimit(maxOrdersPerMonth)}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Orders/mo
          </p>
        </div>
      </div>

      {/* Features */}
      <ul className="space-y-2.5 mb-6 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={onSelect}
        className={cn(
          "w-full font-semibold",
          popular
            ? "bg-gradient-to-r from-primary to-primary/80 text-white border-0 hover:opacity-90 shadow-btn hover:shadow-btn-hover"
            : "bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary"
        )}
      >
        {ctaLabel}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}

export const PricingCard = memo(PricingCardBase);
