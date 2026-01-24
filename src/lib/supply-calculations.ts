export interface SupplyCalculation {
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
    // 1. Calculate daily usage in mg
    const dosageMg = protocolItem.dosage_unit === 'mcg'
        ? protocolItem.dosage / 1000
        : protocolItem.dosage;

    let dailyUsageMg = dosageMg;

    // Adjust for frequency
    if (protocolItem.frequency === 'weekly') {
        dailyUsageMg = dosageMg / 7;
    } else if (protocolItem.frequency === 'bid') {
        dailyUsageMg = dosageMg * 2;
    } else if (protocolItem.frequency === 'biweekly') {
        dailyUsageMg = (dosageMg * 2) / 7;
    }

    // 2. Calculate total supply from all bottles
    const totalSupplyMg = bottles.reduce((sum, bottle) => {
        // If current_quantity_mg is null, assume bottle is full
        const quantity = bottle.current_quantity_mg ?? bottle.initial_quantity_mg ?? 0;
        return sum + quantity;
    }, 0);

    // 3. Calculate days remaining
    const daysRemaining = dailyUsageMg > 0
        ? Math.floor(totalSupplyMg / dailyUsageMg)
        : 0;

    // 4. Determine status
    let status: 'adequate' | 'low' | 'critical' | 'depleted';
    if (daysRemaining === 0) {
        status = 'depleted';
    } else if (daysRemaining < 3) {
        status = 'critical';
    } else if (daysRemaining < 7) {
        status = 'low';
    } else {
        status = 'adequate';
    }

    // 5. Format bottle details
    const bottleDetails = bottles.map(b => ({
        id: b.id,
        uid: b.uid || 'Unknown',
        batchNumber: b.batch_number || 'Unknown',
        currentQuantityMg: b.current_quantity_mg ?? b.initial_quantity_mg ?? 0,
        initialQuantityMg: b.initial_quantity_mg ?? 0,
        usagePercent: b.initial_quantity_mg
            ? ((b.initial_quantity_mg - (b.current_quantity_mg ?? b.initial_quantity_mg)) / b.initial_quantity_mg) * 100
            : 0
    }));

    return {
        totalSupplyMg,
        dailyUsageMg,
        daysRemaining,
        bottles: bottleDetails,
        status
    };
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
