import type { ProtocolTemplate } from '@/data/protocol-knowledge';
import type { Peptide } from '@/hooks/use-peptides';

export type PaymentMethod = 'card' | 'zelle' | 'cashapp' | 'venmo';

export interface CartItem {
    peptide_id: string;
    name: string;
    price: number;
    quantity: number;
}

export interface SelectedProtocol {
    template: ProtocolTemplate;
    matched: Peptide[];
}

// Category gradient config with hover glow colors
export interface CategoryStyle {
    gradient: string;
    glow: string;
    hoverGlow: string;
    iconBg: string;
    borderHover: string;
}
