
export type InventoryStatus = 'active' | 'finished' | 'archived';

export interface ClientInventoryItem {
    id: string;
    contact_id: string;
    peptide_id: string;
    batch_number: string | null;
    vial_size_mg: number;
    water_added_ml: number | null;
    concentration_mg_ml: number | null;
    reconstituted_at: string | null;
    expires_at: string | null;
    current_quantity_mg: number;
    status: InventoryStatus;
    created_at: string;
    updated_at: string;

    // Joined fields (optional)
    peptide?: {
        name: string;
    };
}

export interface ClientDailyLog {
    id: string;
    contact_id: string;
    log_date: string; // YYYY-MM-DD
    weight_lbs: number | null;
    body_fat_pct: number | null;
    water_intake_oz: number | null;
    notes: string | null;
    side_effects: string[] | null;
    created_at: string;
    updated_at: string;
}

export interface ClientSupplement {
    id: string;
    contact_id: string;
    name: string;
    dosage: string | null;
    frequency: string | null;
    created_at: string;
}

export interface DailyProtocolTask {
    id: string;
    type: 'peptide' | 'supplement' | 'water';
    label: string;
    detail?: string;
    is_completed: boolean;
    reference_id?: string; // ID of the item (protocol_item_id or supplement_id)
}
