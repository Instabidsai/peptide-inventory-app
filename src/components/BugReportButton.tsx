import { useState } from "react";
import { Bug, Loader2, Send } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/sb_client/client";

export function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const handleSubmit = async () => {
    if (!description.trim()) return;

    setSubmitting(true);
    try {
      // Grab recent console errors captured by the interceptor in main.tsx
      const recentErrors = (window as unknown as { __recentConsoleErrors?: string[] }).__recentConsoleErrors || [];

      const { error } = await supabase.from("audit_log").insert({
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
          timestamp: new Date().toISOString(),
        },
      });

      if (error) throw error;

      toast({ title: "Bug reported", description: "Thank you! We'll look into it." });
      setDescription("");
      setOpen(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to submit",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full shadow-lg"
          title="Report a bug"
          aria-label="Report a bug"
        >
          <Bug className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a Bug</DialogTitle>
          <DialogDescription>
            Describe what went wrong. Include what you were doing and what you expected to happen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="bug-description">What happened?</Label>
            <Textarea
              id="bug-description"
              placeholder="e.g. I clicked 'Submit Order' but nothing happened..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Current page: {window.location.hash || "/"}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !description.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
