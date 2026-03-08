import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import {
  Bug, Loader2, CheckCircle2, ExternalLink, Image, AlertTriangle,
  Filter, ChevronDown, Eye, Monitor, Smartphone, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";

interface BugReport {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  org_id: string | null;
  page_url: string | null;
  user_agent: string | null;
  description: string;
  console_errors: string | null;
  screenshot_url: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  error_fingerprint: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Open", variant: "destructive" },
  new: { label: "New", variant: "destructive" },
  investigating: { label: "Investigating", variant: "outline" },
  resolved: { label: "Resolved", variant: "default" },
  dismissed: { label: "Dismissed", variant: "secondary" },
};

function isMobile(ua: string | null): boolean {
  if (!ua) return false;
  return /mobile|android|iphone|ipad/i.test(ua);
}

function isUserReport(desc: string): boolean {
  return desc.startsWith("[USER]");
}

export default function BugReports() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);

  const { data: counts } = useQuery({
    queryKey: ["bug-report-counts", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bug_reports")
        .select("status")
        .eq("org_id", orgId!);
      const open = data?.filter(r => r.status === "open" || r.status === "new").length || 0;
      const resolved = data?.filter(r => r.status === "resolved").length || 0;
      const withScreenshots = 0; // Will count from main query
      return { open, resolved, total: data?.length || 0 };
    },
    enabled: !!orgId,
  });

  const {
    data: reports,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["bug-reports", orgId, statusFilter, sourceFilter],
    queryFn: async () => {
      let query = supabase
        .from("bug_reports")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter === "open") {
        query = query.in("status", ["open", "new"]);
      } else if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      let filtered = data as BugReport[];
      if (sourceFilter === "user") {
        filtered = filtered.filter(r => isUserReport(r.description));
      } else if (sourceFilter === "auto") {
        filtered = filtered.filter(r => !isUserReport(r.description));
      } else if (sourceFilter === "screenshots") {
        filtered = filtered.filter(r => !!r.screenshot_url);
      }

      return filtered;
    },
    enabled: !!orgId,
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <Bug className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bug Reports</h1>
            <p className="text-sm text-muted-foreground">
              User-submitted and auto-detected bug reports with screenshots
            </p>
          </div>
        </div>
        {(counts?.open || 0) > 0 && (
          <Badge variant="destructive" className="h-8 px-3 text-sm">
            {counts?.open} Open
          </Badge>
        )}
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="cursor-pointer hover:border-red-500/50 transition-colors" onClick={() => setStatusFilter("open")}>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{counts?.open || 0}</p>
              <p className="text-xs text-muted-foreground">Open</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-green-500/50 transition-colors" onClick={() => setStatusFilter("resolved")}>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{counts?.resolved || 0}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-blue-500/50 transition-colors" onClick={() => setStatusFilter("all")}>
          <CardContent className="p-4 flex items-center gap-3">
            <Bug className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{counts?.total || 0}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open / New</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="user">User Submitted</SelectItem>
            <SelectItem value="auto">Auto-Detected</SelectItem>
            <SelectItem value="screenshots">With Screenshots</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reports List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : isError ? (
        <QueryError message="Failed to load bug reports." onRetry={refetch} />
      ) : !reports?.length ? (
        <div className="text-center p-12 text-muted-foreground border-2 border-dashed rounded-lg">
          No bug reports found for this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <BugReportCard
              key={report.id}
              report={report}
              onSelect={() => setSelectedReport(report)}
            />
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      {selectedReport && (
        <BugReportDetail
          report={selectedReport}
          open={!!selectedReport}
          onClose={() => setSelectedReport(null)}
          onUpdate={() => { refetch(); setSelectedReport(null); }}
        />
      )}
    </motion.div>
  );
}

function BugReportCard({ report, onSelect }: { report: BugReport; onSelect: () => void }) {
  const isUser = isUserReport(report.description);
  const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.open;
  const mobile = isMobile(report.user_agent);

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${
        report.screenshot_url ? "border-l-4 border-l-blue-400" : ""
      } ${isUser ? "border-l-4 border-l-yellow-400" : ""}`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
              {isUser && <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700">User Report</Badge>}
              {report.screenshot_url && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                  <Image className="h-3 w-3 mr-1" /> Screenshot
                </Badge>
              )}
              {mobile ? (
                <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm truncate font-medium">
              {report.description.replace(/^\[USER\]\s*|\[AUTO\]\s*/i, "")}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(report.created_at), "MMM d, h:mm a")}
              </span>
              {report.user_email && <span>{report.user_email}</span>}
              {report.page_url && <span className="truncate max-w-[150px]">{report.page_url}</span>}
            </div>
          </div>

          {report.screenshot_url && (
            <div className="flex-shrink-0 w-16 h-16 rounded border overflow-hidden bg-muted">
              <img
                src={report.screenshot_url}
                alt="Bug screenshot"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BugReportDetail({
  report,
  open,
  onClose,
  onUpdate,
}: {
  report: BugReport;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState(report.status);
  const [adminNotes, setAdminNotes] = useState(report.admin_notes || "");
  const [saving, setSaving] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);

  let consoleErrors: unknown[] = [];
  try {
    consoleErrors = report.console_errors ? JSON.parse(report.console_errors) : [];
  } catch { /* ignore */ }

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = { status, admin_notes: adminNotes };
      if (status === "resolved" && report.status !== "resolved") {
        updateData.resolved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("bug_reports")
        .update(updateData)
        .eq("id", report.id);
      if (error) throw error;
      toast({ title: "Bug report updated" });
      onUpdate();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to update", description: (err as Error)?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-red-500" />
              Bug Report Detail
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Screenshot */}
            {report.screenshot_url && (
              <div className="space-y-1">
                <Label>Screenshot</Label>
                <div
                  className="relative rounded-lg border overflow-hidden cursor-pointer group"
                  onClick={() => setImageExpanded(true)}
                >
                  <img
                    src={report.screenshot_url}
                    alt="Bug screenshot"
                    className="w-full max-h-64 object-contain bg-muted"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <Eye className="h-8 w-8 text-white opacity-0 group-hover:opacity-70 transition-opacity" />
                  </div>
                </div>
                <a
                  href={report.screenshot_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Open full size
                </a>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1">
              <Label>Description</Label>
              <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                {report.description.replace(/^\[USER\]\s*|\[AUTO\]\s*/i, "")}
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Reported</Label>
                <p>{format(new Date(report.created_at), "MMM d, yyyy h:mm a")}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">User</Label>
                <p>{report.user_email || "Anonymous"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Role</Label>
                <p>{report.user_role || "unknown"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Page</Label>
                <p className="truncate">{report.page_url || "N/A"}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Device</Label>
                <p className="truncate text-xs">{report.user_agent || "N/A"}</p>
              </div>
            </div>

            {/* Console Errors */}
            {Array.isArray(consoleErrors) && consoleErrors.length > 0 && (
              <div className="space-y-1">
                <Label>Console Errors</Label>
                <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-lg text-xs font-mono max-h-40 overflow-y-auto space-y-1">
                  {consoleErrors.map((err, i) => (
                    <div key={i} className="text-red-400 break-all">
                      {typeof err === "string" ? err : JSON.stringify(err)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status + Admin Notes */}
            <div className="space-y-2 border-t pt-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="investigating">Investigating</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Admin Notes</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about diagnosis, fix applied, etc..."
                  rows={3}
                />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-screen image viewer */}
      <Dialog open={imageExpanded} onOpenChange={setImageExpanded}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2">
          {report.screenshot_url && (
            <img
              src={report.screenshot_url}
              alt="Bug screenshot full"
              className="w-full h-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
