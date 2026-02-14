import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { WaterTracker } from '@/components/dashboards/WaterTracker';
import { WeeklyCompliance } from '@/components/dashboards/WeeklyCompliance';
import { WeeklyTrends } from '@/components/dashboards/WeeklyTrends';
import {
    Utensils,
    Scale,
} from 'lucide-react';

export default function HealthTracking() {
    const navigate = useNavigate();

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Health Tracking</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Monitor your nutrition, hydration and body composition
                </p>
            </div>

            {/* Quick Links to Full Pages */}
            <div className="grid grid-cols-2 gap-3">
                <Button
                    variant="secondary"
                    className="h-auto py-4 flex-col gap-2 hover:border-primary/20 border border-transparent"
                    onClick={() => navigate('/macro-tracker')}
                >
                    <Utensils className="h-5 w-5 text-primary" />
                    <span className="font-medium text-sm">Macro Tracker</span>
                </Button>
                <Button
                    variant="secondary"
                    className="h-auto py-4 flex-col gap-2 hover:border-primary/20 border border-transparent"
                    onClick={() => navigate('/body-composition')}
                >
                    <Scale className="h-5 w-5 text-primary" />
                    <span className="font-medium text-sm">Body Comp</span>
                </Button>
            </div>

            {/* Inline Widgets */}
            <WaterTracker />
            <WeeklyCompliance />
            <WeeklyTrends />
        </div>
    );
}
