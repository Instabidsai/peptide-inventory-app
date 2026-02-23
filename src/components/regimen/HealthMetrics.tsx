
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Scale } from "lucide-react";
import { useState } from "react";
import { ClientDailyLog } from "@/types/regimen";

interface HealthMetricsProps {
    todayLog?: ClientDailyLog;
    onSaveLog: (data: Partial<ClientDailyLog>) => void;
}

export function HealthMetrics({ todayLog, onSaveLog }: HealthMetricsProps) {
    // Local state for the form, initialized with today's values if they exist
    const [weight, setWeight] = useState(todayLog?.weight_lbs?.toString() || '');
    const [notes, setNotes] = useState(todayLog?.notes || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        await onSaveLog({
            weight_lbs: parseFloat(weight),
            notes: notes
        });
        setIsSaving(false);
    };

    return (
        <Card className="h-full flex flex-col border-purple-500/20 bg-purple-950/10">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-400" />
                    Health Metrics
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Current weight display */}
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 flex items-center justify-center">
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-purple-300">
                            <Scale className="w-4 h-4" />
                            <span className="text-2xl font-bold">{weight || '--'}</span>
                            <span className="text-sm">lbs</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {weight ? 'Today\'s weight' : 'Log your weight to start tracking'}
                        </p>
                    </div>
                </div>

                {/* Quick Entry Form */}
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Weight (lbs)</Label>
                        <div className="relative">
                            <Scale className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                className="pl-8 h-9 bg-card/50"
                                placeholder="000.0"
                                value={weight}
                                onChange={(e) => setWeight(e.target.value)}
                                type="number"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Daily Notes / Side Effects</Label>
                        <Textarea
                            className="bg-card/50 min-h-[80px] text-xs resize-none"
                            placeholder="How are you feeling today?"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    <Button
                        size="sm"
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={handleSave}
                        disabled={isSaving}
                    >
                        {isSaving ? 'Saving...' : 'Log Entry'}
                    </Button>
                </div>

            </CardContent>
        </Card>
    );
}
