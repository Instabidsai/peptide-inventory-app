import type { PartnerNode, DownlineClient } from '@/hooks/use-partner';

// Re-export for convenience
export type { PartnerNode, DownlineClient };

// Tier display config
export const TIER_INFO: Record<string, { label: string; discount: string; emoji: string }> = {
    senior: { label: 'Senior Partner', discount: '2x cost', emoji: '\u{1F947}' },
    standard: { label: 'Standard Partner', discount: '2x cost', emoji: '\u{1F948}' },
    referral: { label: 'Referral Partner', discount: '2x cost', emoji: '\u{1F517}' },
};

export type SheetView = 'balance' | 'commissions' | 'owed' | 'earnings' | 'add-person' | null;

export const EMPTY_PERSON = { name: '', email: '', phone: '', address: '', assignedTo: '' };

export interface CommissionStats {
    pending: number;
    available: number;
    paid: number;
    total: number;
}

export interface OwedMovement {
    id: string;
    created_at: string;
    amount_paid: number | null;
    payment_status: string | null;
    discount_amount: number | null;
    notes: string | null;
    subtotal: number;
    discount: number;
    paid: number;
    owed: number;
    itemCount: number;
    items: never[];
}
