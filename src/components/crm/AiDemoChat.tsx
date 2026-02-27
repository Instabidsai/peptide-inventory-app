import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User, Check, ArrowUp } from "lucide-react";

interface Message {
  role: "user" | "ai";
  text: string;
}

interface AiDemoChatProps {
  messages: Message[];
  resultElement?: React.ReactNode;
  loop?: boolean;
  typingSpeed?: number;
  /** Optional build progress steps shown during AI thinking */
  buildSteps?: string[];
  /** Render function that receives the current build phase (0..N-1) and returns a live preview */
  buildPreview?: (phase: number) => React.ReactNode;
  /** Called when the demo finishes playing all messages and shows the result */
  onComplete?: () => void;
  /** When true, don't render internal preview/result — external panel handles it */
  hidePreview?: boolean;
  /** Called whenever the build phase changes (for external preview panels) */
  onBuildPhaseChange?: (phase: number) => void;
  /** Called when the result should show (for external preview panels) */
  onShowResult?: (show: boolean) => void;
  /** Show a fake input bar at the bottom for a more realistic chat look */
  showInputBar?: boolean;
}

export function AiDemoChat({
  messages,
  resultElement,
  loop = false,
  typingSpeed = 30,
  buildSteps,
  buildPreview,
  onComplete,
  hidePreview = false,
  onBuildPhaseChange,
  onShowResult,
  showInputBar = false,
}: AiDemoChatProps) {
  const [visibleMessages, setVisibleMessages] = useState<
    { role: "user" | "ai"; text: string; complete: boolean }[]
  >([]);
  const [showResult, setShowResult] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [buildStep, setBuildStep] = useState(-1);
  // Keep the final build phase visible while AI types its response
  const [buildPhaseForPreview, setBuildPhaseForPreview] = useState(-1);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Stable refs for props that are inline arrays (new reference every render)
  // This prevents useEffect cleanup/re-run cycles that freeze the animation
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const buildStepsRef = useRef(buildSteps);
  buildStepsRef.current = buildSteps;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onBuildPhaseChangeRef = useRef(onBuildPhaseChange);
  onBuildPhaseChangeRef.current = onBuildPhaseChange;
  const onShowResultRef = useRef(onShowResult);
  onShowResultRef.current = onShowResult;

  const buildStepsShownRef = useRef(false);
  // Ref for the "advance to next message" timer — must survive typing effect cleanup
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const reset = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    setVisibleMessages([]);
    setShowResult(false);
    setCurrentIndex(0);
    setTypedText("");
    setIsTyping(false);
    setShowThinking(false);
    setBuildStep(-1);
    setBuildPhaseForPreview(-1);
    buildStepsShownRef.current = false;
  }, []);

  // Clean up advance timer on unmount
  useEffect(() => {
    return () => { if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current); };
  }, []);

  // Sync external preview panel via callbacks
  useEffect(() => {
    onBuildPhaseChangeRef.current?.(buildPhaseForPreview);
  }, [buildPhaseForPreview]);

  useEffect(() => {
    onShowResultRef.current?.(showResult);
  }, [showResult]);

  // Auto-scroll chat area when new content appears (scroll container only, not page)
  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [visibleMessages, typedText, buildStep, showThinking]);

  // Drive the message sequence
  // IMPORTANT: uses refs for messages/buildSteps to avoid re-running when inline array props change reference
  useEffect(() => {
    const msgs = messagesRef.current;
    const steps = buildStepsRef.current;

    if (currentIndex >= msgs.length) {
      // All messages shown — show result then optionally loop
      const timer = setTimeout(() => {
        setBuildPhaseForPreview(-1); // Hide preview, show final result
        setShowResult(true);
        onCompleteRef.current?.();
      }, 400);
      let loopTimer: ReturnType<typeof setTimeout>;
      if (loop) {
        loopTimer = setTimeout(reset, 6000);
      }
      return () => {
        clearTimeout(timer);
        if (loopTimer) clearTimeout(loopTimer);
      };
    }

    const msg = msgs[currentIndex];

    if (msg.role === "ai") {
      // Only show build steps for the FIRST AI message
      if (steps && steps.length > 0 && !buildStepsShownRef.current) {
        buildStepsShownRef.current = true;
        // Show step-by-step build progress
        setBuildStep(0);
        setBuildPhaseForPreview(0);
        setShowThinking(true);
        const stepTimers: ReturnType<typeof setTimeout>[] = [];
        steps.forEach((_, i) => {
          if (i > 0) {
            stepTimers.push(setTimeout(() => {
              setBuildStep(i);
              setBuildPhaseForPreview(i);
            }, i * 800));
          }
        });
        // After all build steps complete, start typing the AI response
        // Keep buildPhaseForPreview at final step so preview stays visible
        const finalTimer = setTimeout(() => {
          setShowThinking(false);
          setBuildStep(-1);
          // Keep buildPhaseForPreview at last step
          setBuildPhaseForPreview(steps.length - 1);
          setIsTyping(true);
          setTypedText("");
        }, steps.length * 800 + 400);
        return () => {
          stepTimers.forEach(clearTimeout);
          clearTimeout(finalTimer);
        };
      } else {
        // Simple thinking dots for follow-up AI messages
        setShowThinking(true);
        const thinkTimer = setTimeout(() => {
          setShowThinking(false);
          setIsTyping(true);
          setTypedText("");
        }, 1200);
        return () => clearTimeout(thinkTimer);
      }
    } else {
      // User messages appear with a slight delay then type out
      const delay = setTimeout(() => {
        setIsTyping(true);
        setTypedText("");
      }, currentIndex === 0 ? 500 : 1000);
      return () => clearTimeout(delay);
    }
  }, [currentIndex, loop, reset]);

  // Character-by-character typing
  // IMPORTANT: The advance timer uses a ref so that when setIsTyping(false) triggers
  // effect cleanup, the advance timer is NOT canceled (that was the animation-freeze bug).
  useEffect(() => {
    const msgs = messagesRef.current;
    if (!isTyping || currentIndex >= msgs.length) return;

    const msg = msgs[currentIndex];
    if (typedText.length < msg.text.length) {
      const timer = setTimeout(() => {
        setTypedText(msg.text.slice(0, typedText.length + 1));
      }, msg.role === "ai" ? typingSpeed : typingSpeed * 0.6);
      return () => clearTimeout(timer);
    }

    // Typing complete — commit message and advance
    setIsTyping(false);
    setVisibleMessages((prev) => [
      ...prev,
      { role: msg.role, text: msg.text, complete: true },
    ]);
    setTypedText("");
    // Store in ref so effect cleanup (triggered by isTyping change) doesn't cancel it
    advanceTimerRef.current = setTimeout(() => setCurrentIndex((i) => i + 1), 300);
    // No cleanup return for the advance timer — it's managed by the ref
  }, [isTyping, typedText, currentIndex, typingSpeed]);

  const showBuildPreview = buildPreview && buildPhaseForPreview >= 0 && !showResult;

  return (
    <div className="relative rounded-xl bg-card/80 backdrop-blur-md shadow-card overflow-hidden" style={{ padding: "1px", background: "linear-gradient(135deg, hsl(var(--primary) / 0.3), hsl(var(--border) / 0.4) 40%, hsl(var(--primary) / 0.2))" }}>
      <div className="rounded-[11px] bg-card/95 overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-background/60">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
        </div>
        <span className="text-xs text-muted-foreground ml-2 font-mono">
          PeptideCRM AI
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-[10px] text-primary font-mono">LIVE</span>
        </div>
      </div>

      {/* ── Chat messages area (scrollable, compact) ── */}
      <div ref={chatContainerRef} className="p-4 space-y-3 min-h-[80px] max-h-[280px] overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {visibleMessages.map((msg, i) => (
            <motion.div
              key={`msg-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex gap-2.5"
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === "user"
                    ? "bg-primary/20 text-primary"
                    : "bg-primary/20 text-primary"
                }`}
              >
                {msg.role === "user" ? (
                  <User className="w-3.5 h-3.5" />
                ) : (
                  <Bot className="w-3.5 h-3.5" />
                )}
              </div>
              <div
                className={`text-sm leading-relaxed pt-1 ${
                  msg.role === "user"
                    ? "text-foreground"
                    : "text-primary/90"
                }`}
              >
                {msg.text}
              </div>
            </motion.div>
          ))}

          {/* Currently typing message */}
          {isTyping && currentIndex < messages.length && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2.5"
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  messages[currentIndex].role === "user"
                    ? "bg-primary/20 text-primary"
                    : "bg-primary/20 text-primary"
                }`}
              >
                {messages[currentIndex].role === "user" ? (
                  <User className="w-3.5 h-3.5" />
                ) : (
                  <Bot className="w-3.5 h-3.5" />
                )}
              </div>
              <div
                className={`text-sm leading-relaxed pt-1 ${
                  messages[currentIndex].role === "user"
                    ? "text-foreground"
                    : "text-primary/90"
                }`}
              >
                {typedText}
                <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse" />
              </div>
            </motion.div>
          )}

          {/* Build progress indicator */}
          {showThinking && buildSteps && buildStep >= 0 && (
            <motion.div
              key="build-progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex gap-2.5"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-primary/20 text-primary">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 space-y-1.5 pt-1">
                {buildSteps.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{
                      opacity: i <= buildStep ? 1 : 0.3,
                      x: 0,
                    }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="flex items-center gap-2 text-xs"
                  >
                    {i < buildStep ? (
                      <Check className="w-3 h-3 text-primary shrink-0" />
                    ) : i === buildStep ? (
                      <motion.div
                        className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent shrink-0"
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      />
                    ) : (
                      <div className="w-3 h-3 rounded-full border border-muted-foreground/30 shrink-0" />
                    )}
                    <span
                      className={
                        i <= buildStep
                          ? "text-primary/90"
                          : "text-muted-foreground/50"
                      }
                    >
                      {step}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Simple thinking dots (fallback when no buildSteps) */}
          {showThinking && !buildSteps && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex gap-2.5"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-primary/20 text-primary">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="flex gap-1 pt-2.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary/70"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={chatEndRef} />
      </div>

      {/* ── Live Build Preview (OUTSIDE scroll area — always visible) ── */}
      {!hidePreview && (
        <AnimatePresence mode="wait">
          {showBuildPreview && (
            <motion.div
              key="build-preview"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="border-t border-primary/30 overflow-hidden bg-gradient-to-b from-primary/[0.03] to-transparent"
            >
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  <span className="text-[11px] font-mono text-primary uppercase tracking-wider font-medium">
                    Live Preview — Step {buildPhaseForPreview + 1} of {buildSteps?.length ?? 0}
                  </span>
                </div>
                {buildPreview(buildPhaseForPreview)}
              </div>
            </motion.div>
          )}

          {/* Result element (replaces preview after AI finishes typing) */}
          {showResult && resultElement && (
            <motion.div
              key="result"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="border-t border-primary/20 overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-mono text-primary/80 uppercase tracking-wider">Built & Deployed</span>
                </div>
                {resultElement}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Fake input bar for realistic chat look ── */}
      {showInputBar && (
        <div className="border-t border-border/40 bg-background/40 px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2">
            <span className="text-sm text-muted-foreground/50 flex-1">Ask AI to build something...</span>
            <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center">
              <ArrowUp className="w-3.5 h-3.5 text-primary/60" />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
