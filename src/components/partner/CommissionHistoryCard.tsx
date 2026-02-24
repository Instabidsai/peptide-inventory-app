import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';
import type { Commission } from '@/hooks/use-partner';

interface CommissionHistoryCardProps {
    commissions: Commission[] | undefined;
    isLoading: boolean;
}

export function CommissionHistoryCard({ commissions, isLoading }: CommissionHistoryCardProps) {
    return (
        <Card className="col-span-1">
            <CardHeader>
                <CardTitle>Commission History</CardTitle>
                <CardDescription>Recent earnings from your network</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : commissions && commissions.length > 0 ? (
                    <div className="overflow-x-auto -mx-4 px-4">
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
                            {commissions.slice(0, 10).map((comm) => (
                                <TableRow key={comm.id}>
                                    <TableCell>{format(new Date(comm.created_at), 'MMM d')}</TableCell>
                                    <TableCell className="font-medium">
                                        Order #{comm.sale_id?.slice(0, 8) || 'N/A'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize text-xs">
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
                    </div>
                ) : (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                        No commission history yet.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
