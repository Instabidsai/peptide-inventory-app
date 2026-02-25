
export interface RegimenPeptide {
    id: string;
    name: string;
    avg_cost?: number | null;
    [key: string]: unknown;
}

export interface ConfirmDialogState {
    open: boolean;
    title: string;
    description: string;
    action: () => void;
}

export interface OrderStats {
    orderCount: number;
    totalSpend: number;
    avgOrderValue: number;
    lastOrderDate: string | undefined;
}

export interface CalculationResult {
    totalAmount: number;
    displayUnit: string;
    vialsNeeded: number;
    estimatedCost: number;
    daysPerVial: number;
}
