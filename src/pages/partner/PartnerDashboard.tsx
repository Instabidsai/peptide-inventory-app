
import React from 'react';
import { usePartnerDownline, useCommissions, useCommissionStats, PartnerNode } from '@/hooks/use-partner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Users,
    DollarSign,
    TrendingUp,
    ChevronRight,
    Network
} from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';

export default function PartnerDashboard() {
    const { data: downline, isLoading: downlineLoading } = usePartnerDownline();
    const { data: commissions, isLoading: commissionsLoading } = useCommissions();
    const stats = useCommissionStats();

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Partner Portal</h1>
                <p className="text-muted-foreground">Manage your team and track your earnings.</p>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">${stats.available.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Ready for payout</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Commissions</CardTitle>
                        <TrendingUp className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${stats.pending.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Clearing in 30 days</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Lifetime Earnings</CardTitle>
                        <DollarSign className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${stats.total.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">All time commissions</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">My Downline</CardTitle>
                        <Users className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{downline?.length || 0}</div>
                        <p className="text-xs text-muted-foreground">Active partners in network</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Available Commissions Table */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Commission History</CardTitle>
                        <CardDescription>Recent earnings from your network</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {commissionsLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ) : commissions && commissions.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>From</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {commissions.slice(0, 10).map((comm: any) => (
                                        <TableRow key={comm.id}>
                                            <TableCell>{format(new Date(comm.created_at), 'MMM d')}</TableCell>
                                            <TableCell className="font-medium">
                                                {/* If we had better joins we could show partner name, currently just showing sale ID or generic */}
                                                Order #{comm.sales_orders?.order_number || 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="capitalize text-[10px]">
                                                    {comm.type.replace(/_/g, ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={`text-right font-medium ${comm.status === 'paid' ? 'text-muted-foreground' :
                                                    comm.status === 'available' ? 'text-green-600' : 'text-amber-600'
                                                }`}>
                                                ${Number(comm.amount).toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="text-center py-6 text-muted-foreground text-sm">
                                No commission history yet.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Downline Tree / List */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Network Hierarchy</CardTitle>
                        <CardDescription>Your team structure</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {downlineLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                            </div>
                        ) : downline && downline.length > 0 ? (
                            <div className="space-y-4">
                                {downline.map((partner) => (
                                    <div key={partner.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary">
                                                {partner.depth}
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{partner.full_name || partner.email}</p>
                                                <p className="text-xs text-muted-foreground capitalize">{partner.partner_tier} Partner</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-medium">${Number(partner.total_sales).toFixed(2)}</p>
                                            <p className="text-[10px] text-muted-foreground">Vol</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Network className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                <p className="text-sm text-muted-foreground">You haven't recruited any partners yet.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
