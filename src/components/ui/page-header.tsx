import { motion } from "framer-motion";
import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  breadcrumbs?: Breadcrumb[];
  badge?: { label: string; variant?: "default" | "success" | "warning" };
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  breadcrumbs,
  badge,
  actions,
}: PageHeaderProps) {
  const badgeColors = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-green-500/10 text-green-500 border-green-500/20",
    warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="space-y-2"
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link
            to="/"
            className="hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Home className="h-3 w-3" />
            <span>Dashboard</span>
          </Link>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              {crumb.href ? (
                <Link
                  to={crumb.href}
                  className="hover:text-foreground transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {badge && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    badgeColors[badge.variant || "default"]
                  }`}
                >
                  {badge.label}
                </span>
              )}
            </div>
            {description && (
              <p className="text-muted-foreground text-sm">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
      </div>
    </motion.div>
  );
}
