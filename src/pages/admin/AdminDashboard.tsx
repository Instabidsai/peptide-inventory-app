
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBottleStats } from '@/hooks/use-bottles';
import { useMovements } from '@/hooks/use-movements';
import { usePeptides } from '@/hooks/use-peptides';
import { useAuth } from '@/contexts/AuthContext';
import { useFinancialMetrics } from '@/hooks/use-financials';
import { usePendingOrdersCount, usePendingOrderFinancials } from '@/hooks/use-orders';
import { supabase } from '@/integrations/sb_client/client';
import { useQuery } from '@tanstack/react-query';
import {
    Package,
    TrendingUp,
    ShoppingCart,
    AlertTriangle,
    Plus,
    ArrowRight,
    Clock,
    MessageSquare,
    DollarSign,
    PieChart,
    ClipboardList,
    Users
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import React from 'react';

export default function AdminDashboard() {
    const { organization } = useAuth();
    const [viewMode, setViewMode] = React.useState<'operations' | 'investment'>('operations');

    const { data: stats, isLoading: statsLoading } = useBottleStats();
    const { data: movements, isLoading: movementsLoading } = useMovements();
    const { data: peptides } = usePeptides();
    const { data: financials, isLoading: financialsLoading, error: financialsError } = useFinancialMetrics();
    const { data: pendingOrdersCount, isLoading: pendingCountLoading } = usePendingOrdersCount();
    const { data: pendingFinancials, isLoading: pendingValueLoading } = usePendingOrderFinancials();

    // WooCommerce sync status
    const { data: lastWooOrder } = useQuery({
        queryKey: ['last_woo_order'],
        queryFn: async () => {
            const { data } = await supabase
                .from('sales_orders')
                .select('created_at, woo_order_id')
                .eq('order_source', 'woocommerce')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            return data;
        },
    });
    const wooOrderCount = useQuery({
        queryKey: ['woo_order_count'],
        queryFn: async () => {
            const { count } = await supabase
                .from('sales_orders')
                .select('id', { count: 'exact', head: true })
                .eq('order_source', 'woocommerce');
            return count || 0;
        },
    });

    // Top sellers by quantity
    const { data: topSellers } = useQuery({
        queryKey: ['top_sellers'],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('sales_order_items')
                .select('peptide_id, quantity, peptides (name)')
                .not('peptide_id', 'is', null);
            if (error) throw error;
            // Aggregate by peptide
            const agg = new Map<string, { name: string; qty: number; revenue: number }>();
            (data || []).forEach((item: any) => {
                const key = item.peptide_id;
                const existing = agg.get(key) || { name: item.peptides?.name || 'Unknown', qty: 0, revenue: 0 };
                existing.qty += Number(item.quantity || 0);
                existing.revenue += Number(item.unit_price || 0) * Number(item.quantity || 0);
                agg.set(key, existing);
            });
            return [...agg.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
        },
    });

    if (financialsError) {
        console.error("Financials Error:", financialsError);
    }

    const recentMovements = movements?.slice(0, 5) || [];

    // Calculated fields for Full Investment View
    const totalExpensesWithLiability = (financials?.overhead ?? 0) +
        (financials?.inventoryPurchases ?? 0) +
        (pendingFinancials?.outstandingLiability ?? 0);

    const netPosition = (financials?.salesRevenue ?? 0) - totalExpensesWithLiability;

    const isOps = viewMode === 'operations';

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground">
                        Welcome back to {organization?.name || 'your inventory'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button asChild variant="outline">
                        <Link to="/lots">
                            <Plus className="mr-2 h-4 w-4" />
                            Receive Inventory
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link to="/movements/new">
                            <ArrowRight className="mr-2 h-4 w-4" />
                            Record Movement
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Financial View Toggle */}
            <div className="flex items-center gap-1 bg-muted p-1 rounded-md w-fit">
                <button
                    onClick={() => setViewMode('operations')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-all ${isOps ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    Operations View
                </button>
                <button
                    onClick={() => setViewMode('investment')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-all ${!isOps ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    Full Investment View
                </button>
            </div>

            {/* Financial Overview - 4 cards, always in a clean grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Link to="/lots">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Inventory Asset Value</CardTitle>
                            <DollarSign className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            {financialsLoading ? <Skeleton className="h-8 w-20" /> : (
                                <div className="text-2xl font-bold">${(financials?.inventoryValue ?? 0).toFixed(2)}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Current value of in-stock items</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link to="/movements?type=sale">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Sales Revenue</CardTitle>
                            <TrendingUp className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            {financialsLoading ? <Skeleton className="h-8 w-20" /> : (
                                <div className="text-2xl font-bold">${(financials?.salesRevenue ?? 0).toFixed(2)}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Total collected from sales</p>
                        </CardContent>
                    </Card>
                </Link>

                {/* Card 3: Overhead / Total Investment */}
                <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {isOps ? 'Operational Overhead' : 'Total Investment'}
                        </CardTitle>
                        <PieChart className={`h-4 w-4 ${isOps ? 'text-orange-500' : 'text-red-500'}`} />
                    </CardHeader>
                    <CardContent>
                        {financialsLoading ? <Skeleton className="h-8 w-20" /> : (
                            <div className="text-2xl font-bold">
                                ${isOps
                                    ? (financials?.overhead ?? 0).toFixed(2)
                                    : totalExpensesWithLiability.toFixed(2)
                                }
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {isOps ? 'Incl. commissions owed' : 'Overhead + Inventory + Owed'}
                        </p>
                    </CardContent>
                </Card>

                {/* Card 4: Operating Profit / Net Position */}
                <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {isOps ? 'Operating Profit' : 'Net Position'}
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        {financialsLoading ? <Skeleton className="h-8 w-20" /> : (
                            <div className={`text-2xl font-bold ${(isOps ? (financials?.operatingProfit ?? 0) : netPosition) >= 0
                                ? 'text-green-600' : 'text-red-500'
                                }`}>
                                ${isOps
                                    ? (financials?.operatingProfit ?? 0).toFixed(2)
                                    : netPosition.toFixed(2)
                                }
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {isOps ? 'Revenue - (COGS + Overhead + Commissions)' : 'Revenue - All Costs (Paid & Owed)'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Pending Orders Row */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Link to="/orders?status=pending">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
                            <ClipboardList className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            {pendingCountLoading ? <Skeleton className="h-8 w-20" /> : (
                                <div className="text-2xl font-bold">{pendingOrdersCount || 0}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Orders awaiting delivery</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link to="/orders?status=pending">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">On Order Value</CardTitle>
                            <DollarSign className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            {pendingValueLoading ? <Skeleton className="h-8 w-20" /> : (
                                <div className="text-2xl font-bold">${(pendingFinancials?.totalValue ?? 0).toFixed(2)}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Est. cost of pending orders</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link to="/admin/commissions">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Commissions</CardTitle>
                            <Users className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            {financialsLoading ? <Skeleton className="h-8 w-20" /> : (
                                <>
                                    <div className="text-2xl font-bold">
                                        ${(financials?.commissionsTotal ?? 0).toFixed(2)}
                                    </div>
                                    <div className="flex gap-2 mt-1">
                                        {(financials?.commissionsOwed ?? 0) > 0 && (
                                            <span className="text-xs text-amber-500">
                                                ${(financials?.commissionsOwed ?? 0).toFixed(2)} owed
                                            </span>
                                        )}
                                        {(financials?.commissionsPaid ?? 0) > 0 && (
                                            <span className="text-xs text-green-500">
                                                ${(financials?.commissionsPaid ?? 0).toFixed(2)} paid
                                            </span>
                                        )}
                                        {(financials?.commissionsApplied ?? 0) > 0 && (
                                            <span className="text-xs text-blue-500">
                                                ${(financials?.commissionsApplied ?? 0).toFixed(2)} applied
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </Link>

                <Link to="/sales?source=woocommerce">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">WooCommerce</CardTitle>
                            <ShoppingCart className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{wooOrderCount.data || 0}</div>
                            <p className="text-xs text-muted-foreground">
                                {lastWooOrder?.created_at
                                    ? `Last sync: ${format(new Date(lastWooOrder.created_at), 'MMM d, h:mm a')}`
                                    : 'No orders synced yet'}
                            </p>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Per-Order Profit Summary */}
            <Link to="/sales">
                <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Sales Order P&L</CardTitle>
                        <CardDescription>Aggregated from individual order profit tracking</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {financialsLoading ? <Skeleton className="h-8 w-full" /> : (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">Order COGS</p>
                                    <p className="text-lg font-semibold text-red-500">
                                        ${(financials?.orderBasedCogs ?? 0).toFixed(2)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Merchant Fees</p>
                                    <p className="text-lg font-semibold text-red-500">
                                        ${(financials?.merchantFees ?? 0).toFixed(2)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Commissions</p>
                                    <p className="text-lg font-semibold text-red-500">
                                        ${(financials?.commissionsTotal ?? 0).toFixed(2)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Order Profit</p>
                                    <p className={`text-lg font-semibold ${(financials?.orderBasedProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        ${(financials?.orderBasedProfit ?? 0).toFixed(2)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Avg Margin</p>
                                    <p className="text-lg font-semibold">
                                        {(financials?.salesRevenue ?? 0) > 0
                                            ? (((financials?.orderBasedProfit ?? 0) / (financials?.salesRevenue ?? 1)) * 100).toFixed(1)
                                            : '0.0'}%
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </Link>

            {/* Inventory Overview */}
            <div className="grid gap-4 md:grid-cols-2">
                <Link to="/bottles?status=in_stock">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">In Stock</CardTitle>
                            <Package className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            {statsLoading ? (
                                <Skeleton className="h-8 w-20" />
                            ) : (
                                <>
                                    <div className="text-2xl font-bold">{stats?.in_stock || 0}</div>
                                    <p className="text-xs text-muted-foreground">
                                        bottles available
                                    </p>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </Link>

                <Link to="/peptides">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Peptides</CardTitle>
                            <AlertTriangle className="h-4 w-4 text-warning" />
                        </CardHeader>
                        <CardContent>
                            {statsLoading ? (
                                <Skeleton className="h-8 w-20" />
                            ) : (
                                <>
                                    <div className="text-2xl font-bold">{peptides?.length || 0}</div>
                                    <p className="text-xs text-muted-foreground">
                                        products tracked
                                    </p>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Movement Stats (Sold / Giveaway / Internal) */}
            <div className="grid gap-4 md:grid-cols-3">
                <Link to="/movements?type=sale">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Sold</CardTitle>
                            <ShoppingCart className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            {statsLoading ? (
                                <Skeleton className="h-8 w-20" />
                            ) : (
                                <>
                                    <div className="text-2xl font-bold">{stats?.sold || 0}</div>
                                    <p className="text-xs text-muted-foreground">
                                        bottles sold
                                    </p>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </Link>

                <Link to="/movements?type=giveaway">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Given Away</CardTitle>
                            <TrendingUp className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            {statsLoading ? (
                                <Skeleton className="h-8 w-20" />
                            ) : (
                                <>
                                    <div className="text-2xl font-bold">{stats?.given_away || 0}</div>
                                    <p className="text-xs text-muted-foreground">
                                        promotional / at-cost
                                    </p>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </Link>

                <Link to="/movements?type=internal_use">
                    <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Internal Use</CardTitle>
                            <TrendingUp className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            {statsLoading ? (
                                <Skeleton className="h-8 w-20" />
                            ) : (
                                <>
                                    <div className="text-2xl font-bold">{stats?.internal_use || 0}</div>
                                    <p className="text-xs text-muted-foreground">
                                        personal / family
                                    </p>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Secondary Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-card border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-around">
                            <Link to="/movements?type=loss" className="group text-center">
                                <p className="text-sm text-muted-foreground group-hover:text-destructive transition-colors">Lost/Damaged</p>
                                <p className="text-xl font-semibold group-hover:text-destructive transition-colors">{stats?.lost || 0}</p>
                            </Link>
                            <div className="h-8 w-[1px] bg-border mx-4"></div>
                            <Link to="/movements?type=return" className="group text-center">
                                <p className="text-sm text-muted-foreground group-hover:text-primary transition-colors">Returned</p>
                                <p className="text-xl font-semibold group-hover:text-primary transition-colors">{stats?.returned || 0}</p>
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-1 bg-card border-border">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Recent Feedback</CardTitle>
                            <Button variant="ghost" size="sm" asChild>
                                <Link to="/feedback">View all</Link>
                            </Button>
                        </div>
                        <CardDescription>Latest client reports</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                                    <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Check Feedback</p>
                                    <p className="text-xs text-muted-foreground">Review and reply to client logs.</p>
                                </div>
                                <Button variant="outline" size="sm" asChild className="ml-auto">
                                    <Link to="/feedback">Open</Link>
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Low Stock Alerts */}
                {(() => {
                    const lowStock = peptides
                        ?.filter(p => (p.stock_count ?? 0) <= 10 && p.active)
                        .sort((a, b) => (a.stock_count ?? 0) - (b.stock_count ?? 0)) || [];
                    if (lowStock.length === 0) return null;
                    return (
                        <Card className="md:col-span-1 bg-card border-border border-amber-500/30">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                                        Low Stock ({lowStock.length})
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" asChild>
                                        <Link to="/lots">Reorder</Link>
                                    </Button>
                                </div>
                                <CardDescription>Peptides with 10 or fewer bottles</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {lowStock.slice(0, 8).map(p => (
                                        <div key={p.id} className="flex items-center justify-between text-sm">
                                            <span className="truncate mr-2">{p.name}</span>
                                            <span className={`font-mono font-medium ${(p.stock_count ?? 0) === 0 ? 'text-red-500' : 'text-amber-500'}`}>
                                                {p.stock_count ?? 0}
                                            </span>
                                        </div>
                                    ))}
                                    {lowStock.length > 8 && (
                                        <p className="text-xs text-muted-foreground text-center pt-1">
                                            +{lowStock.length - 8} more
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })()}

                {/* Top Sellers */}
                {topSellers && topSellers.length > 0 && (
                    <Card className="md:col-span-1 bg-card border-border">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-green-500" />
                                Top Sellers
                            </CardTitle>
                            <CardDescription>By units sold (all orders)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {topSellers.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                                            <span className="truncate">{item.name}</span>
                                        </div>
                                        <span className="font-mono font-medium text-primary shrink-0 ml-2">
                                            {item.qty}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Card className="md:col-span-2 bg-card border-border">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-base">Recent Activity</CardTitle>
                                <CardDescription>Latest inventory movements</CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                                <Link to="/movements">View all</Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {movementsLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-12 w-full" />
                                ))}
                            </div>
                        ) : recentMovements.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Clock className="mx-auto h-8 w-8 mb-2 opacity-50" />
                                <p>No movements recorded yet</p>
                                <Button asChild variant="link" className="mt-2">
                                    <Link to="/movements/new">Record your first movement</Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {recentMovements.map((movement) => (
                                    <div
                                        key={movement.id}
                                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-full bg-primary/10">
                                                <ArrowRight className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium capitalize">
                                                    {movement.type.replace('_', ' ')}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {movement.contacts?.name || 'No contact'}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {format(new Date(movement.movement_date), 'MMM d, yyyy')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
            <div className="text-center text-xs text-muted-foreground mt-8">
                System Version: 2.5 (Profit Pipeline + WooCommerce + Partner + Analytics)
            </div>
        </div>
    );
}
