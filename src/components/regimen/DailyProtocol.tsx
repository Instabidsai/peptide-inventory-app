
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Syringe, Pill, GlassWater } from "lucide-react";
import { DailyProtocolTask } from "@/types/regimen";

interface DailyProtocolProps {
    tasks: DailyProtocolTask[];
    onToggle: (id: string) => void;
    hydration: number; // in oz?
    onAddWater: () => void;
}

export function DailyProtocol({ tasks, onToggle, hydration, onAddWater }: DailyProtocolProps) {
    const progress = Math.round((tasks.filter(t => t.is_completed).length / Math.max(1, tasks.length)) * 100);

    return (
        <Card className="h-full flex flex-col border-blue-500/20 bg-blue-950/10">
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg">Today's Protocol</CardTitle>
                        <CardDescription>
                            {progress}% Completed
                        </CardDescription>
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-bold font-mono text-blue-400">{new Date().toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    </div>
                </div>
                {/* Progress Bar */}
                <div className="h-1.5 w-full bg-secondary/50 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-4">

                {/* Task List */}
                <div className="space-y-2">
                    {tasks.map(task => (
                        <div
                            key={task.id}
                            onClick={() => onToggle(task.id)}
                            className={`
                                flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                ${task.is_completed ? 'bg-blue-500/10 border-blue-500/30' : 'bg-card border-border hover:border-blue-500/50'}
                            `}
                        >
                            <div className={`p-2 rounded-full ${task.is_completed ? 'text-blue-400' : 'text-muted-foreground'}`}>
                                {task.type === 'peptide' ? <Syringe className="w-5 h-5" /> :
                                    task.type === 'supplement' ? <Pill className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className={`font-medium text-sm ${task.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                                    {task.label}
                                </p>
                                {task.detail && <p className="text-xs text-muted-foreground">{task.detail}</p>}
                            </div>

                            {task.is_completed ? (
                                <CheckCircle2 className="w-6 h-6 text-blue-500" />
                            ) : (
                                <Circle className="w-6 h-6 text-muted-foreground/30" />
                            )}
                        </div>
                    ))}
                </div>

                {/* Water Tracker Mini-Widget */}
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                            <GlassWater className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-medium">Hydration</span>
                        </div>
                        <span className="text-sm font-bold text-blue-400">{hydration} oz</span>
                    </div>
                    <Button
                        onClick={onAddWater}
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs h-8 bg-blue-900/20 hover:bg-blue-900/40 text-blue-200"
                    >
                        + Add 8 oz
                    </Button>
                </div>

            </CardContent>
        </Card>
    );
}
