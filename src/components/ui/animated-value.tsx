import { useState, useEffect, useRef } from "react";
import { useInView } from "framer-motion";

interface AnimatedValueProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}

export function AnimatedValue({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1200,
  className,
}: AnimatedValueProps) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!inView || hasAnimated.current) return;
    hasAnimated.current = true;

    const steps = 40;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      // Ease-out: fast start, slow end
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      current = value * eased;

      if (step >= steps) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(current);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [inView, value, duration]);

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.floor(display).toLocaleString();

  return (
    <span ref={ref} className={className}>
      {prefix}{decimals > 0 ? Number(formatted).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : formatted}{suffix}
    </span>
  );
}
