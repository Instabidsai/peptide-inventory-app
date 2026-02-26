import React from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ContentFadeProps {
  /** When true, renders the skeleton slot; when false, crossfades to children */
  isLoading: boolean;
  /** Skeleton placeholder shown during loading */
  skeleton: React.ReactNode;
  /** Real content shown after loading */
  children: React.ReactNode;
  className?: string;
}

/**
 * Smooth crossfade between a skeleton placeholder and real content.
 * Wraps the standard `if (isLoading) return <Skeleton/>` pattern with
 * a fade transition so content doesn't hard-cut in.
 */
export function ContentFade({ isLoading, skeleton, children, className }: ContentFadeProps) {
  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={className}
        >
          {skeleton}
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
