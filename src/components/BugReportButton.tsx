import { useState, useRef } from "react";
import { Bug, Loader2, Send, Camera, X, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuthOptional } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/sb_client/client";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const profile = auth?.profile ?? null;

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Please upload an image file" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: "destructive", title: "Image too large", description: "Max 5MB allowed" });
      return;
    }
    setScreenshot(file);
    const reader = new FileReader();
    reader.onload = (e) => setScreenshotPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearScreenshot = () => {
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;

    setSubmitting(true);
    try {
      const recentErrors = (window as unknown as { __recentConsoleErrors?: string[] }).__recentConsoleErrors || [];
      let screenshotUrl: string | null = null;

      // Upload screenshot if provided
      if (screenshot) {
        const ext = screenshot.name.split(".").pop() || "png";
        const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const path = `${user?.id || "anon"}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("bug-screenshots")
          .upload(path, screenshot);

        if (uploadError) {
          console.error("Screenshot upload failed:", uploadError);
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from("bug-screenshots")
            .getPublicUrl(path);
          screenshotUrl = publicUrl;
        }
      }

      // Write to bug_reports table (for admin dashboard + sentinel)
      const { error: bugError } = await supabase.from("bug_reports").insert({
        user_id: user?.id || null,
        user_email: profile?.email || user?.email || null,
        user_role: profile?.role || "unknown",
        org_id: profile?.org_id || null,
        page_url: window.location.hash || "/",
        user_agent: navigator.userAgent,
        description: `[USER] ${description.trim()}`,
        console_errors: JSON.stringify(recentErrors.slice(-10)),
        screenshot_url: screenshotUrl,
        status: "open",
      });

      if (bugError) throw bugError;

      // Also write to audit_log (for self-healing pipeline) — best-effort
      try {
        await supabase.from("audit_log").insert({
          action: "bug_report",
          table_name: "app",
          record_id: crypto.randomUUID(),
          user_id: user?.id || null,
          org_id: profile?.org_id || null,
          new_data: {
            description: description.trim(),
            page: window.location.hash,
            user_agent: navigator.userAgent,
            role: profile?.role || "unknown",
            console_errors: recentErrors.slice(-10),
            screenshot_url: screenshotUrl,
            timestamp: new Date().toISOString(),
          },
        });
      } catch { /* best-effort, don't block on audit_log failure */ }

      toast({ title: "Bug reported!", description: "Thank you! We'll look into it." });
      setDescription("");
      clearScreenshot();
      setOpen(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to submit",
        description: (err as any)?.message || "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { clearScreenshot(); setDescription(""); } }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
          title="Report a bug"
          aria-label="Report a bug"
        >
          <Bug className="h-4.5 w-4.5" />
          <span>Report a Bug</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report a Bug</DialogTitle>
          <DialogDescription>
            Describe what went wrong and upload a screenshot so we can fix it fast.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="bug-description">What happened?</Label>
            <Textarea
              id="bug-description"
              placeholder="e.g. I clicked 'Submit Order' but nothing happened..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Screenshot upload — mobile-first */}
          <div className="space-y-2">
            <Label>Screenshot (recommended)</Label>
            {screenshotPreview ? (
              <div className="relative rounded-lg border overflow-hidden">
                <img
                  src={screenshotPreview}
                  alt="Bug screenshot"
                  className="w-full max-h-48 object-contain bg-muted"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7 rounded-full"
                  onClick={clearScreenshot}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Camera className="h-6 w-6" />
                  <ImagePlus className="h-6 w-6" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  Tap to take a photo or choose from gallery
                </span>
                <span className="text-xs text-muted-foreground/60">
                  PNG, JPG up to 5MB
                </span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Page: {window.location.hash || "/"}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !description.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Submit Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
