import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Droplets, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SimpleVialsProps {
    inventory: any[];
}

export function SimpleVials({ inventory }: SimpleVialsProps) {
    const navigate = useNavigate();

    const activeVials = inventory.filter(
        (v) => v.status === 'active' && v.vial_size_mg > 0
    );

    if (activeVials.length === 0) {
        return (
            <GlassCard className="border-emerald-500/10">
                <CardContent className="py-6 text-center text-muted-foreground">
                    <Droplets className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No active vials in your fridge.</p>
                    <p className="text-xs mt-1">Vials from your orders will appear here.</p>
                </CardContent>
            </GlassCard>
        );
    }

    return (
        <GlassCard className="border-emerald-500/10">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-emerald-500/20 text-emerald-400">
                        <Droplets className="w-4 h-4" />
                    </div>
                    My Vials
                    <Badge variant="secondary" className="ml-auto text-xs">
                        {activeVials.length} active
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {activeVials.map((vial) => {
                    const pct = Math.min(
                        100,
                        Math.max(0, (vial.current_quantity_mg / vial.vial_size_mg) * 100)
                    );
                    const isLow = pct < 20;
                    const concentration = vial.concentration_mg_ml;

                    return (
                        <div
                            key={vial.id}
                            className="rounded-lg border bg-card/50 p-3 space-y-2"
                        >
                            <div className="flex items-center justify-between">
                                <p className="font-medium text-sm">
                                    {vial.peptide?.name || 'Unknown'}
                                </p>
                                {concentration ? (
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] border-emerald-500/30 text-emerald-400"
                                    >
                                        {Number(concentration).toFixed(2)} mg/ml
                                    </Badge>
                                ) : (
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] border-amber-500/30 text-amber-400"
                                    >
                                        Unmixed
                                    </Badge>
                                )}
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>
                                        {Number(vial.current_quantity_mg).toFixed(1)}mg /{' '}
                                        {vial.vial_size_mg}mg
                                    </span>
                                    <span>{Math.round(pct)}%</span>
                                </div>
                                <Progress
                                    value={pct}
                                    className={`h-2 ${isLow ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}`}
                                />
                            </div>
                            {isLow && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full h-7 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                    onClick={() => navigate('/store')}
                                >
                                    <ShoppingBag className="h-3 w-3 mr-1" />
                                    Running low — Reorder
                                </Button>
                            )}
                        </div>
                    );
                })}
            </CardContent>
        </GlassCard>
    );
}
