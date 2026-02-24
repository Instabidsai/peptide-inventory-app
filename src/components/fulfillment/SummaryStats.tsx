import { Card, CardContent } from '@/components/ui/card';
import {
    ClipboardList, Pill, Package, HandMetal, CheckCircle,
} from 'lucide-react';
import type { SummaryStatsProps } from './types';

export default function SummaryStats({
    readyToPickCount,
    totalBottlesToPull,
    readyToShipCount,
    readyForPickupCount,
    recentlyCompletedCount,
}: SummaryStatsProps) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Card>
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-amber-500/10">
                        <ClipboardList className="h-6 w-6 text-amber-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{readyToPickCount}</p>
                        <p className="text-sm text-muted-foreground">To Pick</p>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-purple-500/10">
                        <Pill className="h-6 w-6 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{totalBottlesToPull}</p>
                        <p className="text-sm text-muted-foreground">Bottles</p>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-blue-500/10">
                        <Package className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{readyToShipCount}</p>
                        <p className="text-sm text-muted-foreground">To Ship</p>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-orange-500/10">
                        <HandMetal className="h-6 w-6 text-orange-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{readyForPickupCount}</p>
                        <p className="text-sm text-muted-foreground">Pickup</p>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-green-500/10">
                        <CheckCircle className="h-6 w-6 text-green-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{recentlyCompletedCount}</p>
                        <p className="text-sm text-muted-foreground">Done (7d)</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
