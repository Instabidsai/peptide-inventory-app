import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useRevenueMetrics, usePlanDistribution, useChurnRisk, useGrowthMetrics, TenantHealth } from '@/hooks/use-vendor-analytics';
import { StatCard, BillingStatusBadge, HealthBadge } from './vendor-shared';
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    Users,
    CreditCard,
    AlertTriangle,
    Clock,
    BarChart3,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts';

const PLAN_COLORS = ['#7c3aed', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];

export default function VendorAnalytics() {
    const revenue = useRevenueMetrics();
    const planDist = usePlanDistribution();
    const { data: churnRisk, isLoading: churnLoading } = useChurnRisk();
    const growth = useGrowthMetrics();
    const navigate = useNavigate();

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Revenue & Analytics</h1>

            {/* Top-line stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard label="MRR" value={`$${revenue.mrr.toFixed(0)}`} icon={DollarSign} />
                <StatCard label="ARR" value={`$${revenue.arr.toFixed(0)}`} icon={TrendingUp} />
                <StatCard label="Active" value={revenue.activeCount} icon={CreditCard} />
                <StatCard label="Trialing" value={revenue.trialingCount} icon={Clock} />
                <StatCard label="Past Due" value={revenue.pastDueCount} icon={AlertTriangle} />
                <StatCard label="New (30d)" value={growth.newThisMonth} icon={Users} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue Chart */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg">Monthly Revenue</CardTitle>
                        <CardDescription>Payment events by month</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {revenue.revenueByMonth.length > 0 ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={revenue.revenueByMonth}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 11 }} />
                                    <YAxis className="text-xs" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                                    <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']} />
                                    <Bar dataKey="revenue" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                                <div className="text-center">
                                    <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-40" />
                                    <p>No revenue data yet</p>
                                    <p className="text-sm">Revenue will appear after the first payment</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Plan Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Plan Distribution</CardTitle>
                        <CardDescription>Tenants by plan tier</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {planDist.length > 0 ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie
                                        data={planDist}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={80}
                                        dataKey="count"
                                        nameKey="name"
                                        label={({ name, count }) => `${name}: ${count}`}
                                    >
                                        {planDist.map((_, index) => (
                                            <Cell key={index} fill={PLAN_COLORS[index % PLAN_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Legend />
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                                No subscription data
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Churn Risk Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Tenant Health & Churn Risk</CardTitle>
                    <CardDescription>Sorted by risk — inactive and low-activity tenants first</CardDescription>
                </CardHeader>
                <CardContent>
                    {churnLoading ? (
                        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : !churnRisk?.length ? (
                        <p className="text-sm text-muted-foreground py-4">No tenant health data available</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 font-medium">Tenant</th>
                                        <th className="text-left py-2 font-medium">Plan</th>
                                        <th className="text-center py-2 font-medium">Health</th>
                                        <th className="text-right py-2 font-medium">Users</th>
                                        <th className="text-right py-2 font-medium">Orders (7d)</th>
                                        <th className="text-right py-2 font-medium">Orders (30d)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {churnRisk.map((t: TenantHealth) => (
                                        <tr
                                            key={t.org_id}
                                            className="border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                                            onClick={() => navigate(`/vendor/tenant/${t.org_id}`)}
                                        >
                                            <td className="py-2 font-medium">{t.org_name}</td>
                                            <td className="py-2">{t.plan || 'Free'}</td>
                                            <td className="py-2 text-center"><HealthBadge health={t.health} /></td>
                                            <td className="py-2 text-right">{t.active_users}</td>
                                            <td className="py-2 text-right">{t.orders_7d}</td>
                                            <td className="py-2 text-right">{t.orders_30d}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
