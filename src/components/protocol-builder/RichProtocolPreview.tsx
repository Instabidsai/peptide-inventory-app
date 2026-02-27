import { useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const FONT_SIZES = [
    { label: 'S', value: '11px' },
    { label: 'M', value: '13px' },
    { label: 'L', value: '15px' },
] as const;

interface RichProtocolPreviewProps {
    html: string;
    itemCount: number;
}

export function RichProtocolPreview({
    html,
    itemCount,
}: RichProtocolPreviewProps) {
    const [fontSize, setFontSize] = useState('13px');

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
                    <span className="flex items-center gap-2">
                        Protocol Preview
                        <Badge variant="outline" className="text-xs">{itemCount} item{itemCount !== 1 ? 's' : ''}</Badge>
                    </span>
                    <div className="flex items-center gap-0.5 border rounded-md p-0.5">
                        {FONT_SIZES.map(fs => (
                            <button
                                key={fs.value}
                                onClick={() => setFontSize(fs.value)}
                                className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
                                    fontSize === fs.value
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {fs.label}
                            </button>
                        ))}
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">

                {/* HTML Preview */}
                <div
                    className="rounded-lg border bg-white text-black overflow-auto max-h-[75dvh]"
                    style={{ fontSize }}
                >
                    <div
                        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
