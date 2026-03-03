import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare, Bug, Lightbulb, HelpCircle, CheckCircle2, XCircle,
  Loader2, ShoppingBag, ArrowRight, Archive, Zap,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { MessageThread } from "@/components/messaging/MessageThread";
import { motion } from "framer-motion";

// ── Types ───────────────────────────────────────────────────────────

interface ClientRequest {
  id: string;
  user_id: string;
  type: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  admin_notes?: string | null;
  peptide_id?: string | null;
  requested_quantity?: number | null;
  attachments?: Array<{ name?: string; type?: string; url: string }>;
  profile?: { full_name?: string; email?: string } | null;
  peptide?: { name?: string; id?: string } | null;
}

interface PartnerSuggestion {
  id: string;
  org_id: string;
  partner_id: string;
  suggestion_text: string;
  category: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  partner_name?: string | null;
}

// ── Constants ───────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: typeof Bug; label: string; color: string }> = {
  bug: { icon: Bug, label: "Bug Report", color: "text-red-500" },
  feature: { icon: Lightbulb, label: "Feature Request", color: "text-amber-400" },
  question: { icon: HelpCircle, label: "Question", color: "text-blue-400" },
  other: { icon: MessageSquare, label: "Other", color: "text-gray-400" },
};

const SUGGESTION_STATUS: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  new: { variant: "outline", label: "New" },
  reviewed: { variant: "secondary", label: "Reviewed" },
  implemented: { variant: "default", label: "Implemented" },
  dismissed: { variant: "destructive", label: "Dismissed" },
};

// ── Main Component ──────────────────────────────────────────────────

export default function FeedbackHub() {
  const { organization, userRole } = useAuth();
  const orgId = organization?.id;
  const isSuperAdmin = userRole?.role === "super_admin";

  // Badge counts — client requests (org-scoped)
  const { data: clientCount } = useQuery({
    queryKey: ["feedback-hub-client-count", orgId],
    queryFn: async () => {
      const { count } = await supabase
        .from("client_requests")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId!)
        .in("status", ["pending"]);
      return count || 0;
    },
    enabled: !!orgId,
  });

  // Partner suggestions count — super_admin only
  const { data: partnerCount } = useQuery({
    queryKey: ["feedback-hub-partner-count", orgId],
    queryFn: async () => {
      const { count } = await supabase
        .from("partner_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId!)
        .eq("status", "new");
      return count || 0;
    },
    enabled: !!orgId && isSuperAdmin,
  });

  const totalBadge = (clientCount || 0) + (isSuperAdmin ? (partnerCount || 0) : 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="flex justify-between items-center"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Feedback Hub</h1>
            <p className="text-sm text-muted-foreground">
              {isSuperAdmin
                ? "Client requests and partner feedback — all in one place."
                : "Client requests from your organization."}
            </p>
          </div>
        </div>
        {totalBadge > 0 && (
          <Badge variant="destructive" className="h-8 px-3 text-sm">
            {totalBadge} Need Attention
          </Badge>
        )}
      </motion.div>

      {isSuperAdmin ? (
        <Tabs defaultValue="clients" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="clients" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Client Requests
              {(clientCount || 0) > 0 && (
                <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white px-1">
                  {clientCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="partners" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Partner Feedback
              {(partnerCount || 0) > 0 && (
                <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white px-1">
                  {partnerCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clients">
            <ClientRequestsTab />
          </TabsContent>
          <TabsContent value="partners">
            <PartnerSuggestionsTab />
          </TabsContent>
        </Tabs>
      ) : (
        /* Non-super-admin: only Client Requests, no tabs needed */
        <ClientRequestsTab />
      )}
    </motion.div>
  );
}

// ── Send to Auto-Heal Button ────────────────────────────────────────

function SendToAutoHealButton({
  title,
  description,
  source,
  sourceId,
}: {
  title: string;
  description: string;
  source: string;
  sourceId: string;
}) {
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    setSending(true);
    try {
      const fingerprint = `user_feedback_${source}_${sourceId}`;

      // Check if already sent
      const { data: existing } = await supabase
        .from("bug_reports")
        .select("id")
        .eq("error_fingerprint", fingerprint)
        .maybeSingle();

      if (existing) {
        toast({
          title: "Already Sent",
          description: "This feedback was already sent to the auto-heal system.",
        });
        return;
      }

      // Create a bug_report entry that the sentinel will pick up
      const { error } = await supabase.from("bug_reports").insert({
        description: `[USER FEEDBACK] ${title}\n\n${description}`,
        console_errors: JSON.stringify([
          { type: "user_feedback", source, sourceId, title },
        ]),
        page_url: `feedback-hub/${source}/${sourceId}`,
        user_agent: "admin-feedback-hub",
        error_fingerprint: fingerprint,
        status: "new",
      });

      if (error) throw error;

      toast({
        title: "Sent to Auto-Heal",
        description: "The sentinel will process this within 2 minutes. Check incidents for progress.",
      });
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to send",
        description: (err as Error)?.message || "Unknown error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleSend}
      disabled={sending}
      className="text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
      title="Send to auto-heal system for AI diagnosis and fix"
    >
      {sending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
      ) : (
        <Zap className="h-3.5 w-3.5 mr-1" />
      )}
      Auto-Heal
    </Button>
  );
}

// ── Tab 1: Client Requests (org-scoped) ─────────────────────────────

function ClientRequestsTab() {
  const navigate = useNavigate();
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [activeTab, setActiveTab] = useState("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const {
    data: requests,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["feedback-hub-client-requests", activeTab, orgId],
    queryFn: async () => {
      let query = supabase
        .from("client_requests")
        .select(
          "*, profile:profiles!client_requests_profile_fk(full_name, email), peptide:peptides(name, id)"
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });

      if (activeTab === "pending") {
        query = query.in("status", ["pending", "approved"]);
      } else {
        query = query.in("status", ["fulfilled", "rejected", "archived"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ClientRequest[];
    },
    enabled: !!orgId,
  });

  const handleStatusUpdate = async (
    id: string,
    newStatus: string,
    notes?: string
  ) => {
    setProcessingId(id);
    try {
      const updateData: Record<string, unknown> = { status: newStatus };
      if (notes) updateData.admin_notes = notes;

      const { error } = await supabase
        .from("client_requests")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      const targetReq = requests?.find((r) => r.id === id);
      if (targetReq) {
        await supabase.from("notifications").insert({
          user_id: targetReq.user_id,
          type:
            newStatus === "approved"
              ? "success"
              : newStatus === "rejected"
              ? "error"
              : "info",
          title: `Request ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
          message: notes || `Your request has been marked as ${newStatus}.`,
          link: "/messages",
        });
      }

      sonnerToast.success(`Request ${newStatus}`);
      refetch();
    } catch (error) {
      sonnerToast.error(
        "Error: " + ((error as Error)?.message || "Unknown error")
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleFulfill = (req: ClientRequest) => {
    navigate("/sales/new", {
      state: {
        prefill: {
          email: req.profile?.email,
          peptideId: req.peptide_id,
          quantity: req.requested_quantity,
          notes: `Fulfilling request: ${req.subject}`,
        },
      },
    });
  };

  return (
    <div className="space-y-4">
      <Tabs
        defaultValue="pending"
        className="space-y-4"
        onValueChange={setActiveTab}
      >
        <TabsList>
          <TabsTrigger value="pending">Inbox (Pending)</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : isError ? (
            <QueryError
              message="Failed to load requests."
              onRetry={refetch}
            />
          ) : requests?.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground border-2 border-dashed rounded-lg">
              No requests found.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {requests?.map((req) => (
                <ClientRequestCard
                  key={req.id}
                  req={req}
                  onUpdate={handleStatusUpdate}
                  onFulfill={handleFulfill}
                  processing={processingId === req.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ClientRequestCard({
  req,
  onUpdate,
  onFulfill,
  processing,
}: {
  req: ClientRequest;
  onUpdate: (id: string, status: string, notes?: string) => void;
  onFulfill: (req: ClientRequest) => void;
  processing: boolean;
}) {
  const [showReply, setShowReply] = useState(false);
  const isProductRequest = req.type === "product_request";
  const isBugLike =
    req.type === "general_inquiry" &&
    /bug|broken|error|not working|crash|won't load|can't access/i.test(
      req.subject + " " + req.message
    );

  return (
    <Card
      className={`flex flex-col ${
        req.status === "pending" ? "border-l-4 border-l-yellow-400" : ""
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {req.profile?.full_name?.substring(0, 2).toUpperCase() || "??"}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">
                {req.profile?.full_name || "Unknown User"}
              </CardTitle>
              <CardDescription className="text-xs">
                {format(new Date(req.created_at), "MMM d, h:mm a")}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isBugLike && (
              <Badge
                variant="outline"
                className="bg-red-50 text-red-600 text-xs"
              >
                <Bug className="h-3 w-3 mr-0.5" />
                Bug?
              </Badge>
            )}
            {req.status === "pending" && (
              <Badge
                variant="outline"
                className="bg-yellow-50 text-yellow-600"
              >
                New
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 text-sm space-y-3">
        <div className="font-medium flex items-center gap-2">
          {req.type === "product_request" ? (
            <ShoppingBag className="h-4 w-4 text-purple-500" />
          ) : (
            <MessageSquare className="h-4 w-4 text-blue-500" />
          )}
          {req.subject}
        </div>
        <div className="text-muted-foreground bg-secondary/30 p-2 rounded">
          &ldquo;{req.message}&rdquo;
        </div>

        {req.attachments &&
          Array.isArray(req.attachments) &&
          req.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {req.attachments.map((att) => (
                <a
                  key={att.url}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative block w-16 h-16 rounded border overflow-hidden hover:ring-2 ring-primary"
                >
                  {att.type?.startsWith("image/") ? (
                    <img
                      src={att.url}
                      alt={att.name || "Attachment"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted text-xs text-center p-1 break-all">
                      {att.name}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}

        {req.peptide && (
          <div className="flex items-center gap-2 text-xs bg-purple-500/10 p-2 rounded text-purple-400">
            <ShoppingBag className="h-3 w-3" />
            Requested:{" "}
            <span className="font-bold">
              {req.requested_quantity}x {req.peptide.name}
            </span>
          </div>
        )}
      </CardContent>
      <div className="pt-2 px-6 pb-4 border-t flex flex-wrap gap-2 justify-between">
        <SendToAutoHealButton
          title={req.subject}
          description={req.message}
          source="client_request"
          sourceId={req.id}
        />

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReply(true)}
          >
            <MessageSquare className="mr-1 h-3.5 w-3.5" /> Thread
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            title="Archive"
            onClick={() => onUpdate(req.id, "archived")}
            disabled={processing}
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
            title="Reject"
            onClick={() => onUpdate(req.id, "rejected")}
            disabled={processing}
          >
            <XCircle className="h-4 w-4" />
          </Button>

          {isProductRequest && req.status !== "fulfilled" ? (
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90"
              onClick={() => onFulfill(req)}
              disabled={processing}
            >
              {processing ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              {processing ? (
                "Fulfilling..."
              ) : (
                <>
                  Fulfill <ArrowRight className="ml-1 h-3 w-3" />
                </>
              )}
            </Button>
          ) : (
            req.status === "pending" && (
              <Button
                size="sm"
                onClick={() => onUpdate(req.id, "approved")}
                disabled={processing}
              >
                {processing ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                {processing ? (
                  "Processing..."
                ) : (
                  <>
                    Mark Done <CheckCircle2 className="ml-1 h-3 w-3" />
                  </>
                )}
              </Button>
            )
          )}
        </div>
      </div>

      <Dialog open={showReply} onOpenChange={setShowReply}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Conversation with {req.profile?.full_name}
            </DialogTitle>
          </DialogHeader>
          {showReply && <MessageThread requestId={req.id} userRole="admin" />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Tab 2: Partner Suggestions (super_admin only) ───────────────────

function PartnerSuggestionsTab() {
  const { organization } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingSuggestion, setEditingSuggestion] =
    useState<PartnerSuggestion | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const {
    data: suggestions,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["feedback-hub-partner-suggestions", organization?.id],
    queryFn: async () => {
      // Step 1: fetch suggestions (no FK join — partner_id is auth.uid, not profiles.id)
      const { data: rawSuggestions, error } = await supabase
        .from("partner_suggestions")
        .select("*")
        .eq("org_id", organization!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!rawSuggestions?.length) return [] as PartnerSuggestion[];

      // Step 2: fetch partner names from profiles (partner_id = user_id in profiles)
      const partnerIds = [...new Set(rawSuggestions.map((s) => s.partner_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", partnerIds);

      const nameMap = new Map(
        (profiles || []).map((p) => [p.user_id, p.full_name])
      );

      // Step 3: merge names onto suggestions
      return rawSuggestions.map((s) => ({
        ...s,
        partner_name: nameMap.get(s.partner_id) || null,
      })) as PartnerSuggestion[];
    },
    enabled: !!organization?.id,
  });

  const updateSuggestion = useMutation({
    mutationFn: async ({
      id,
      status,
      admin_notes,
    }: {
      id: string;
      status: string;
      admin_notes: string;
    }) => {
      const { error } = await supabase
        .from("partner_suggestions")
        .update({ status, admin_notes })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["feedback-hub-partner-suggestions"],
      });
      toast({ title: "Suggestion updated" });
      setEditingSuggestion(null);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <QueryError message="Failed to load partner feedback." onRetry={refetch} />
    );
  }

  if (!suggestions?.length) {
    return (
      <div className="text-center p-12 text-muted-foreground border-2 border-dashed rounded-lg">
        No partner feedback yet. Partners can submit ideas through their AI
        chat.
      </div>
    );
  }

  return (
    <>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead className="max-w-[300px]">Feedback</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suggestions.map((s) => {
              const cat = CATEGORY_CONFIG[s.category] || CATEGORY_CONFIG.other;
              const st = SUGGESTION_STATUS[s.status] || SUGGESTION_STATUS.new;
              const CatIcon = cat.icon;
              const isBugCategory = s.category === "bug";

              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <CatIcon className={`h-3.5 w-3.5 ${cat.color}`} />
                      <span className="text-xs">{cat.label}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.partner_name || "Unknown"}
                  </TableCell>
                  <TableCell className="max-w-[300px]">
                    <p
                      className="text-sm truncate"
                      title={s.suggestion_text}
                    >
                      {s.suggestion_text}
                    </p>
                    {s.admin_notes && (
                      <p
                        className="text-xs text-muted-foreground mt-0.5 truncate"
                        title={s.admin_notes}
                      >
                        Note: {s.admin_notes}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(s.created_at), "MMM d, h:mm a")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(isBugCategory ||
                        /bug|broken|error|not working|crash/i.test(
                          s.suggestion_text
                        )) && (
                        <SendToAutoHealButton
                          title={`Partner ${cat.label}: ${s.suggestion_text.slice(0, 80)}`}
                          description={s.suggestion_text}
                          source="partner_suggestion"
                          sourceId={s.id}
                        />
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingSuggestion(s);
                          setEditStatus(s.status);
                          setEditNotes(s.admin_notes || "");
                        }}
                      >
                        Review
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={!!editingSuggestion}
        onOpenChange={(open) => {
          if (!open) setEditingSuggestion(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Feedback</DialogTitle>
          </DialogHeader>
          {editingSuggestion && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">
                  {editingSuggestion.partner_name || "Unknown Partner"}
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  {format(
                    new Date(editingSuggestion.created_at),
                    "MMM d, yyyy h:mm a"
                  )}
                </p>
                <p className="whitespace-pre-wrap">
                  {editingSuggestion.suggestion_text}
                </p>
              </div>

              <div className="flex gap-2">
                <SendToAutoHealButton
                  title={`Partner feedback: ${editingSuggestion.suggestion_text.slice(0, 80)}`}
                  description={editingSuggestion.suggestion_text}
                  source="partner_suggestion"
                  sourceId={editingSuggestion.id}
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="implemented">Implemented</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Admin Notes</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add internal notes about this feedback..."
                  rows={3}
                />
              </div>

              <Button
                className="w-full"
                onClick={() =>
                  updateSuggestion.mutate({
                    id: editingSuggestion.id,
                    status: editStatus,
                    admin_notes: editNotes,
                  })
                }
                disabled={updateSuggestion.isPending}
              >
                {updateSuggestion.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
