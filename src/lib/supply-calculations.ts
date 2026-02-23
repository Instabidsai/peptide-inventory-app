/** Calculate daily mg usage from a vial's dose schedule */
export function vialDailyUsage(vial: {
    dose_amount_mg?: number | null;
    dose_frequency?: string | null;
    dose_interval?: number | null;
    dose_off_days?: number | null;
    dose_days?: string[] | null;
}): number {
    const doseMg = Number(vial.dose_amount_mg) || 0;
    if (doseMg <= 0) return 0;
    switch (vial.dose_frequency) {
        case 'daily': return doseMg;
        case 'every_x_days': return doseMg / Math.max(1, Number(vial.dose_interval) || 2);
        case 'specific_days': return (doseMg * Math.max(1, vial.dose_days?.length || 1)) / 7;
        case 'x_on_y_off': {
            const on = Math.max(1, Number(vial.dose_interval) || 5);
            const off = Math.max(0, Number(vial.dose_off_days) || 2);
            return (doseMg * on) / (on + off);
        }
        default: return doseMg;
    }
}

interface SupplyCalculation {
    totalSupplyMg: number;
    dailyUsageMg: number;
    daysRemaining: number;
    bottles: {
        id: string;
        uid: string;
        batchNumber: string;
        currentQuantityMg: number;
        initialQuantityMg: number;
        usagePercent: number;
    }[];
    status: 'adequate' | 'low' | 'critical' | 'depleted';
    suggestedUnits?: number;
    concentration?: number;
}

/**
 * Calculate days of supply remaining for a protocol item
 */
export function calculateSupply(
    protocolItem: {
        dosage: number;
        dosage_unit: string;
        frequency: string;
    },
    bottles: {
        id: string;
        uid?: string;
        batch_number?: string;
        current_quantity_mg: number | null;
        initial_quantity_mg: number | null;
    }[]
): SupplyCalculation {
    // 1. Calculate daily usage in mg - with safety checks
    const dosage = protocolItem?.dosage ?? 0;
    const dosageUnit = protocolItem?.dosage_unit ?? 'mg';
    const frequency = protocolItem?.frequency ?? 'daily';

    const dosageMg = dosageUnit === 'mcg'
        ? dosage / 1000
        : dosage;

    let dailyUsageMg = dosageMg;

    // Adjust for frequency
    const freqLower = frequency.toLowerCase().trim();
    if (freqLower === 'weekly') {
        dailyUsageMg = dosageMg / 7;
    } else if (freqLower === 'bid' || freqLower === 'twice daily' || freqLower.includes('2x')) {
        dailyUsageMg = dosageMg * 2;
    } else if (freqLower === 'biweekly' || freqLower === 'twice weekly') {
        dailyUsageMg = (dosageMg * 2) / 7;
    } else if (freqLower.includes('5on2off')) {
        dailyUsageMg = (dosageMg * 5) / 7;
    } else if (freqLower === 'daily' || freqLower === 'ed') {
        dailyUsageMg = dosageMg;
    } else {
        // Fallback: If frequency is not recognized but dosage is present, assume daily for calculation
        // Or check if it contains a number like '3x weekly'
        const match = freqLower.match(/(\d+)\s*x\s*(weekly|week|daily|day)/);
        if (match) {
            const times = parseInt(match[1]);
            const period = match[2];
            dailyUsageMg = (period === 'weekly' || period === 'week')
                ? (dosageMg * times) / 7
                : dosageMg * times;
        } else {
            dailyUsageMg = dosageMg;
        }
    }

    // Ensure dailyUsageMg is never NaN or undefined
    if (!Number.isFinite(dailyUsageMg)) {
        dailyUsageMg = 0;
    }

    // 2. Calculate total supply from all bottles
    const totalSupplyMg = bottles.reduce((sum, bottle) => {
        // If current_quantity_mg is null, assume bottle is full
        const quantity = bottle.current_quantity_mg ?? bottle.initial_quantity_mg ?? 0;
        return sum + (Number.isFinite(quantity) ? quantity : 0);
    }, 0);

    // 3. Calculate days remaining
    const daysRemaining = dailyUsageMg > 0 && Number.isFinite(dailyUsageMg) && Number.isFinite(totalSupplyMg)
        ? Math.floor(totalSupplyMg / dailyUsageMg)
        : 0;

    // 4. Determine status
    let status: 'adequate' | 'low' | 'critical' | 'depleted';
    if (daysRemaining === 0 || !Number.isFinite(daysRemaining)) {
        status = 'depleted';
    } else if (daysRemaining < 3) {
        status = 'critical';
    } else if (daysRemaining < 7) {
        status = 'low';
    } else {
        status = 'adequate';
    }

    // 5. Format bottle details - with safety checks
    const bottleDetails = bottles.map(b => {
        const currentQty = Number.isFinite(b.current_quantity_mg) ? b.current_quantity_mg! : (b.initial_quantity_mg ?? 0);
        const initialQty = Number.isFinite(b.initial_quantity_mg) ? b.initial_quantity_mg! : 0;

        const usagePercent = initialQty > 0
            ? ((initialQty - currentQty) / initialQty) * 100
            : 0;

        return {
            id: b.id,
            uid: b.uid || 'Unknown',
            batchNumber: b.batch_number || 'Unknown',
            currentQuantityMg: currentQty,
            initialQuantityMg: initialQty,
            usagePercent: Number.isFinite(usagePercent) ? usagePercent : 0
        };
    });

    return {
        totalSupplyMg: Number.isFinite(totalSupplyMg) ? totalSupplyMg : 0,
        dailyUsageMg: Number.isFinite(dailyUsageMg) ? dailyUsageMg : 0,
        daysRemaining: Number.isFinite(daysRemaining) ? Math.max(0, daysRemaining) : 0,
        bottles: bottleDetails,
        status,
        concentration: bottles.find(b => b.current_quantity_mg && b.current_quantity_mg > 0)?.concentration_mg_ml ?? undefined,
        suggestedUnits: undefined // Will be set by caller if needed
    };
}

/**
 * Extract vial size in mg from a peptide name string.
 * e.g. "BPC-157 5mg" -> 5, "Semaglutide 250mcg" -> 0.25
 */
export function parseVialSize(name: string): number {
    const match = name.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|iu)/i);
    if (!match) return 5; // Default fallback
    const val = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'mcg') return val / 1000;
    return val;
}

/**
 * Get status badge color
 */
export function getSupplyStatusColor(status: SupplyCalculation['status']) {
    switch (status) {
        case 'adequate':
            return 'bg-green-500';
        case 'low':
            return 'bg-yellow-500';
        case 'critical':
            return 'bg-orange-500';
        case 'depleted':
            return 'bg-red-500';
    }
}

/**
 * Get status label
 */
export function getSupplyStatusLabel(daysRemaining: number) {
    if (daysRemaining === 0) return 'Depleted';
    if (daysRemaining === 1) return '1 day left';
    return `${daysRemaining} days left`;
}
