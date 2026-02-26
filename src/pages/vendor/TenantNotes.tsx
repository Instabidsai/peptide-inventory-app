import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTenantNotes, useAddTenantNote } from '@/hooks/use-vendor-messages';
import { StickyNote, Plus, Send } from 'lucide-react';
import { format } from 'date-fns';

export default function TenantNotes({ orgId }: { orgId: string }) {
    const { data: notes, isLoading } = useTenantNotes(orgId);
    const addNote = useAddTenantNote(orgId);
    const [composing, setComposing] = useState(false);
    const [body, setBody] = useState('');

    const handleAdd = async () => {
        if (!body.trim()) return;
        try {
            await addNote.mutateAsync(body.trim());
            setBody('');
            setComposing(false);
        } catch {
            // toast handled by hook
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <StickyNote className="h-4 w-4" /> Internal Notes
                </CardTitle>
                {!composing && (
                    <Button variant="ghost" size="sm" onClick={() => setComposing(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Note
                    </Button>
                )}
            </CardHeader>
            <CardContent>
                {composing && (
                    <div className="mb-4 space-y-2">
                        <Textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            placeholder="Add an internal note about this tenant..."
                            rows={3}
                            className="text-sm"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => { setComposing(false); setBody(''); }}>
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleAdd} disabled={addNote.isPending || !body.trim()}>
                                <Send className="h-3.5 w-3.5 mr-1" />
                                {addNote.isPending ? 'Saving...' : 'Save Note'}
                            </Button>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading notes...</p>
                ) : !notes?.length ? (
                    <p className="text-sm text-muted-foreground">
                        {composing ? '' : 'No internal notes yet. Click "Add Note" to leave one.'}
                    </p>
                ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                        {notes.map(n => (
                            <div key={n.id} className="border-b pb-2 last:border-0">
                                <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                                <span className="text-[10px] text-muted-foreground">
                                    {format(new Date(n.created_at), 'MMM d, yyyy h:mm a')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
