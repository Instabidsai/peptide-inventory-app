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
    currentMemberId?: string;
}

export function HouseholdDoseSection({
    doses,
    currentWindow,
    onLogDose,
    isLogging,
    currentMemberId,
}: HouseholdDoseSectionProps) {
    if (doses.length === 0) return null;

    // Group by member contact ID, preserving order (owner first)
    const memberOrder: string[] = [];
    const byMember: Record<string, DueNowDose[]> = {};
    const memberNames: Record<string, string> = {};

    for (const dose of doses) {
        const key = dose.memberContactId || 'solo';
        const name = dose.memberName || 'You';
        if (!byMember[key]) {
            byMember[key] = [];
            memberOrder.push(key);
            memberNames[key] = name;
        }
        byMember[key].push(dose);
    }

    // Put current user first if they exist in the list
    if (currentMemberId) {
        const idx = memberOrder.indexOf(currentMemberId);
        if (idx > 0) {
            memberOrder.splice(idx, 1);
            memberOrder.unshift(currentMemberId);
        }
    }

    return (
        <div className="space-y-6">
            {memberOrder.map((memberId, idx) => {
                const memberDoses = byMember[memberId];
                const name = memberNames[memberId] || 'Member';
                const colorClass = MEMBER_COLORS[idx % MEMBER_COLORS.length];
                const isCurrentUser = memberId === currentMemberId;

                return (
                    <div key={memberId} className="space-y-3">
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
