
export type InventoryStatus = 'active' | 'finished' | 'archived' | 'depleted';

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type DayOfWeek = typeof DAYS_OF_WEEK[number];

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

    // Dose scheduling fields
    dose_amount_mg: number | null;
    dose_days: string[] | null;
    dose_frequency: string | null;  // 'daily' | 'every_other_day' | 'every_x_days' | 'x_on_y_off' | 'specific_days'
    dose_interval: number | null;   // for every_x_days: the X
    dose_off_days: number | null;   // for x_on_y_off: the off count
    dose_time_of_day: string | null; // 'morning' | 'afternoon' | 'evening'
    in_fridge: boolean;

    // Joined fields (optional)
    peptide?: {
        name: string;
    };
    movement_id?: string | null;
    movement?: {
        movement_date: string;
    };
}

export type DoseFrequency = 'daily' | 'every_other_day' | 'every_x_days' | 'x_on_y_off' | 'specific_days';
export type DoseTimeOfDay = 'morning' | 'afternoon' | 'evening';

export const TIME_OF_DAY_OPTIONS: { value: DoseTimeOfDay; label: string; short: string }[] = [
    { value: 'morning', label: 'Morning', short: 'AM' },
    { value: 'afternoon', label: 'Afternoon', short: 'Noon' },
    { value: 'evening', label: 'Evening', short: 'PM' },
];

export const FREQUENCY_OPTIONS: { value: DoseFrequency; label: string }[] = [
    { value: 'daily', label: 'Every day' },
    { value: 'every_other_day', label: 'Every other day' },
    { value: 'every_x_days', label: 'Every X days' },
    { value: 'x_on_y_off', label: 'X days on, Y days off' },
    { value: 'specific_days', label: 'Specific days of week' },
];

/** Check if a given date is a dose day for a vial schedule.
 *  @param referenceDate - optional date to check (defaults to now) */
export function isDoseDay(vial: {
    dose_frequency?: string | null;
    dose_days?: string[] | null;
    dose_interval?: number | null;
    dose_off_days?: number | null;
    reconstituted_at?: string | null;
}, todayAbbr: string, referenceDate?: Date): boolean {
    const freq = vial.dose_frequency;
    if (!freq) return false;

    if (freq === 'daily') return true;

    if (freq === 'specific_days') {
        return (vial.dose_days || []).includes(todayAbbr);
    }

    // Interval-based frequencies need a start date
    const startDate = vial.reconstituted_at ? new Date(vial.reconstituted_at) : null;
    if (!startDate) return false;

    const checkDate = referenceDate || new Date();
    const daysSinceStart = Math.floor((checkDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    if (freq === 'every_other_day') {
        return daysSinceStart % 2 === 0;
    }

    if (freq === 'every_x_days') {
        const interval = vial.dose_interval || 1;
        return daysSinceStart % interval === 0;
    }

    if (freq === 'x_on_y_off') {
        const onDays = vial.dose_interval || 1;
        const offDays = vial.dose_off_days || 0;
        const cycle = onDays + offDays;
        if (cycle <= 0) return true;
        const position = daysSinceStart % cycle;
        return position < onDays;
    }

    return false;
}

/** Get a human-readable label for a vial's schedule */
export function getScheduleLabel(vial: {
    dose_frequency?: string | null;
    dose_days?: string[] | null;
    dose_interval?: number | null;
    dose_off_days?: number | null;
    dose_time_of_day?: string | null;
}): string {
    const freq = vial.dose_frequency;
    if (!freq) return '';
    let label = '';
    if (freq === 'daily') label = 'Every day';
    else if (freq === 'every_other_day') label = 'Every other day';
    else if (freq === 'every_x_days') label = `Every ${vial.dose_interval || '?'} days`;
    else if (freq === 'x_on_y_off') label = `${vial.dose_interval || '?'} on, ${vial.dose_off_days || '?'} off`;
    else if (freq === 'specific_days') label = (vial.dose_days || []).join(', ');
    else label = freq;

    const timeLabel = TIME_OF_DAY_OPTIONS.find(t => t.value === vial.dose_time_of_day);
    if (timeLabel) label += ` · ${timeLabel.short}`;
    return label;
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

export interface ProtocolItem {
    id: string;
    protocol_id: string;
    peptide_id: string;
    dosage_amount: number;
    dosage_unit: string;
    frequency: string;
    duration_days: number | null;
    duration_weeks: number;
}

export interface ProtocolSupplement {
    id: string;
    protocol_id: string;
    supplement_id: string;
    dosage: string | null;
    frequency: string | null;
    notes: string | null;
    supplements?: {
        name: string;
        image_url: string | null;
        description: string | null;
        purchase_link: string | null;
    };
}

export interface Protocol {
    id: string;
    name: string;
    description: string | null;
    protocol_items: ProtocolItem[];
    protocol_supplements?: ProtocolSupplement[];
}
