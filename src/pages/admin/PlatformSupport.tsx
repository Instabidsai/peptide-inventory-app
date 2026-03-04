import { useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/sb_client/client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { PlatformContactCard } from "@/components/admin/PlatformContactCard";
import { format } from "date-fns";

export default function PlatformSupport() {
  usePageTitle("Platform Support");
  const { user, organization } = useAuth();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data: pastMessages, refetch } = useQuery({
    queryKey: ["platform_support_messages", user?.email],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_submissions")
        .select("*")
        .eq("email", user?.email ?? "")
        .in("source", ["tenant_support", "tenant_contact"])
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user?.email,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("lead_submissions").insert({
        name: subject.trim() || "Support Request",
        email: user?.email ?? "",
        message: message.trim(),
        source: "tenant_support",
        org_id: organization?.id ?? null,
      });
      if (error) throw error;
      toast({ title: "Message sent", description: "We'll respond within 24 hours." });
      setSubject("");
      setMessage("");
      setShowForm(false);
      refetch();
    } catch {
      toast({ title: "Error", description: "Failed to send. Try emailing admin@thepeptideai.com directly.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-border/60 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Support</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Contact the ThePeptideAI team for help with your account, billing, or platform questions.
        </p>
      </div>

      <PlatformContactCard onMessageClick={() => setShowForm(true)} />

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Send a Message</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                placeholder="Subject (optional)"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={inputCls}
              />
              <textarea
                placeholder="Describe your question or issue..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className={inputCls + " resize-none"}
                required
              />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  {submitting ? "Sending..." : "Send Message"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {pastMessages && pastMessages.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pastMessages.map((msg: any) => (
                <div key={msg.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/30">
                  <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground truncate">{msg.name || "Support Request"}</span>
                      <Badge variant="secondary" className="text-[10px]">Sent</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{msg.message}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {format(new Date(msg.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
