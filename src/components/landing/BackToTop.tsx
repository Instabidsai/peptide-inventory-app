import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const handler = () => setShow(window.scrollY > 800);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-20 md:bottom-8 right-4 z-40 w-10 h-10 rounded-full bg-card/90 backdrop-blur border border-border/40 shadow-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
          aria-label="Back to top"
        >
          <ChevronRight className="w-4 h-4 -rotate-90" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
