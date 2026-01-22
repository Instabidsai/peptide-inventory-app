import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Star, Reply, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export default function AdminFeedback() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Reply State
    const [replyOpen, setReplyOpen] = useState(false);
    const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
    const [replyText, setReplyText] = useState("");
    const [replyLink, setReplyLink] = useState("");

    const { data: feedbacks, isLoading } = useQuery({
        queryKey: ['admin-feedback'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('protocol_feedback')
                .select(`
                    *,
                    protocols (name, contact_id),
                    // We can't easily join to contact name via protocols -> contacts in one go without flattened query or custom view
                    // But we can try nested, or just fetch contacts separately. 
                    // Let's rely on protocols containing contact_id and match client side or do deep select
                    protocols (
                        name,
                        contacts (name, email)
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
        refetchInterval: 30000 // Real-timeish
    });

    const sendReply = useMutation({
        mutationFn: async () => {
            if (!selectedFeedback) return;
            const { error } = await supabase
                .from('protocol_feedback')
                .update({
                    admin_response: replyText,
                    response_link: replyLink || null,
                    response_at: new Date().toISOString(),
                    is_read_by_client: false
                })
                .eq('id', selectedFeedback.id);

            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Reply Sent", description: "The client will be notified." });
            setReplyOpen(false);
            setReplyText("");
            setReplyLink("");
            queryClient.invalidateQueries({ queryKey: ['admin-feedback'] });
        },
        onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Failed to send reply." });
        }
    });

    const handleReplyClick = (fb: any) => {
        setSelectedFeedback(fb);
        setReplyText(fb.admin_response || "");
        setReplyLink(fb.response_link || "");
        setReplyOpen(true);
    };

    if (isLoading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;

    const needsAttention = feedbacks?.filter((f: any) => !f.admin_response && (f.rating <= 3 || f.comment?.length > 10)).length || 0;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Client Feedback</h1>
                    <p className="text-muted-foreground">Monitor and respond to client logs.</p>
                </div>
                {needsAttention > 0 && (
                    <Badge variant="destructive" className="h-8 px-3 text-sm">
                        {needsAttention} Needs Response
                    </Badge>
                )}
            </div>

            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Client</TableHead>
                            <TableHead>Protocol</TableHead>
                            <TableHead>Rating</TableHead>
                            <TableHead>Comment</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {feedbacks?.map((fb: any) => {
                            const clientName = fb.protocols?.contacts?.name || 'Unknown';
                            const protocolName = fb.protocols?.name || 'Unknown';
                            const isNegative = fb.rating <= 3;

                            return (
                                <TableRow key={fb.id}>
                                    <TableCell className="font-medium">{clientName}</TableCell>
                                    <TableCell>{protocolName}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            {fb.rating} <Star className={`h-3 w-3 ${isNegative ? 'text-destructive fill-current' : 'text-yellow-400 fill-current'}`} />
                                        </div>
                                    </TableCell>
                                    <TableCell className="max-w-xs truncate" title={fb.comment}>
                                        {fb.comment || '-'}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                                        {formatDistanceToNow(new Date(fb.created_at), { addSuffix: true })}
                                    </TableCell>
                                    <TableCell>
                                        {fb.admin_response ? (
                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                <CheckCircle2 className="h-3 w-3 mr-1" /> Replied
                                            </Badge>
                                        ) : isNegative ? (
                                            <Badge variant="destructive">Needs Review</Badge>
                                        ) : (
                                            <Badge variant="secondary">Pending</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm" variant={fb.admin_response ? "ghost" : "default"} onClick={() => handleReplyClick(fb)}>
                                            <Reply className="h-4 w-4 mr-1" />
                                            {fb.admin_response ? 'Edit Reply' : 'Reply'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Card>

            <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reply to {selectedFeedback?.protocols?.contacts?.name}</DialogTitle>
                        <DialogDescription>
                            Orginal Feedback: "{selectedFeedback?.comment}"
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Message</Label>
                            <Textarea
                                placeholder="e.g. Thanks for the feedback! Try taking it with food."
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Resource Link (Optional)</Label>
                            <Input
                                placeholder="https://..."
                                value={replyLink}
                                onChange={e => setReplyLink(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReplyOpen(false)}>Cancel</Button>
                        <Button onClick={() => sendReply.mutate()} disabled={sendReply.isPending}>
                            {sendReply.isPending && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
                            Send Reply
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
