import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DueNowCards } from './DueNowCards';
import type { DueNowDose } from './DueNowCards';

const MEMBER_COLORS = [
    'text-primary',
    'text-emerald-400',
    'text-violet-400',
    'text-amber-400',
    'text-rose-400',
];

interface HouseholdDoseSectionProps {
    doses: DueNowDose[];
    currentWindow: 'morning' | 'afternoon' | 'evening';
    onLogDose: (dose: DueNowDose) => void;
    isLogging?: boolean;
    currentMemberName?: string;
}

export function HouseholdDoseSection({
    doses,
    currentWindow,
    onLogDose,
    isLogging,
    currentMemberName,
}: HouseholdDoseSectionProps) {
    if (doses.length === 0) return null;

    // Group by member name, preserving order (owner first)
    const memberOrder: string[] = [];
    const byMember: Record<string, DueNowDose[]> = {};

    for (const dose of doses) {
        const name = dose.memberName || 'You';
        if (!byMember[name]) {
            byMember[name] = [];
            memberOrder.push(name);
        }
        byMember[name].push(dose);
    }

    // Put current user first if they exist in the list
    if (currentMemberName) {
        const idx = memberOrder.indexOf(currentMemberName);
        if (idx > 0) {
            memberOrder.splice(idx, 1);
            memberOrder.unshift(currentMemberName);
        }
    }

    return (
        <div className="space-y-6">
            {memberOrder.map((name, idx) => {
                const memberDoses = byMember[name];
                const colorClass = MEMBER_COLORS[idx % MEMBER_COLORS.length];
                const isCurrentUser = name === currentMemberName;

                return (
                    <div key={name} className="space-y-3">
                        {/* Member header */}
                        <div className="flex items-center gap-2">
                            <div className={cn("p-1.5 rounded-lg bg-white/[0.04]", colorClass)}>
                                <User className="h-3.5 w-3.5" />
                            </div>
                            <span className={cn("text-sm font-semibold tracking-tight", colorClass)}>
                                {name}
                            </span>
                            {isCurrentUser && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] text-muted-foreground/60">
                                    You
                                </span>
                            )}
                        </div>

                        {/* Reuse existing DueNowCards for this member's doses */}
                        <DueNowCards
                            doses={memberDoses}
                            currentWindow={currentWindow}
                            onLogDose={onLogDose}
                            isLogging={isLogging}
                        />
                    </div>
                );
            })}
        </div>
    );
}
