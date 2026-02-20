import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User } from "lucide-react";

interface Message {
  role: "user" | "ai";
  text: string;
}

interface AiDemoChatProps {
  messages: Message[];
  resultElement?: React.ReactNode;
  loop?: boolean;
  typingSpeed?: number;
}

export function AiDemoChat({
  messages,
  resultElement,
  loop = false,
  typingSpeed = 30,
}: AiDemoChatProps) {
  const [visibleMessages, setVisibleMessages] = useState<
    { role: "user" | "ai"; text: string; complete: boolean }[]
  >([]);
  const [showResult, setShowResult] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showThinking, setShowThinking] = useState(false);

  const reset = useCallback(() => {
    setVisibleMessages([]);
    setShowResult(false);
    setCurrentIndex(0);
    setTypedText("");
    setIsTyping(false);
    setShowThinking(false);
  }, []);

  // Drive the message sequence
  useEffect(() => {
    if (currentIndex >= messages.length) {
      // All messages shown — show result then optionally loop
      const timer = setTimeout(() => setShowResult(true), 400);
      let loopTimer: ReturnType<typeof setTimeout>;
      if (loop) {
        loopTimer = setTimeout(reset, 6000);
      }
      return () => {
        clearTimeout(timer);
        if (loopTimer) clearTimeout(loopTimer);
      };
    }

    const msg = messages[currentIndex];

    if (msg.role === "ai") {
      // Show thinking dots first
      setShowThinking(true);
      const thinkTimer = setTimeout(() => {
        setShowThinking(false);
        setIsTyping(true);
        setTypedText("");
      }, 1200);
      return () => clearTimeout(thinkTimer);
    } else {
      // User messages appear with a slight delay then type out
      const delay = setTimeout(() => {
        setIsTyping(true);
        setTypedText("");
      }, 500);
      return () => clearTimeout(delay);
    }
  }, [currentIndex, messages, loop, reset]);

  // Character-by-character typing
  useEffect(() => {
    if (!isTyping || currentIndex >= messages.length) return;

    const msg = messages[currentIndex];
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
    const next = setTimeout(() => setCurrentIndex((i) => i + 1), 300);
    return () => clearTimeout(next);
  }, [isTyping, typedText, currentIndex, messages, typingSpeed]);

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-md shadow-card overflow-hidden">
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
      </div>

      {/* Messages */}
      <div className="p-4 space-y-3 min-h-[200px] max-h-[320px] overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {visibleMessages.map((msg, i) => (
            <motion.div
              key={`msg-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex gap-2.5 ${msg.role === "user" ? "" : ""}`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === "user"
                    ? "bg-primary/20 text-primary"
                    : "bg-emerald-500/20 text-emerald-400"
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
                    : "text-emerald-300/90"
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
                    : "bg-emerald-500/20 text-emerald-400"
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
                    : "text-emerald-300/90"
                }`}
              >
                {typedText}
                <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse" />
              </div>
            </motion.div>
          )}

          {/* Thinking indicator */}
          {showThinking && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex gap-2.5"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-emerald-500/20 text-emerald-400">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="flex gap-1 pt-2.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400/70"
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

        {/* Result element */}
        <AnimatePresence>
          {showResult && resultElement && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="mt-4"
            >
              {resultElement}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
