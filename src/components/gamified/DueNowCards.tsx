import { Button } from '@/components/ui/button';
import { Syringe, Check, Sun, Sunset, Moon, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

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
    memberName?: string;
    memberContactId?: string;
    /** False when viewing another household member's dose (can't log for them) */
    isOtherMember?: boolean;
    /** True when this is a household member who hasn't created their own account */
    isUnlinkedMember?: boolean;
}

interface DueNowCardsProps {
    doses: DueNowDose[];
    currentWindow: 'morning' | 'afternoon' | 'evening';
    onLogDose: (dose: DueNowDose) => void;
    isLogging?: boolean;
}

const TIME_CONFIG = {
    morning: { icon: Sun, label: 'Morning', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/15' },
    afternoon: { icon: Sunset, label: 'Afternoon', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/15' },
    evening: { icon: Moon, label: 'Evening', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/15' },
} as const;

const WINDOW_ORDER: ('morning' | 'afternoon' | 'evening')[] = ['morning', 'afternoon', 'evening'];

function DoseCard({ dose, onLogDose, isLogging }: {
    dose: DueNowDose;
    onLogDose: (d: DueNowDose) => void;
    isLogging?: boolean;
}) {
    return (
        <motion.div
            layout
            className={cn(
                "flex items-center gap-3 p-4 rounded-2xl border transition-colors duration-300",
                dose.isTaken
                    ? "bg-primary/[0.06] border-primary/15"
                    : "bg-muted/20 border-border/50 hover:bg-muted/40 hover:border-primary/15 hover:shadow-[0_0_20px_hsl(var(--primary)/0.06)]"
            )}
        >
            {/* Color dot */}
            <motion.div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: dose.color, opacity: dose.isTaken ? 0.5 : 1 }}
                animate={dose.isTaken ? { scale: [1, 1.4, 1] } : {}}
                transition={{ duration: 0.3 }}
            />

            {/* Info — units are the HERO */}
            <div className="flex-1 min-w-0">
                <p className={cn(
                    "font-semibold text-sm tracking-tight",
                    dose.isTaken && "text-muted-foreground/60 line-through"
                )}>
                    {dose.peptideName}
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                    {dose.units > 0 && (
                        <span className={cn(
                            "text-xl font-bold tracking-tight",
                            dose.isTaken ? "text-primary/50" : "text-primary"
                        )}>
                            {dose.units} <span className="text-sm font-semibold">units</span>
                        </span>
                    )}
                    <span className="text-xs text-muted-foreground/40">
                        ({dose.doseAmountMg}mg)
                    </span>
                </div>
            </div>

            {/* Action */}
            <AnimatePresence mode="wait">
                {dose.isTaken ? (
                    <motion.div
                        key="done"
                        className="flex flex-col items-center gap-0.5 shrink-0"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    >
                        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
                            <Check className="h-5 w-5 text-primary" />
                        </div>
                        {dose.takenAt && (
                            <span className="text-[10px] text-primary/60 font-medium">
                                {format(new Date(dose.takenAt), 'h:mm a')}
                            </span>
                        )}
                    </motion.div>
                ) : dose.isOtherMember && !dose.isUnlinkedMember ? (
                    <motion.div key="theirs" className="flex flex-col items-center gap-0.5 shrink-0">
                        <div className="h-10 w-10 rounded-xl bg-muted/40 flex items-center justify-center" title="Only they can log their own dose">
                            <Syringe className="h-4 w-4 text-muted-foreground/30" />
                        </div>
                        <span className="text-[10px] text-muted-foreground/40 font-medium">Their dose</span>
                    </motion.div>
                ) : (
                    <motion.div key="log" whileTap={{ scale: 0.92 }}>
                        <Button
                            size="sm"
                            className="h-12 px-5 rounded-xl text-sm font-semibold shrink-0"
                            disabled={isLogging}
                            onClick={() => onLogDose(dose)}
                        >
                            <Syringe className="h-4 w-4 mr-1.5" />
                            {dose.isUnlinkedMember ? `Log for ${dose.memberName?.split(' ')[0] || 'them'}` : 'Log Dose'}
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function TimeWindowSection({ window: timeWindow, doses, currentWindow, onLogDose, isLogging }: {
    window: 'morning' | 'afternoon' | 'evening';
    doses: DueNowDose[];
    currentWindow: 'morning' | 'afternoon' | 'evening';
    onLogDose: (d: DueNowDose) => void;
    isLogging?: boolean;
}) {
    const config = TIME_CONFIG[timeWindow];
    const Icon = config.icon;
    const isNow = timeWindow === currentWindow;
    const allDone = doses.length > 0 && doses.every(d => d.isTaken);
    const doneCount = doses.filter(d => d.isTaken).length;

    if (doses.length === 0) return null;

    return (
        <div className="space-y-2.5">
            {/* Section header */}
            <div className="flex items-center gap-2.5">
                <div className={cn("p-1.5 rounded-lg", config.bg)}>
                    <Icon className={cn("h-4 w-4", config.color)} />
                </div>
                <span className={cn(
                    "text-sm font-semibold tracking-tight",
                    isNow ? "text-foreground" : "text-muted-foreground/70"
                )}>
                    {config.label}
                </span>
                {isNow && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                        Now
                    </span>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground/40 bg-muted/40 px-2 py-0.5 rounded-full">
                    {doneCount}/{doses.length}
                </span>
            </div>

            {/* All done celebration */}
            {allDone ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn("flex items-center gap-2.5 p-3 rounded-2xl", config.bg, config.border, "border")}
                >
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium text-primary">All done!</span>
                </motion.div>
            ) : (
                <motion.div
                    className="space-y-2"
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
                >
                    {doses.map(dose => (
                        <motion.div key={dose.id} variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } }}>
                            <DoseCard dose={dose} onLogDose={onLogDose} isLogging={isLogging} />
                        </motion.div>
                    ))}
                </motion.div>
            )}
        </div>
    );
}

export function DueNowCards({ doses, currentWindow, onLogDose, isLogging }: DueNowCardsProps) {
    if (doses.length === 0) return null;

    // Group doses by time window
    const byWindow = {
        morning: doses.filter(d => d.timeOfDay === 'morning'),
        afternoon: doses.filter(d => d.timeOfDay === 'afternoon'),
        evening: doses.filter(d => d.timeOfDay === 'evening'),
    };

    // Show current window first, then the rest in order
    const orderedWindows = [
        currentWindow,
        ...WINDOW_ORDER.filter(w => w !== currentWindow),
    ];

    return (
        <div className="space-y-5">
            {orderedWindows.map(window => (
                <TimeWindowSection
                    key={window}
                    window={window}
                    doses={byWindow[window]}
                    currentWindow={currentWindow}
                    onLogDose={onLogDose}
                    isLogging={isLogging}
                />
            ))}
        </div>
    );
}
