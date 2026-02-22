import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAllPartnerSuggestions, useUpdateSuggestionStatus, useAllClientRequests, useAllProtocolFeedback } from '@/hooks/use-vendor-support';
import { toast } from '@/hooks/use-toast';
import { MessageSquare, Bug, Lightbulb, HelpCircle, Star, ThumbsUp, ThumbsDown } from 'lucide-react';
import { format } from 'date-fns';

interface OrgJoin { name: string }
interface ProtocolJoin { name: string; org_id: string }
interface PartnerSuggestion {
    id: string; title?: string; body?: string; category: string; status: string;
    admin_notes?: string; created_at: string; org: OrgJoin | null;
}
interface ClientRequest {
    id: string; title?: string; request_type?: string; description?: string;
    notes?: string; status: string; created_at: string; org: OrgJoin | null;
}
interface ProtocolFeedback {
    id: string; rating: number; comment?: string; created_at: string;
    protocol: ProtocolJoin | null;
}

const categoryIcons: Record<string, React.ElementType> = {
    feature: Lightbulb,
    bug: Bug,
    question: HelpCircle,
    other: MessageSquare,
};

const statusColors: Record<string, string> = {
    new: 'bg-blue-500/10 text-blue-500',
    reviewed: 'bg-yellow-500/10 text-yellow-500',
    implemented: 'bg-green-500/10 text-green-500',
    dismissed: 'bg-muted text-muted-foreground',
};

export default function VendorSupport() {
    const { data: suggestions, isLoading: sugLoading } = useAllPartnerSuggestions();
    const { data: clientRequests, isLoading: crLoading } = useAllClientRequests();
    const { data: feedback, isLoading: fbLoading } = useAllProtocolFeedback();
    const updateStatus = useUpdateSuggestionStatus();
    const [notesMap, setNotesMap] = useState<Record<string, string>>({});

    const handleStatusUpdate = (id: string, status: string) => {
        updateStatus.mutate(
            { id, status, admin_notes: notesMap[id] },
            {
                onSuccess: () => toast({ title: 'Updated', description: `Status set to ${status}` }),
                onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
            }
        );
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Support Inbox</h1>

            {/* Partner Suggestions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Partner Suggestions</CardTitle>
                    <CardDescription>Feedback from partners across all tenants — features, bugs, questions</CardDescription>
                </CardHeader>
                <CardContent>
                    {sugLoading ? (
                        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
                    ) : !suggestions?.length ? (
                        <p className="text-sm text-muted-foreground py-4">No partner suggestions yet</p>
                    ) : (
                        <div className="space-y-4">
                            {(suggestions as PartnerSuggestion[]).map((s) => {
                                const Icon = categoryIcons[s.category] || MessageSquare;
                                return (
                                    <div key={s.id} className="p-4 border rounded-lg space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3">
                                                <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                                <div>
                                                    <p className="text-sm font-medium">{s.title || 'Untitled'}</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">{s.body}</p>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <Badge variant="outline" className="text-[10px]">{s.org?.name || 'Unknown Org'}</Badge>
                                                        <span className="text-[10px] text-muted-foreground">{format(new Date(s.created_at), 'MMM d, yyyy')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <Badge className={`text-[10px] ${statusColors[s.status] || ''}`}>{s.status}</Badge>
                                        </div>
                                        <div className="flex items-end gap-2">
                                            <Textarea
                                                placeholder="Admin notes..."
                                                className="text-xs h-16"
                                                value={notesMap[s.id] || s.admin_notes || ''}
                                                onChange={(e) => setNotesMap(prev => ({ ...prev, [s.id]: e.target.value }))}
                                            />
                                            <Select onValueChange={(v) => handleStatusUpdate(s.id, v)}>
                                                <SelectTrigger className="w-32 h-8 text-xs">
                                                    <SelectValue placeholder="Set status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="new">New</SelectItem>
                                                    <SelectItem value="reviewed">Reviewed</SelectItem>
                                                    <SelectItem value="implemented">Implemented</SelectItem>
                                                    <SelectItem value="dismissed">Dismissed</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Client Requests */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Client Requests</CardTitle>
                    <CardDescription>Service requests from clients across all tenants</CardDescription>
                </CardHeader>
                <CardContent>
                    {crLoading ? (
                        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                    ) : !clientRequests?.length ? (
                        <p className="text-sm text-muted-foreground py-4">No client requests yet</p>
                    ) : (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {(clientRequests as ClientRequest[]).map((r) => (
                                <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{r.title || r.request_type || 'Request'}</p>
                                        <p className="text-xs text-muted-foreground truncate">{r.description || r.notes || ''}</p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-3">
                                        <Badge variant="outline" className="text-[10px] shrink-0">{r.org?.name || '?'}</Badge>
                                        <Badge variant={r.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">{r.status}</Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Protocol Feedback */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Protocol Feedback</CardTitle>
                    <CardDescription>Client ratings and comments on protocols</CardDescription>
                </CardHeader>
                <CardContent>
                    {fbLoading ? (
                        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                    ) : !feedback?.length ? (
                        <p className="text-sm text-muted-foreground py-4">No protocol feedback yet</p>
                    ) : (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {(feedback as ProtocolFeedback[]).map((f) => (
                                <div key={f.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                                    <div className="flex items-center gap-3">
                                        {f.rating >= 4 ? (
                                            <ThumbsUp className="h-4 w-4 text-green-500" />
                                        ) : f.rating <= 2 ? (
                                            <ThumbsDown className="h-4 w-4 text-red-500" />
                                        ) : (
                                            <Star className="h-4 w-4 text-yellow-500" />
                                        )}
                                        <div>
                                            <p className="font-medium">{f.protocol?.name || 'Unknown Protocol'}</p>
                                            <p className="text-xs text-muted-foreground truncate max-w-[400px]">{f.comment || 'No comment'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-0.5">
                                            {[1, 2, 3, 4, 5].map(n => (
                                                <Star key={n} className={`h-3 w-3 ${n <= (f.rating || 0) ? 'text-yellow-500 fill-yellow-500' : 'text-muted'}`} />
                                            ))}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">{format(new Date(f.created_at), 'MMM d')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
