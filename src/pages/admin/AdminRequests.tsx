import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageSquare, CheckCircle2, XCircle, Archive, ShoppingBag, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AudioRecorder } from "@/components/ui/AudioRecorder";
import { MessageThread } from "@/components/messaging/MessageThread";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function AdminRequests() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState("pending");
    const [processingId, setProcessingId] = useState<string | null>(null);

    const { data: requests, isLoading, refetch } = useQuery({
        queryKey: ['admin-requests', activeTab],
        queryFn: async () => {
            let query = supabase
                .from('client_requests')
                .select(`
            *,
            profile:user_id(full_name, email),
            peptide:peptides(name, id)
        `)
                .order('created_at', { ascending: false });

            if (activeTab === 'pending') {
                query = query.in('status', ['pending', 'approved']);
            } else {
                query = query.in('status', ['fulfilled', 'rejected', 'archived']);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data;
        }
    });

    const handleStatusUpdate = async (id: string, newStatus: string, notes?: string, voiceBlob?: Blob) => {
        setProcessingId(id);
        try {
            // 1. Upload Voice Note (if any)
            const adminAttachments: any[] = [];
            if (voiceBlob) {
                const fileName = `admin_voice_${Date.now()}.webm`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('messaging-attachments')
                    .upload(`${id}/${fileName}`, voiceBlob); // Use Request ID as folder for admin replies? Or User ID? Let's use Request ID context or User ID.
                // Actually, ClientRequestModal uses `user.id`. For Admin, we should probably store it under the CLIENT's user_id folder to keep it consistent, OR a generic 'admin' folder.
                // Let's use the `client_requests` row ID as the folder prefix for uniqueAdmin uploads to avoid permission issues if RLS is strict.
                // WAIT: RLS for Storage usually restricts to `auth.uid()`. Admin has full access.
                // Let's upload to `admin/${fileName}` directory.

                if (!uploadError && uploadData) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('messaging-attachments')
                        .getPublicUrl(uploadData.path);

                    adminAttachments.push({
                        name: 'Voice Message',
                        type: 'audio/webm',
                        url: publicUrl
                    });
                }
            }

            const updateData: any = { status: newStatus };
            if (notes) updateData.admin_notes = notes;
            if (adminAttachments.length > 0) updateData.admin_attachments = adminAttachments;

            const { error } = await supabase
                .from('client_requests')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;

            // Trigger Notification for Client
            const targetReq = requests?.find((r: any) => r.id === id);
            if (targetReq) {
                const message = notes
                    ? `Admin update: ${notes}`
                    : `Your request has been marked as ${newStatus}.`;

                await supabase.from('notifications').insert({
                    user_id: targetReq.user_id,
                    type: newStatus === 'approved' ? 'success' : newStatus === 'rejected' ? 'error' : 'info',
                    title: `Request ${newStatus ? newStatus.charAt(0).toUpperCase() + newStatus.slice(1) : 'Updated'}`,
                    message: message,
                    link: '/messages'
                });
            }

            toast.success(`Request ${newStatus}`);
            refetch();
        } catch (error: any) {
            toast.error("Error updating request: " + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handleFulfill = (req: any) => {
        navigate('/sales/new', {
            state: {
                prefill: {
                    email: req.profile?.email,
                    peptideId: req.peptide_id,
                    quantity: req.requested_quantity,
                    notes: `Fulfilling request: ${req.subject}`
                }
            }
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Client Requests</h1>
                <p className="text-muted-foreground">
                    Manage messages and orders from the family portal.
                </p>
            </div>

            <Tabs defaultValue="pending" className="space-y-6" onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="pending">Inbox (Pending)</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="space-y-4">
                    {isLoading ? (
                        <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
                    ) : requests?.length === 0 ? (
                        <div className="text-center p-12 text-muted-foreground border-2 border-dashed rounded-lg">No requests found.</div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {requests?.map((req: any) => (
                                <RequestCard
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

function RequestCard({ req, onUpdate, onFulfill, processing }: any) {
    const [notes, setNotes] = useState(req.admin_notes || "");
    const [showReply, setShowReply] = useState(false);
    const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);

    const isProductRequest = req.type === 'product_request';

    return (
        <Card className={`flex flex-col ${req.status === 'pending' ? 'border-l-4 border-l-yellow-400' : ''}`}>
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                            <AvatarFallback>{req.profile?.full_name?.substring(0, 2).toUpperCase() || '??'}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-base">{req.profile?.full_name || 'Unknown User'}</CardTitle>
                            <CardDescription className="text-xs">{format(new Date(req.created_at), 'MMM d, h:mm a')}</CardDescription>
                        </div>
                    </div>
                    {req.status === 'pending' && <Badge variant="outline" className="bg-yellow-50 text-yellow-600">New</Badge>}
                </div>
            </CardHeader>
            <CardContent className="flex-1 text-sm space-y-3">
                <div className="font-medium flex items-center gap-2">
                    {req.type === 'product_request' ? <ShoppingBag className="h-4 w-4 text-purple-500" /> : <MessageSquare className="h-4 w-4 text-blue-500" />}
                    {req.subject}
                </div>
                <div className="text-muted-foreground bg-secondary/30 p-2 rounded">
                    "{req.message}"
                </div>

                {/* Attachments Display */}
                {req.attachments && Array.isArray(req.attachments) && req.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {req.attachments.map((att: any, idx: number) => (
                            <a
                                key={idx}
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="group relative block w-16 h-16 rounded border overflow-hidden hover:ring-2 ring-primary"
                            >
                                {att.type?.startsWith('image/') ? (
                                    <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
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
                        Requested: <span className="font-bold">{req.requested_quantity}x {req.peptide.name}</span>
                    </div>
                )}

                {/* Reply / Thread Logic Replaced by Modal */}
            </CardContent>
            <CardFooter className="pt-2 border-t flex flex-wrap gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowReply(true)}>
                    <MessageSquare className="mr-2 h-4 w-4" /> Threads
                </Button>

                {/* Archive Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Archive request"
                    className="h-8 w-8 text-muted-foreground"
                    title="Archive"
                    onClick={() => onUpdate(req.id, 'archived')}
                    disabled={processing}
                >
                    <Archive className="h-4 w-4" />
                </Button>

                {/* Reject Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Reject request"
                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    title="Reject"
                    onClick={() => onUpdate(req.id, 'rejected', notes, voiceBlob)}
                    disabled={processing}
                >
                    <XCircle className="h-4 w-4" />
                </Button>

                {/* Action Button */}
                {isProductRequest && req.status !== 'fulfilled' ? (
                    <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => onFulfill(req)}
                        disabled={processing}
                    >
                        Fulfill <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                ) : (
                    req.status === 'pending' && (
                        <Button
                            size="sm"
                            onClick={() => onUpdate(req.id, 'approved', notes, voiceBlob)}
                            disabled={processing}
                        >
                            Mark Done <CheckCircle2 className="ml-1 h-3 w-3" />
                        </Button>
                    )
                )}
            </CardFooter>
            <Dialog open={showReply} onOpenChange={setShowReply}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Conversation with {req.profile?.full_name}</DialogTitle>
                    </DialogHeader>
                    {showReply && <MessageThread requestId={req.id} userRole="admin" />}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
