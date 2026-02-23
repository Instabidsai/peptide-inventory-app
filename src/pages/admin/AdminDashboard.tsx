
import { usePageTitle } from '@/hooks/use-page-title';
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
import { QueryError } from '@/components/ui/query-error';
import { motion } from 'framer-motion';
import React, { useMemo, useState, useEffect } from 'react';

const staggerContainer = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } },
};

export default function AdminDashboard() {
    usePageTitle('Dashboard');
    const { organization } = useAuth();
    const [viewMode, setViewMode] = React.useState<'operations' | 'investment'>(() => {
        const saved = localStorage.getItem('dashboard_view_mode');
        return saved === 'investment' ? 'investment' : 'operations';
    });
    const handleSetViewMode = (mode: 'operations' | 'investment') => {
        setViewMode(mode);
        localStorage.setItem('dashboard_view_mode', mode);
    };

    // One-time welcome modal for new users
    const [showWelcome, setShowWelcome] = useState(() => {
        return !localStorage.getItem('peptide_welcome_dismissed');
    });
    const dismissWelcome = () => {
        setShowWelcome(false);
        localStorage.setItem('peptide_welcome_dismissed', '1');
    };

    const { data: stats, isLoading: statsLoading } = useBottleStats();
    const { data: movements, isLoading: movementsLoading } = useMovements();
    const { data: peptides } = usePeptides();
    const { data: financials, isLoading: financialsLoading, error: financialsError, refetch: financialsRefetch } = useFinancialMetrics();
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
                .maybeSingle();
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
            const { data, error } = await supabase
                .from('sales_order_items')
                .select('peptide_id, quantity, peptides (name)')
                .not('peptide_id', 'is', null);
            if (error) throw error;
            // Aggregate by peptide
            const agg = new Map<string, { name: string; qty: number; revenue: number }>();
            type SalesItem = { peptide_id: string; quantity: number; unit_price?: number; peptides?: { name: string } };
            ((data || []) as SalesItem[]).forEach((item) => {
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

    // Show full-page error only if the critical financial query fails and nothing else loaded
    if (financialsError && !stats && !movements) {
        return <QueryError message="Failed to load dashboard data." onRetry={financialsRefetch} />;
    }

    // Track partial failures from the financials hook
    const financialErrors = financials?._errors || [];
    const hasPartialFailure = financialErrors.length > 0;

    const recentMovements = movements?.slice(0, 5) || [];
    const lowStock = useMemo(() =>
        peptides
            ?.filter(p => (p.stock_count ?? 0) <= 10 && p.active)
            .sort((a, b) => (a.stock_count ?? 0) - (b.stock_count ?? 0)) || [],
        [peptides]
    );

    // Calculated fields for Full Investment View
    const totalExpensesWithLiability = (financials?.overhead ?? 0) +
        (financials?.inventoryPurchases ?? 0) +
        (pendingFinancials?.outstandingLiability ?? 0);

    const netPosition = (financials?.salesRevenue ?? 0) - totalExpensesWithLiability;

    const isOps = viewMode === 'operations';

    return (
        <div className="space-y-6">

            {/* One-time welcome modal */}
            {showWelcome && (
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                >
                    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-emerald-500/5">
                        <CardContent className="pt-6 pb-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-3 flex-1">
                                    <h2 className="text-lg font-semibold">Welcome to {organization?.name || 'ThePeptideAI'}!</h2>
                                    <p className="text-sm text-muted-foreground">Here's how to get started:</p>
                                    <div className="grid sm:grid-cols-2 gap-2">
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to="/peptides"><Package className="mr-2 h-3.5 w-3.5" /> Add Your First Peptide</Link>
                                        </Button>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to="/settings"><ClipboardList className="mr-2 h-3.5 w-3.5" /> Configure Settings</Link>
                                        </Button>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to="/team"><Users className="mr-2 h-3.5 w-3.5" /> Invite Team Members</Link>
                                        </Button>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to="/settings"><DollarSign className="mr-2 h-3.5 w-3.5" /> Set Up Payments</Link>
                                        </Button>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" onClick={dismissWelcome} className="shrink-0 text-muted-foreground">
                                    Dismiss
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
            >
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
            </motion.div>

            {/* Financial View Toggle */}
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg w-fit border border-border/50">
                <button
                    onClick={() => handleSetViewMode('operations')}
                    className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${isOps ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)]' : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    Operations View
                </button>
                <button
                    onClick={() => handleSetViewMode('investment')}
                    className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${!isOps ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)]' : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    Full Investment View
                </button>
            </div>

            {/* Diagnostic: warn admin when financial queries partially failed */}
            {hasPartialFailure && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="py-3">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-amber-400">
                                    Some dashboard data couldn't load
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Failed: {financialErrors.join(', ')}. Values shown as $0.00 may be missing data, not actual zeros.
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => financialsRefetch()} className="shrink-0 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                                Retry
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Financial Overview - 4 cards, always in a clean grid */}
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <motion.div variants={staggerItem}><Link to="/lots">
                    <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300 cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">Inventory Asset Value</CardTitle>
                            <DollarSign className="h-5 w-5 text-primary" />
                        </CardHeader>
                        <CardContent>
                            {financialsLoading ? <Skeleton className="h-8 w-20" /> : (
                                <div className="text-2xl font-bold">${(financials?.inventoryValue ?? 0).toFixed(2)}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Current value of in-stock items</p>
                        </CardContent>
                    </Card>
                </Link></motion.div>

                <motion.div variants={staggerItem}><Link to="/movements?type=sale">
                    <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20 hover:border-green-500/40 hover:shadow-lg hover:shadow-green-500/10 transition-all duration-300 cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">Sales Revenue</CardTitle>
                            <TrendingUp className="h-5 w-5 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            {financialsLoading ? <Skeleton className="h-8 w-20" /> : (
                                <div className="text-2xl font-bold">${(financials?.salesRevenue ?? 0).toFixed(2)}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Total collected from sales</p>
                        </CardContent>
                    </Card>
                </Link></motion.div>

                {/* Card 3: Overhead / Total Investment */}
                <motion.div variants={staggerItem}><Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20 hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/10 transition-all duration-300 cursor-pointer">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-semibold">
                            {isOps ? 'Operational Overhead' : 'Total Investment'}
                        </CardTitle>
                        <PieChart className={`h-5 w-5 ${isOps ? 'text-orange-500' : 'text-red-500'}`} />
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
                </Card></motion.div>

                {/* Card 4: Operating Profit / Net Position */}
                <motion.div variants={staggerItem}><Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20 hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300 cursor-pointer">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-semibold">
                            {isOps ? 'Operating Profit' : 'Net Position'}
                        </CardTitle>
                        <DollarSign className="h-5 w-5 text-blue-500" />
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
                </Card></motion.div>
            </motion.div>

            {/* Pending Orders Row */}
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <motion.div variants={staggerItem}><Link to="/orders?status=pending">
                    <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300 cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">Pending Orders</CardTitle>
                            <ClipboardList className="h-5 w-5 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            {pendingCountLoading ? <Skeleton className="h-8 w-20" /> : (
                                <div className="text-2xl font-bold">{pendingOrdersCount || 0}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Orders awaiting delivery</p>
                        </CardContent>
                    </Card>
                </Link></motion.div>

                <motion.div variants={staggerItem}><Link to="/orders?status=pending">
                    <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300 cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">On Order Value</CardTitle>
                            <DollarSign className="h-5 w-5 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            {pendingValueLoading ? <Skeleton className="h-8 w-20" /> : (
                                <div className="text-2xl font-bold">${(pendingFinancials?.totalValue ?? 0).toFixed(2)}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Est. cost of pending orders</p>
                        </CardContent>
                    </Card>
                </Link></motion.div>

                <motion.div variants={staggerItem}><Link to="/admin/commissions">
                    <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300 cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">Commissions</CardTitle>
                            <Users className="h-5 w-5 text-purple-500" />
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
                </Link></motion.div>

                <motion.div variants={staggerItem}><Link to="/sales?source=woocommerce">
                    <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300 cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">WooCommerce</CardTitle>
                            <ShoppingCart className="h-5 w-5 text-purple-500" />
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
                </Link></motion.div>
            </motion.div>

            {/* Per-Order Profit Summary */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <Link to="/sales">
                <Card className="bg-card/80 border-border/50 hover:border-primary/30 transition-all duration-300 cursor-pointer backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Sales Order P&L</CardTitle>
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
            </motion.div>

            {/* Inventory Overview */}
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2">
                <motion.div variants={staggerItem}><Link to="/bottles?status=in_stock">
                    <Card className="bg-card border-border/60 hover:bg-accent/30 hover:shadow-card transition-all cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">In Stock</CardTitle>
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
                </Link></motion.div>

                <motion.div variants={staggerItem}><Link to="/peptides">
                    <Card className="bg-card border-border/60 hover:bg-accent/30 hover:shadow-card transition-all cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">Peptides</CardTitle>
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
                </Link></motion.div>
            </motion.div>

            {/* Movement Stats (Sold / Giveaway / Internal) */}
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-3">
                <motion.div variants={staggerItem}><Link to="/movements?type=sale">
                    <Card className="bg-card border-border/60 hover:bg-accent/30 hover:shadow-card transition-all cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">Total Sold</CardTitle>
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
                </Link></motion.div>

                <motion.div variants={staggerItem}><Link to="/movements?type=giveaway">
                    <Card className="bg-card border-border/60 hover:bg-accent/30 hover:shadow-card transition-all cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">Given Away</CardTitle>
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
                </Link></motion.div>

                <motion.div variants={staggerItem}><Link to="/movements?type=internal_use">
                    <Card className="bg-card border-border/60 hover:bg-accent/30 hover:shadow-card transition-all cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-semibold">Internal Use</CardTitle>
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
                </Link></motion.div>
            </motion.div>

            {/* Secondary Stats */}
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-3">
                <motion.div variants={staggerItem}><Card className="bg-card border-border/60">
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
                </Card></motion.div>

                <motion.div variants={staggerItem}><Card className="md:col-span-1 bg-card border-border/60">
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
                </Card></motion.div>

                {/* Low Stock Alerts — always visible */}
                <Card className={`md:col-span-1 bg-card border-border/60 ${lowStock.length > 0 ? 'border-amber-500/30' : ''}`}>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <AlertTriangle className={`h-4 w-4 ${lowStock.length > 0 ? 'text-amber-500' : 'text-muted-foreground/40'}`} />
                                Low Stock {lowStock.length > 0 && `(${lowStock.length})`}
                            </CardTitle>
                            {lowStock.length > 0 && (
                                <Button variant="ghost" size="sm" asChild>
                                    <Link to="/lots">Reorder</Link>
                                </Button>
                            )}
                        </div>
                        <CardDescription>Peptides with 10 or fewer bottles</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {lowStock.length === 0 ? (
                            <div className="text-center py-4">
                                <Package className="h-6 w-6 mx-auto mb-1.5 text-green-500/40" />
                                <p className="text-sm text-muted-foreground">All peptides well-stocked</p>
                            </div>
                        ) : (
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
                        )}
                    </CardContent>
                </Card>

                {/* Top Sellers — always visible */}
                <Card className="md:col-span-1 bg-card border-border/60">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className={`h-4 w-4 ${topSellers?.length ? 'text-green-500' : 'text-muted-foreground/40'}`} />
                            Top Sellers
                        </CardTitle>
                        <CardDescription>By units sold (all orders)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!topSellers?.length ? (
                            <div className="text-center py-4">
                                <ShoppingCart className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/30" />
                                <p className="text-sm text-muted-foreground">No sales recorded yet</p>
                                <Button variant="link" size="sm" asChild className="mt-1">
                                    <Link to="/movements/new">Record a sale</Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {topSellers.map((item, i) => (
                                    <div key={item.name} className="flex items-center justify-between text-sm">
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
                        )}
                    </CardContent>
                </Card>

                <motion.div variants={staggerItem} className="md:col-span-2"><Card className="bg-card border-border/60">
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
                            <div className="text-center py-8">
                                <Clock className="mx-auto h-8 w-8 mb-2 opacity-30" />
                                <p className="font-semibold text-muted-foreground">No movements recorded yet</p>
                                <Button asChild variant="link" className="mt-2">
                                    <Link to="/movements/new">Record your first movement</Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {recentMovements.map((movement) => (
                                    <div
                                        key={movement.id}
                                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors border border-transparent hover:border-border/30"
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
                </Card></motion.div>
            </motion.div>
            <div className="text-center text-xs text-muted-foreground mt-8">
                System Version: 2.7 (Profit Pipeline + WooCommerce + Partner + Analytics)
            </div>
        </div>
    );
}
