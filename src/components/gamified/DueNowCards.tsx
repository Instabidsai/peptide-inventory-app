import { Button } from '@/components/ui/button';
import { Syringe, Check, Sun, Sunset, Moon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export interface DueNowDose {
    id: string;
    vialId: string;
    protocolItemId?: string;
    peptideName: string;
    doseAmountMg: number;
    units: number;
    timeOfDay: 'morning' | 'afternoon' | 'evening';
    isTaken: boolean;
    takenAt?: string;
    color: string;
    currentQuantityMg: number;
}

interface DueNowCardsProps {
    doses: DueNowDose[];
    currentWindow: 'morning' | 'afternoon' | 'evening';
    onLogDose: (dose: DueNowDose) => void;
    isLogging?: boolean;
}

const TIME_CONFIG = {
    morning: { icon: Sun, label: 'Morning', shortLabel: 'AM' },
    afternoon: { icon: Sunset, label: 'Afternoon', shortLabel: 'PM' },
    evening: { icon: Moon, label: 'Evening', shortLabel: 'PM' },
} as const;

function DoseCard({ dose, onLogDose, isLogging }: {
    dose: DueNowDose;
    onLogDose: (d: DueNowDose) => void;
    isLogging?: boolean;
}) {
    return (
        <div className={cn(
            "flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-300",
            dose.isTaken
                ? "bg-emerald-500/[0.06] border-emerald-500/15"
                : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
        )}>
            {/* Color dot */}
            <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: dose.color, opacity: dose.isTaken ? 0.5 : 1 }}
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className={cn(
                    "font-semibold text-sm tracking-tight",
                    dose.isTaken && "text-muted-foreground/60"
                )}>
                    {dose.peptideName}
                </p>
                <p className="text-xs text-muted-foreground/50 mt-0.5">
                    {dose.doseAmountMg}mg
                    {dose.units > 0 && (
                        <span className="text-emerald-400/70 ml-1.5">· {dose.units} units</span>
                    )}
                </p>
            </div>

            {/* Action */}
            {dose.isTaken ? (
                <div className="flex items-center gap-1.5 shrink-0">
                    <div className="h-8 w-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                        <Check className="h-4 w-4 text-emerald-400" />
                    </div>
                    {dose.takenAt && (
                        <span className="text-[10px] text-emerald-400/60 font-medium">
                            {format(new Date(dose.takenAt), 'h:mm a')}
                        </span>
                    )}
                </div>
            ) : (
                <Button
                    size="sm"
                    className="h-10 px-4 rounded-xl text-xs font-semibold shrink-0"
                    disabled={isLogging}
                    onClick={() => onLogDose(dose)}
                >
                    <Syringe className="h-3.5 w-3.5 mr-1" />
                    Log
                </Button>
            )}
        </div>
    );
}

export function DueNowCards({ doses, currentWindow, onLogDose, isLogging }: DueNowCardsProps) {
    const currentDoses = doses.filter(d => d.timeOfDay === currentWindow);
    const laterDoses = doses.filter(d => d.timeOfDay !== currentWindow && !d.isTaken);
    const doneLater = doses.filter(d => d.timeOfDay !== currentWindow && d.isTaken);
    const config = TIME_CONFIG[currentWindow];
    const Icon = config.icon;

    if (doses.length === 0) return null;

    return (
        <div className="space-y-4">
            {/* Current time window */}
            {currentDoses.length > 0 && (
                <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm font-semibold tracking-tight">Due Now — {config.label}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground/40 bg-white/[0.04] px-2 py-0.5 rounded-full">
                            {currentDoses.filter(d => d.isTaken).length}/{currentDoses.length}
                        </span>
                    </div>
                    <div className="space-y-2">
                        {currentDoses.map(dose => (
                            <DoseCard key={dose.id} dose={dose} onLogDose={onLogDose} isLogging={isLogging} />
                        ))}
                    </div>
                </div>
            )}

            {/* Already done from other windows */}
            {doneLater.length > 0 && (
                <div className="space-y-1.5">
                    {doneLater.map(dose => (
                        <DoseCard key={dose.id} dose={dose} onLogDose={onLogDose} isLogging={isLogging} />
                    ))}
                </div>
            )}

            {/* Later today */}
            {laterDoses.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />
                        <span className="text-xs font-medium text-muted-foreground/40">
                            Later today — {laterDoses.length} dose{laterDoses.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {laterDoses.map(dose => {
                            const timeConfig = TIME_CONFIG[dose.timeOfDay];
                            const TimeIcon = timeConfig.icon;
                            return (
                                <div key={dose.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                    <div
                                        className="h-2 w-2 rounded-full shrink-0"
                                        style={{ backgroundColor: dose.color, opacity: 0.4 }}
                                    />
                                    <span className="text-xs text-muted-foreground/50 font-medium flex-1">{dose.peptideName}</span>
                                    <span className="text-[11px] text-muted-foreground/40">{dose.doseAmountMg}mg</span>
                                    <div className="flex items-center gap-1 text-muted-foreground/30">
                                        <TimeIcon className="h-3 w-3" />
                                        <span className="text-[10px] font-medium">{timeConfig.shortLabel}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
