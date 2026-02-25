import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Menu, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { PLATFORM, scrollTo } from "./constants";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Track active section via IntersectionObserver
  useEffect(() => {
    const ids = ["features", "ai-showcase", "pricing", "faq"];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const links = [
    { label: "Features", id: "features" },
    { label: "AI", id: "ai-showcase" },
    { label: "Pricing", id: "pricing" },
    { label: "FAQ", id: "faq" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
        ? "bg-background/95 backdrop-blur-md border-b border-border/40 shadow-sm"
        : "bg-transparent"
        }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => scrollTo("hero")}
            className="flex items-center gap-2.5 text-foreground hover:text-primary transition-colors group"
          >
            <div className="relative p-1 bg-gradient-to-br from-card to-background rounded-lg ring-1 ring-primary/30 flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-5 h-5 object-contain group-hover:scale-110 transition-transform duration-300" />
            </div>
            <span className="font-bold text-lg">{PLATFORM.name}</span>
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-6">
            {links.map((l) => (
              <button
                key={l.id}
                onClick={() => scrollTo(l.id)}
                className={`text-sm transition-colors relative ${activeSection === l.id
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                {l.label}
                {activeSection === l.id && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/auth")}
            >
              Log In
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => scrollTo("final-cta")}
            >
              Book Demo
            </Button>
            <Button
              size="sm"
              onClick={() => scrollTo("final-cta")}
              className="bg-gradient-to-r from-primary to-emerald-500 text-white border-0 hover:opacity-90 shadow-sm"
            >
              Get Started
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>

          {/* Mobile menu */}
          <div className="md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <div className="flex flex-col gap-4 mt-8">
                  {links.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        setMobileOpen(false);
                        setTimeout(() => scrollTo(l.id), 150);
                      }}
                      className="text-left text-lg text-foreground hover:text-primary transition-colors py-2"
                    >
                      {l.label}
                    </button>
                  ))}
                  <hr className="border-border/40 my-2" />
                  <Button
                    variant="ghost"
                    onClick={() => navigate("/auth")}
                  >
                    Log In
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMobileOpen(false);
                      scrollTo("final-cta");
                    }}
                  >
                    Book Demo
                  </Button>
                  <Button
                    onClick={() => {
                      setMobileOpen(false);
                      scrollTo("final-cta");
                    }}
                  >
                    Get Started
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
