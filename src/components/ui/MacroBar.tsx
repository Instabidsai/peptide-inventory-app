import { MACRO_COLORS, MACRO_COLORS_LIGHT } from "@/lib/colors";

interface MacroBarProps {
    label: string;
    current: number;
    target: number;
    type: 'protein' | 'carbs' | 'fat';
}

export function MacroBar({ label, current, target, type }: MacroBarProps) {
    const percentage = Math.min(100, (current / target) * 100);
    const remaining = Math.max(0, target - current);
    const color = MACRO_COLORS[type];
    const bgColor = MACRO_COLORS_LIGHT[type];

    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold" style={{ color }}>{Math.round(current)}g</span>
                    <span className="text-xs text-muted-foreground">/ {target}g</span>
                </div>
            </div>

            {/* Progress bar */}
            <div className="relative w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: bgColor }}>
                <div
                    className="absolute top-0 left-0 h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                        width: `${percentage}%`,
                        backgroundColor: color
                    }}
                />
            </div>

            <div className="flex justify-end">
                <span className="text-xs text-muted-foreground">
                    {remaining}g remaining
                </span>
            </div>
        </div>
    );
}
