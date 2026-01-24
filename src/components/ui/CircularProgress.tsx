interface CircularProgressProps {
    value: number;        // Current value
    max: number;          // Maximum/goal value
    label: string;        // Main label (e.g., "Calories Remaining")
    color?: string;       // Ring color
    size?: number;        // SVG size in pixels (default 200)
    strokeWidth?: number; // Ring thickness (default 12)
    showPercentage?: boolean; // Show percentage instead of value
}

export function CircularProgress({
    value,
    max,
    label,
    color = "#2563EB",
    size = 200,
    strokeWidth = 12,
    showPercentage = false
}: CircularProgressProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    const offset = circumference - (percentage / 100) * circumference;

    // Determine color based on status
    const displayColor = percentage > 100 ? "#EF4444" : color;
    const remaining = Math.max(0, max - value);

    return (
        <div className="flex flex-col items-center justify-center gap-2">
            <svg width={size} height={size} className="transform -rotate-90">
                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    className="text-muted/20"
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={displayColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out"
                />

                {/* Center content */}
                <g transform={`rotate(90 ${size / 2} ${size / 2})`}>
                    <text
                        x={size / 2}
                        y={size / 2 - 10}
                        textAnchor="middle"
                        className="text-4xl font-bold fill-current"
                    >
                        {showPercentage ? `${Math.round(percentage)}%` : remaining}
                    </text>
                    <text
                        x={size / 2}
                        y={size / 2 + 15}
                        textAnchor="middle"
                        className="text-xs fill-current text-muted-foreground uppercase tracking-wide"
                    >
                        {label}
                    </text>
                    {!showPercentage && (
                        <text
                            x={size / 2}
                            y={size / 2 + 30}
                            textAnchor="middle"
                            className="text-[10px] fill-current text-muted-foreground"
                        >
                            of {max}
                        </text>
                    )}
                </g>
            </svg>
        </div>
    );
}
