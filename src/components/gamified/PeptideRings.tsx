import { cn } from '@/lib/utils';

export const RING_COLORS = [
    '#34d399', // emerald-400
    '#60a5fa', // blue-400
    '#a78bfa', // violet-400
    '#fbbf24', // amber-400
    '#f472b6', // pink-400
    '#2dd4bf', // teal-400
    '#fb923c', // orange-400
];

export interface RingDose {
    id: string;
    peptideName: string;
    isTaken: boolean;
    color: string;
}

interface PeptideRingsProps {
    doses: RingDose[];
    size?: number;
}

export function PeptideRings({ doses, size = 180 }: PeptideRingsProps) {
    const strokeWidth = 10;
    const gap = 4;
    const ringStep = strokeWidth + gap;
    const center = size / 2;
    const takenCount = doses.filter(d => d.isTaken).length;
    const totalCount = doses.length;
    const percentage = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;

    if (totalCount === 0) return null;

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="relative" style={{ width: size, height: size }}>
                <svg
                    width={size} height={size}
                    className="transform -rotate-90"
                    role="img"
                    aria-label={`Peptide compliance: ${takenCount} of ${totalCount} doses taken (${percentage}%)`}
                >
                    <title>Peptide Compliance — {takenCount} of {totalCount} done</title>
                    {doses.map((dose, i) => {
                        const radius = (size / 2) - (strokeWidth / 2) - (i * ringStep);
                        if (radius <= 10) return null;
                        const circumference = 2 * Math.PI * radius;
                        const offset = dose.isTaken ? 0 : circumference;

                        return (
                            <g key={dose.id} role="presentation">
                                {/* Background track */}
                                <circle
                                    cx={center} cy={center} r={radius}
                                    stroke={dose.color} strokeWidth={strokeWidth}
                                    fill="none" opacity={0.15}
                                />
                                {/* Progress fill */}
                                <circle
                                    cx={center} cy={center} r={radius}
                                    stroke={dose.color} strokeWidth={strokeWidth}
                                    fill="none"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={offset}
                                    strokeLinecap="round"
                                    className="transition-all duration-700 ease-out"
                                >
                                    <title>{dose.peptideName}: {dose.isTaken ? 'taken' : 'not taken'}</title>
                                </circle>
                            </g>
                        );
                    })}
                </svg>

                {/* Center content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold tracking-tight">
                        {percentage}<span className="text-lg text-muted-foreground/50">%</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground/40 font-medium">
                        {takenCount} of {totalCount} done
                    </span>
                </div>
            </div>

            {/* Screen reader summary */}
            <span className="sr-only">
                {doses.map(d => `${d.peptideName}: ${d.isTaken ? 'taken' : 'not taken'}`).join(', ')}
            </span>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {doses.map(dose => (
                    <div key={dose.id} className="flex items-center gap-1.5">
                        <div
                            className="h-2 w-2 rounded-full transition-opacity duration-300"
                            style={{ backgroundColor: dose.color, opacity: dose.isTaken ? 1 : 0.35 }}
                        />
                        <span className={cn(
                            "text-[11px] font-medium",
                            dose.isTaken
                                ? "text-foreground/70 line-through decoration-muted-foreground/30"
                                : "text-muted-foreground/60"
                        )}>
                            {dose.peptideName}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
