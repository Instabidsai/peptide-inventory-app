import { useState } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Plus, FileText, FlaskConical, Loader2, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ResourcesCardProps {
    contactId: string;
}

export function ResourcesCard({ contactId }: ResourcesCardProps) {
    return (
        <Card className="md:col-span-1 h-fit">
            <CardHeader>
                <CardTitle>Resources</CardTitle>
                <CardDescription>Assign educational content.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Resource
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Resource</DialogTitle>
                            <DialogDescription>Share a video, article, or PDF.</DialogDescription>
                        </DialogHeader>
                        <AddResourceForm contactId={contactId} onComplete={() => {}} />
                    </DialogContent>
                </Dialog>

                <div className="space-y-2">
                    <ResourceList contactId={contactId} />
                </div>
            </CardContent>
        </Card>
    );
}

function AddResourceForm({ contactId, onComplete }: { contactId: string, onComplete: () => void }) {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [type, setType] = useState<'video' | 'article' | 'pdf'>('article');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('resources')
                .insert({
                    contact_id: contactId,
                    title,
                    url,
                    type
                });

            if (error) throw error;
            toast({ title: 'Resource Added' });
            queryClient.invalidateQueries({ queryKey: ['resources', contactId] });
            onComplete();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to add resource' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. How to Inject" required />
            </div>
            <div className="space-y-2">
                <Label>URL</Label>
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required />
            </div>
            <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="article">Article</SelectItem>
                        <SelectItem value="pdf">PDF</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Add Resource'}
            </Button>
        </form>
    );
}

function ResourceList({ contactId }: { contactId: string }) {
    const queryClient = useQueryClient();
    const [resourceToDelete, setResourceToDelete] = useState<string | null>(null);
    const { data: resources, isLoading } = useQuery({
        queryKey: ['resources', contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('resources')
                .select('*')
                .eq('contact_id', contactId);
            if (error) throw error;
            return data || [];
        },
        enabled: !!contactId,
    });

    const deleteResource = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('resources').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resources', contactId] });
            toast({ title: 'Resource removed' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to remove resource', description: error.message });
        },
    });

    if (isLoading) return <Skeleton className="h-8 w-full" />;

    if (!resources || resources.length === 0) {
        return <div className="text-xs text-muted-foreground text-center py-2">No assigned resources.</div>;
    }

    return (
        <>
            <div className="space-y-2">
                {resources.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-2 border border-border/60 rounded-lg bg-muted/50 text-sm">
                        <div className="flex items-center gap-2 overflow-hidden">
                            {r.type === 'video' ? <FlaskConical className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                            <span className="truncate">{r.title}</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete resource"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            disabled={deleteResource.isPending}
                            onClick={() => setResourceToDelete(r.id)}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                ))}
            </div>
            <AlertDialog open={!!resourceToDelete} onOpenChange={(open) => { if (!open) setResourceToDelete(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Resource</AlertDialogTitle>
                        <AlertDialogDescription>This will remove this resource from the contact. This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (resourceToDelete) { deleteResource.mutate(resourceToDelete); setResourceToDelete(null); } }}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
