
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill, ShoppingBag, Info } from "lucide-react";

export interface SupplementItem {
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    notes?: string;
    image_url?: string;
    purchase_link?: string;
    description?: string;
}

interface SupplementStackProps {
    items: SupplementItem[];
}

export function SupplementStack({ items }: SupplementStackProps) {
    if (!items || items.length === 0) return null;

    return (
        <Card className="border-emerald-500/20 bg-emerald-950/5">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Pill className="h-5 w-5 text-emerald-500" />
                    Daily Supplement Stack
                </CardTitle>
                <CardDescription>Supporting nutrients for your protocol.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((item) => (
                        <div key={item.id} className="flex gap-4 p-4 rounded-xl border bg-card/50 hover:bg-card/80 transition-all group relative overflow-hidden">
                            {/* Image */}
                            <div className="shrink-0 w-20 h-20 rounded-lg bg-muted overflow-hidden border">
                                {item.image_url ? (
                                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                        <Pill className="h-8 w-8" />
                                    </div>
                                )}
                            </div>

                            {/* Details */}
                            <div className="flex flex-col flex-1 min-w-0">
                                <h4 className="font-semibold text-base truncate pr-6">{item.name}</h4>
                                <div className="text-sm text-emerald-600 font-medium mt-0.5">{item.dosage}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{item.frequency}</div>

                                {item.purchase_link && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="mt-3 w-fit h-7 text-xs gap-1.5"
                                        onClick={() => window.open(item.purchase_link, '_blank')}
                                    >
                                        <ShoppingBag className="h-3 w-3" /> Buy / Restock
                                    </Button>
                                )}
                            </div>

                            {/* Notes tooltip */}
                            {item.notes && (
                                <div className="absolute top-2 right-2" title={item.notes}>
                                    <Info className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-help" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
