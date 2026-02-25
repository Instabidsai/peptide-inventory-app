import { memo } from 'react';
import { checkProtocolSync, type SyncStatus } from '@/lib/protocol-sync';
import { cn } from '@/lib/utils';
import { AlertTriangle, Check, Link2Off } from 'lucide-react';

interface ProtocolSyncBadgeProps {
    protocolItem: { dosage_amount: number; dosage_unit: string; frequency: string };
    vial: { dose_amount_mg: number | null; dose_frequency: string | null; dose_interval?: number | null } | null;
    compact?: boolean;
}

const STATUS_CONFIG: Record<SyncStatus, {
    label: string;
    shortLabel: string;
    className: string;
    icon: typeof Check;
} | null> = {
    in_sync: null, // Don't render anything when in sync
    dosage_mismatch: {
        label: 'Dosage differs from protocol',
        shortLabel: 'Dosage differs',
        className: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        icon: AlertTriangle,
    },
    frequency_mismatch: {
        label: 'Frequency differs from protocol',
        shortLabel: 'Freq differs',
        className: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        icon: AlertTriangle,
    },
    both_mismatch: {
        label: 'Schedule differs from protocol',
        shortLabel: 'Out of sync',
        className: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
        icon: AlertTriangle,
    },
    no_vial: {
        label: 'No active vial linked',
        shortLabel: 'No vial',
        className: 'text-muted-foreground/60 bg-muted/20 border-border/30',
        icon: Link2Off,
    },
};

function ProtocolSyncBadgeBase({ protocolItem, vial, compact = false }: ProtocolSyncBadgeProps) {
    const status = checkProtocolSync(protocolItem, vial);
    const config = STATUS_CONFIG[status];

    if (!config) return null; // in_sync — render nothing

    const Icon = config.icon;

    if (compact) {
        return (
            <span
                title={config.label}
                className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border",
                    config.className,
                )}
            >
                <Icon className="h-2.5 w-2.5" />
                {config.shortLabel}
            </span>
        );
    }

    return (
        <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium border",
            config.className,
        )}>
            <Icon className="h-3 w-3 shrink-0" />
            <span>{config.label}</span>
        </div>
    );
}

export const ProtocolSyncBadge = memo(ProtocolSyncBadgeBase);
