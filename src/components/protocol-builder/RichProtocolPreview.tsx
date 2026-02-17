import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, Printer, Mail } from 'lucide-react';

interface RichProtocolPreviewProps {
    html: string;
    itemCount: number;
    onCopy: () => void;
    onPrint: () => void;
    onEmail: () => void;
    canEmail: boolean;
    clientName: string;
    hasClient: boolean;
}

export function RichProtocolPreview({
    html,
    itemCount,
    onCopy,
    onPrint,
    onEmail,
    canEmail,
    clientName,
    hasClient,
}: RichProtocolPreviewProps) {
    // Sanitize the HTML for safe rendering
    const sanitizedHtml = useMemo(() => {
        if (!html) return '';
        return DOMPurify.sanitize(html, {
            ADD_TAGS: ['style'],
            ADD_ATTR: ['target', 'rel'],
        });
    }, [html]);

    if (itemCount === 0) {
        return (
            <Card className="sticky top-4">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Protocol Preview</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-16 text-sm text-muted-foreground">
                        Add peptides or select a template to see the protocol preview.
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="sticky top-4">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    Protocol Preview
                    <Badge variant="outline" className="text-xs">{itemCount} item{itemCount !== 1 ? 's' : ''}</Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Action buttons */}
                <div className="flex gap-2">
                    <Button className="flex-1" variant="outline" size="sm" onClick={onCopy}>
                        <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                    </Button>
                    <Button className="flex-1" variant="outline" size="sm" onClick={onPrint}>
                        <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
                    </Button>
                    <Button
                        className="flex-1"
                        size="sm"
                        onClick={onEmail}
                        disabled={!canEmail}
                    >
                        <Mail className="h-3.5 w-3.5 mr-1.5" />
                        Email{clientName ? ` ${clientName}` : ''}
                    </Button>
                </div>

                {!hasClient && (
                    <p className="text-[11px] text-muted-foreground text-center">
                        Select a client above to enable email.
                    </p>
                )}
                {hasClient && !canEmail && (
                    <p className="text-[11px] text-amber-500 text-center">
                        No email on file for this client.
                    </p>
                )}

                <Separator />

                {/* HTML Preview */}
                <div
                    className="rounded-lg border bg-white text-black overflow-auto max-h-[65vh]"
                    style={{ fontSize: '11px' }}
                >
                    <div
                        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
