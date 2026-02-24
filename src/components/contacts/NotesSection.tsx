import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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
import { MessageSquare, Loader2, Send, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useContactNotes, useCreateContactNote, useDeleteContactNote } from '@/hooks/use-contact-notes';

interface NotesSectionProps {
    contactId: string;
}

export function NotesSection({ contactId }: NotesSectionProps) {
    const { data: contactNotes, isLoading: isLoadingNotes } = useContactNotes(contactId);
    const createNote = useCreateContactNote();
    const deleteNote = useDeleteContactNote();
    const [newNoteContent, setNewNoteContent] = useState('');
    const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

    return (
        <AccordionItem value="notes" className="border border-border/60 rounded-lg bg-card px-4">
            <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold text-lg">Notes</span>
                    {contactNotes && contactNotes.length > 0 && (
                        <Badge variant="secondary" className="ml-2">{contactNotes.length}</Badge>
                    )}
                </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
                {/* Add Note Input */}
                <div className="flex gap-2 mb-4">
                    <Textarea
                        placeholder="Type a note..."
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        className="min-h-[60px] resize-none"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && newNoteContent.trim()) {
                                e.preventDefault();
                                createNote.mutate({ contact_id: contactId, content: newNoteContent.trim() });
                                setNewNoteContent('');
                            }
                        }}
                    />
                    <Button
                        size="sm"
                        className="self-end"
                        disabled={!newNoteContent.trim() || createNote.isPending}
                        onClick={() => {
                            if (newNoteContent.trim()) {
                                createNote.mutate({ contact_id: contactId, content: newNoteContent.trim() });
                                setNewNoteContent('');
                            }
                        }}
                    >
                        {createNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </div>

                {/* Notes List */}
                {isLoadingNotes ? (
                    <div className="space-y-2">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                ) : contactNotes && contactNotes.length > 0 ? (
                    <div className="space-y-3">
                        {contactNotes.map((note) => (
                            <div key={note.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/30">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {format(new Date(note.created_at), 'MMM d, yyyy \u2022 h:mm a')}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-destructive shrink-0 h-7 w-7 p-0"
                                    onClick={() => setNoteToDelete(note.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm text-muted-foreground/70">No notes yet. Add your first note above.</p>
                    </div>
                )}

                <AlertDialog open={!!noteToDelete} onOpenChange={(open) => { if (!open) setNoteToDelete(null); }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Note</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete this note. This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (noteToDelete) { deleteNote.mutate({ id: noteToDelete, contact_id: contactId }); setNoteToDelete(null); } }}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </AccordionContent>
        </AccordionItem>
    );
}
