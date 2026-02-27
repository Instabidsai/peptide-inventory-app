import { useState } from "react";
import { useScroll, useMotionValueEvent } from "framer-motion";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const [progress, setProgress] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setProgress(v));

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-[3px]">
      <div
        className="h-full bg-gradient-to-r from-primary via-[hsl(var(--gradient-to))] to-primary rounded-r-full transition-[width] duration-75"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}
