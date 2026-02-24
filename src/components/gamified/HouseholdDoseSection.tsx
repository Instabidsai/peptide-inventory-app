import { User, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { DueNowCards, type DueNowDose } from './DueNowCards';

const MEMBER_COLORS = [
    'text-primary',
    'text-emerald-400',
    'text-violet-400',
    'text-amber-400',
    'text-rose-400',
    'text-cyan-400',
    'text-indigo-400',
    'text-lime-400',
    'text-pink-400',
    'text-teal-400',
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
    const navigate = useNavigate();

    if (doses.length === 0) {
        return (
            <div className="text-center py-4 text-xs text-muted-foreground/50">
                <Users className="h-4 w-4 mx-auto mb-1 opacity-40" />
                No household members have doses scheduled right now
            </div>
        );
    }

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
            {/* Household header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-violet-400" />
                    <span className="text-sm font-semibold text-muted-foreground/70">
                        Family Doses
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium">
                        {memberOrder.length} {memberOrder.length === 1 ? 'member' : 'members'}
                    </span>
                </div>
                <button
                    onClick={() => navigate('/account?section=family')}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
                >
                    <Settings className="h-3 w-3" />
                    Manage
                </button>
            </div>

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
