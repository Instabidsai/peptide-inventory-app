import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Loader2, MessageSquare, Plus, Clock, CheckCircle2, XCircle, Archive, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClientRequestModal } from "@/components/client/ClientRequestModal";
import { MessageThread } from "@/components/messaging/MessageThread";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ClientMessages() {
    const { user } = useAuth();
    const [modalOpen, setModalOpen] = useState(false);
    const [viewId, setViewId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const { data: requests, isLoading, refetch } = useQuery({
        queryKey: ['client-requests', user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from('client_requests')
                .select('*, peptide:peptides(name)')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!user
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
            case 'approved':
                return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
            case 'fulfilled':
                return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Fulfilled</Badge>;
            case 'rejected':
                return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-200"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
            default:
                return <Badge variant="secondary"><Archive className="w-3 h-3 mr-1" /> Archived</Badge>;
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'product_request':
                return <ShoppingBag className="h-4 w-4 text-purple-500" />;
            case 'regimen_help':
                return <ShoppingBag className="h-4 w-4 text-blue-500" />;
            default:
                return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            const { error } = await supabase
                .from('client_requests')
                .delete()
                .eq('id', deleteId);

            if (error) throw error;
            toast.success("Message deleted");
            refetch();
        } catch (error) {
            toast.error("Failed to delete message");
            console.error(error);
        } finally {
            setDeleteId(null);
        }
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Messages & Requests</h1>
                    <p className="text-muted-foreground">
                        Contact the team or track your refill requests.
                    </p>
                </div>
                <Button onClick={() => setModalOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Message
                </Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : requests?.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                        <div className="p-4 rounded-full bg-secondary/50 mb-4">
                            <MessageSquare className="h-8 w-8 opacity-50" />
                        </div>
                        <h3 className="text-lg font-medium mb-1">No messages yet</h3>
                        <p className="text-sm mb-4">You haven't sent any requests or messages.</p>
                        <Button variant="outline" onClick={() => setModalOpen(true)}>Start a conversation</Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {requests?.map((req) => (
                        <Card key={req.id} className="overflow-hidden">
                            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-full bg-secondary/50">
                                        {getTypeIcon(req.type)}
                                    </div>
                                    <div>
                                        <CardTitle className="text-base font-medium">
                                            {req.subject || "No Subject"}
                                        </CardTitle>
                                        <CardDescription className="text-xs">
                                            {format(new Date(req.created_at), 'MMM d, yyyy h:mm a')}
                                        </CardDescription>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {getStatusBadge(req.status)}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-red-500 -mr-2"
                                        onClick={() => setDeleteId(req.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setViewId(req.id)}
                                    >
                                        View Thread
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                    {req.message}
                                </p>
                                {req.peptide && (
                                    <div className="mt-3 p-2 bg-secondary/30 rounded text-xs flex items-center gap-2">
                                        <ShoppingBag className="h-3 w-3" />
                                        Requested: <span className="font-medium">{req.requested_quantity}x {req.peptide.name}</span>
                                    </div>
                                )}
                                {req.admin_notes && (
                                    <div className="mt-3 pl-3 border-l-2 border-emerald-500/20">
                                        <p className="text-xs font-medium text-emerald-600 mb-1">Response:</p>
                                        <p className="text-sm">{req.admin_notes}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <ClientRequestModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                onSuccess={() => refetch()}
            />

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Message?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This cannot be undone. The message will be permanently removed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={!!viewId} onOpenChange={(open) => !open && setViewId(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Conversation</DialogTitle>
                    </DialogHeader>
                    {viewId && <MessageThread requestId={viewId} userRole="client" />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
