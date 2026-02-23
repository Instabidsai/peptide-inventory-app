/** Compare protocol item dosage/frequency with client vial schedule to detect drift */

export function frequenciesMatch(
    protocolFreq: string,
    vialFreq: string | null,
    vialInterval?: number | null,
): boolean {
    if (!vialFreq) return false;
    if (protocolFreq === vialFreq) return true;

    // Protocol uses terms like 'daily', 'daily_am_pm', 'weekly', 'biweekly', 'monthly', 'bid'
    // Vial uses 'daily', 'every_x_days', 'specific_days', 'x_on_y_off', 'every_other_day'
    if (protocolFreq === 'daily' && vialFreq === 'daily') return true;
    if (protocolFreq === 'daily_am_pm' && vialFreq === 'daily') return true;
    if (protocolFreq === 'weekly' && vialFreq === 'every_x_days' && vialInterval === 7) return true;
    if (protocolFreq === 'biweekly' && vialFreq === 'every_x_days' && (vialInterval === 3 || vialInterval === 4)) return true;
    if (protocolFreq === 'monthly' && vialFreq === 'every_x_days' && vialInterval != null && vialInterval >= 28 && vialInterval <= 31) return true;
    if (protocolFreq === 'every_other_day' && vialFreq === 'every_other_day') return true;
    if (protocolFreq === 'every_other_day' && vialFreq === 'every_x_days' && vialInterval === 2) return true;

    return false;
}

export function dosagesMatch(
    protocolAmount: number,
    protocolUnit: string,
    vialAmountMg: number | null,
): boolean {
    if (vialAmountMg == null) return false;
    // Convert protocol amount to mg for comparison
    let protocolMg: number;
    if (protocolUnit === 'mcg') {
        protocolMg = protocolAmount / 1000;
    } else if (protocolUnit === 'iu') {
        // IU can't be compared to mg directly — treat as compatible if same numeric value
        protocolMg = protocolAmount;
    } else {
        protocolMg = protocolAmount;
    }
    return Math.abs(protocolMg - vialAmountMg) < 0.01;
}

export type SyncStatus = 'in_sync' | 'dosage_mismatch' | 'frequency_mismatch' | 'both_mismatch' | 'no_vial';

export function checkProtocolSync(
    protocolItem: { dosage_amount: number; dosage_unit: string; frequency: string },
    vial: { dose_amount_mg: number | null; dose_frequency: string | null; dose_interval?: number | null } | null,
): SyncStatus {
    if (!vial) return 'no_vial';

    const dosageOk = dosagesMatch(protocolItem.dosage_amount, protocolItem.dosage_unit, vial.dose_amount_mg);
    const freqOk = frequenciesMatch(protocolItem.frequency, vial.dose_frequency, vial.dose_interval);

    if (dosageOk && freqOk) return 'in_sync';
    if (!dosageOk && !freqOk) return 'both_mismatch';
    if (!dosageOk) return 'dosage_mismatch';
    return 'frequency_mismatch';
}
