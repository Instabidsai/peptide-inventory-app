import React from "react";
import {
  Clock,
  CheckCircle2,
  Package,
  Truck,
  XCircle,
  FileEdit,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "fulfilled"
  | "cancelled"
  | "draft"
  | "submitted"
  | "received";

type PaymentStatus = "paid" | "unpaid" | "partial" | "refunded" | "commission_offset";

const ORDER_STATUS_MAP: Record<
  OrderStatus,
  { label: string; className: string; icon: React.ElementType }
> = {
  pending: {
    label: "Pending",
    className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    icon: Clock,
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: CheckCircle2,
  },
  processing: {
    label: "Processing",
    className: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    icon: Package,
  },
  shipped: {
    label: "Shipped",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    icon: Truck,
  },
  delivered: {
    label: "Delivered",
    className: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: CheckCircle2,
  },
  fulfilled: {
    label: "Fulfilled",
    className: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: XCircle,
  },
  draft: {
    label: "Draft",
    className: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    icon: FileEdit,
  },
  submitted: {
    label: "Submitted",
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: Send,
  },
  received: {
    label: "Received",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: CheckCircle2,
  },
};

const PAYMENT_STATUS_MAP: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  paid: {
    label: "PAID",
    className: "bg-green-500/15 text-green-400 border-green-500/20",
  },
  unpaid: {
    label: "UNPAID",
    className: "text-muted-foreground border-border/60",
  },
  partial: {
    label: "PARTIAL",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  refunded: {
    label: "REFUNDED",
    className: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  commission_offset: {
    label: "PRODUCT OFFSET",
    className: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  },
};

interface StatusBadgeProps {
  status: string;
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({ status, showIcon = true, className }: StatusBadgeProps) {
  const config = ORDER_STATUS_MAP[status as OrderStatus] ?? ORDER_STATUS_MAP.pending;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        config.className,
        className,
      )}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </span>
  );
}

interface PaymentBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function PaymentBadge({ status, className }: PaymentBadgeProps) {
  const key = (status || "unpaid") as PaymentStatus;
  const config = PAYMENT_STATUS_MAP[key] ?? PAYMENT_STATUS_MAP.unpaid;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}

export { ORDER_STATUS_MAP, PAYMENT_STATUS_MAP };
export type { OrderStatus, PaymentStatus };
