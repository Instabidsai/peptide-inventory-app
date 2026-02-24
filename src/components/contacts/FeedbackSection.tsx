import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Star } from 'lucide-react';
import { format } from 'date-fns';
import type { Protocol } from '@/types/regimen';

interface FeedbackSectionProps {
    assignedProtocols: Protocol[] | undefined;
}

export function FeedbackSection({ assignedProtocols }: FeedbackSectionProps) {
    return (
        <>
            <Separator className="my-6" />

            <div className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">Recent Feedback & Logs</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {assignedProtocols?.flatMap(p => p.protocol_feedback || []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5).map((fb) => (
                        <Card key={fb.id} className="bg-muted/20">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={fb.rating <= 3 ? 'destructive' : 'default'} className="h-5">
                                            {fb.rating} <Star className="h-3 w-3 ml-1 fill-current" />
                                        </Badge>
                                        <span className="text-sm font-medium">{format(new Date(fb.created_at), 'PPP')}</span>
                                    </div>
                                    {fb.admin_response && <Badge variant="outline" className="text-green-600 border-green-200">Replied</Badge>}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm italic">"{fb.comment}"</p>
                                {fb.admin_response && (
                                    <div className="mt-2 text-xs text-muted-foreground bg-background p-2 rounded border">
                                        <p className="font-semibold text-primary mb-1">Response:</p>
                                        {fb.admin_response}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                    {(!assignedProtocols || assignedProtocols.every(p => !p.protocol_feedback || p.protocol_feedback.length === 0)) && (
                        <div className="col-span-2 text-center py-8 text-muted-foreground italic">
                            No feedback recorded yet.
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
