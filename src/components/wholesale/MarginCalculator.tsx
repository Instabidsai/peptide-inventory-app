import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, DollarSign, Package, ArrowUpRight } from 'lucide-react';
import {
    useWholesaleTiers,
    useOrgWholesaleTier,
    calculateWholesalePrice,
    calculateMargin,
    calculateMarginPct,
    type WholesaleTier,
} from '@/hooks/use-wholesale-pricing';
import { usePeptides, type Peptide } from '@/hooks/use-peptides';

interface MarginCalculatorProps {
    /** Override tier instead of reading from org config (for onboarding preview) */
    previewTier?: WholesaleTier;
    /** Compact mode hides summary cards */
    compact?: boolean;
}

export default function MarginCalculator({ previewTier, compact }: MarginCalculatorProps) {
    const { data: peptides, isLoading: peptidesLoading } = usePeptides();
    const { data: orgTierData, isLoading: tierLoading } = useOrgWholesaleTier();
    const { data: allTiers } = useWholesaleTiers();

    const tier = previewTier ?? orgTierData?.tier ?? null;
    const isLoading = peptidesLoading || (!previewTier && tierLoading);

    // Filter to peptides that have a base cost set (supplier cost)
    const pricedPeptides = useMemo(
        () => (peptides ?? []).filter((p): p is Peptide & { base_cost: number; retail_price: number } =>
            (p.base_cost ?? 0) > 0 && (p.retail_price ?? 0) > 0
        ),
        [peptides],
    );

    // Calculate per-peptide pricing
    const rows = useMemo(() => {
        if (!tier || pricedPeptides.length === 0) return [];
        return pricedPeptides.map(p => {
            const baseCost = p.base_cost;
            const yourPrice = calculateWholesalePrice(baseCost, tier.markup_amount);
            const retailPrice = p.retail_price;
            const margin = calculateMargin(retailPrice, yourPrice);
            const marginPct = calculateMarginPct(retailPrice, yourPrice);
            return { id: p.id, name: p.name, sku: p.sku, baseCost, yourPrice, retailPrice, margin, marginPct };
        });
    }, [tier, pricedPeptides]);

    // Aggregates
    const summary = useMemo(() => {
        if (rows.length === 0) return null;
        const avgMarginPct = +(rows.reduce((s, r) => s + r.marginPct, 0) / rows.length).toFixed(1);
        const totalMarginPerUnit = rows.reduce((s, r) => s + r.margin, 0);
        return { productCount: rows.length, avgMarginPct, totalMarginPerUnit: +totalMarginPerUnit.toFixed(2) };
    }, [rows]);

    // Next tier upsell
    const nextTier = useMemo(() => {
        if (!tier || !allTiers) return null;
        const idx = allTiers.findIndex(t => t.id === tier.id);
        return idx >= 0 && idx < allTiers.length - 1 ? allTiers[idx + 1] : null;
    }, [tier, allTiers]);

    if (isLoading) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!tier) {
        return (
            <Card className="border-dashed border-muted-foreground/30">
                <CardContent className="py-8 text-center text-muted-foreground">
                    No wholesale tier assigned. Contact your supplier to get started.
                </CardContent>
            </Card>
        );
    }

    const fmt = (n: number) => `$${n.toFixed(2)}`;

    return (
        <div className="space-y-4">
            {/* Summary cards */}
            {!compact && summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Card>
                        <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <Package className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Products</p>
                                <p className="text-lg font-semibold">{summary.productCount}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-500/10">
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Avg Margin</p>
                                <p className="text-lg font-semibold">{summary.avgMarginPct}%</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-500/10">
                                <DollarSign className="h-4 w-4 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Your Tier</p>
                                <p className="text-lg font-semibold">{tier.name}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Pricing table */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Wholesale Pricing Breakdown</CardTitle>
                    <CardDescription>
                        At your <Badge variant="secondary" className="mx-1">{tier.name}</Badge> tier,
                        you pay cost + ${tier.markup_amount.toFixed(0)} per product.
                    </CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">Your Cost</TableHead>
                                <TableHead className="text-right">Retail Price</TableHead>
                                <TableHead className="text-right">Margin</TableHead>
                                <TableHead className="text-right">Margin %</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map(row => (
                                <TableRow key={row.id}>
                                    <TableCell className="font-medium">
                                        {row.name}
                                        {row.sku && (
                                            <span className="ml-2 text-xs text-muted-foreground">{row.sku}</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums font-medium text-emerald-600">
                                        {fmt(row.yourPrice)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{fmt(row.retailPrice)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{fmt(row.margin)}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <Badge
                                            variant={row.marginPct >= 40 ? 'default' : 'secondary'}
                                            className={row.marginPct >= 40 ? 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30' : ''}
                                        >
                                            {row.marginPct}%
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        {summary && (
                            <TableFooter>
                                <TableRow>
                                    <TableCell className="font-semibold">Average</TableCell>
                                    <TableCell />
                                    <TableCell />
                                    <TableCell />
                                    <TableCell className="text-right font-semibold">{summary.avgMarginPct}%</TableCell>
                                </TableRow>
                            </TableFooter>
                        )}
                    </Table>
                </CardContent>
            </Card>

            {/* Upsell to next tier */}
            {!compact && nextTier && (
                <Card className="border-primary/20 bg-primary/[0.03]">
                    <CardContent className="py-4 px-5 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium">
                                Upgrade to <span className="text-primary">{nextTier.name}</span> tier
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Order {nextTier.min_monthly_units}+ units/month — pay only cost + ${nextTier.markup_amount.toFixed(0)} per unit
                            </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-primary shrink-0" />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
