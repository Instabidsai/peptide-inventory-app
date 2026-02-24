import { describe, it, expect } from 'vitest';
import { vialDailyUsage, calculateSupply, parseVialSize, getSupplyStatusColor, getSupplyStatusLabel } from '../supply-calculations';

describe('vialDailyUsage', () => {
  it('returns 0 for zero dose', () => {
    expect(vialDailyUsage({ dose_amount_mg: 0, dose_frequency: 'daily' })).toBe(0);
  });

  it('returns 0 for null dose', () => {
    expect(vialDailyUsage({ dose_amount_mg: null, dose_frequency: 'daily' })).toBe(0);
  });

  it('daily frequency returns full dose', () => {
    expect(vialDailyUsage({ dose_amount_mg: 5, dose_frequency: 'daily' })).toBe(5);
  });

  it('every_x_days with interval 3', () => {
    expect(vialDailyUsage({ dose_amount_mg: 9, dose_frequency: 'every_x_days', dose_interval: 3 })).toBe(3);
  });

  it('every_x_days defaults to interval 2', () => {
    expect(vialDailyUsage({ dose_amount_mg: 10, dose_frequency: 'every_x_days' })).toBe(5);
  });

  it('specific_days with 3 days selected', () => {
    const result = vialDailyUsage({ dose_amount_mg: 7, dose_frequency: 'specific_days', dose_days: ['Mon', 'Wed', 'Fri'] });
    expect(result).toBe(3); // 7 * 3 / 7
  });

  it('x_on_y_off schedule 5on/2off', () => {
    const result = vialDailyUsage({ dose_amount_mg: 7, dose_frequency: 'x_on_y_off', dose_interval: 5, dose_off_days: 2 });
    expect(result).toBe(5); // 7 * 5 / 7
  });

  it('unknown frequency defaults to full dose', () => {
    expect(vialDailyUsage({ dose_amount_mg: 5, dose_frequency: 'unknown' })).toBe(5);
  });
});

describe('calculateSupply', () => {
  const makeBottle = (current: number, initial: number) => ({
    id: 'b1', uid: 'UID-1', batch_number: 'LOT-1',
    current_quantity_mg: current, initial_quantity_mg: initial,
  });

  it('calculates days remaining for daily use', () => {
    const result = calculateSupply(
      { dosage: 1, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(10, 10)]
    );
    expect(result.daysRemaining).toBe(10);
    expect(result.dailyUsageMg).toBe(1);
    expect(result.totalSupplyMg).toBe(10);
    expect(result.status).toBe('adequate');
  });

  it('converts mcg to mg', () => {
    const result = calculateSupply(
      { dosage: 500, dosage_unit: 'mcg', frequency: 'daily' },
      [makeBottle(5, 5)]
    );
    expect(result.dailyUsageMg).toBe(0.5);
    expect(result.daysRemaining).toBe(10);
  });

  it('handles weekly frequency', () => {
    const result = calculateSupply(
      { dosage: 7, dosage_unit: 'mg', frequency: 'weekly' },
      [makeBottle(7, 7)]
    );
    expect(result.dailyUsageMg).toBe(1);
    expect(result.daysRemaining).toBe(7);
  });

  it('handles BID (twice daily) frequency', () => {
    const result = calculateSupply(
      { dosage: 1, dosage_unit: 'mg', frequency: 'BID' },
      [makeBottle(10, 10)]
    );
    expect(result.dailyUsageMg).toBe(2);
    expect(result.daysRemaining).toBe(5);
  });

  it('sums multiple bottles', () => {
    const result = calculateSupply(
      { dosage: 1, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(5, 10), makeBottle(5, 10)]
    );
    expect(result.totalSupplyMg).toBe(10);
    expect(result.daysRemaining).toBe(10);
  });

  it('returns critical status for < 3 days', () => {
    const result = calculateSupply(
      { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(10, 50)]
    );
    expect(result.daysRemaining).toBe(2);
    expect(result.status).toBe('critical');
  });

  it('returns low status for < 7 days', () => {
    const result = calculateSupply(
      { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(25, 50)]
    );
    expect(result.daysRemaining).toBe(5);
    expect(result.status).toBe('low');
  });

  it('returns depleted for zero supply', () => {
    const result = calculateSupply(
      { dosage: 1, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(0, 10)]
    );
    expect(result.status).toBe('depleted');
  });

  it('handles 3x weekly frequency parsing', () => {
    const result = calculateSupply(
      { dosage: 7, dosage_unit: 'mg', frequency: '3x weekly' },
      [makeBottle(21, 21)]
    );
    expect(result.dailyUsageMg).toBe(3); // 7 * 3 / 7
    expect(result.daysRemaining).toBe(7);
  });

  it('handles null current_quantity_mg (assumes full)', () => {
    const result = calculateSupply(
      { dosage: 1, dosage_unit: 'mg', frequency: 'daily' },
      [{ id: 'b1', current_quantity_mg: null, initial_quantity_mg: 10 }]
    );
    expect(result.totalSupplyMg).toBe(10);
  });
});

describe('parseVialSize', () => {
  it('parses mg from name', () => {
    expect(parseVialSize('BPC-157 5mg')).toBe(5);
  });

  it('converts mcg to mg', () => {
    expect(parseVialSize('Semaglutide 250mcg')).toBe(0.25);
  });

  it('defaults to 5 when no match', () => {
    expect(parseVialSize('Unknown Peptide')).toBe(5);
  });

  it('handles decimal amounts', () => {
    expect(parseVialSize('TB-500 2.5mg')).toBe(2.5);
  });
});

describe('getSupplyStatusColor', () => {
  it('returns green for adequate', () => {
    expect(getSupplyStatusColor('adequate')).toBe('bg-green-500');
  });
  it('returns yellow for low', () => {
    expect(getSupplyStatusColor('low')).toBe('bg-yellow-500');
  });
  it('returns orange for critical', () => {
    expect(getSupplyStatusColor('critical')).toBe('bg-orange-500');
  });
  it('returns red for depleted', () => {
    expect(getSupplyStatusColor('depleted')).toBe('bg-red-500');
  });
});

describe('getSupplyStatusLabel', () => {
  it('returns Depleted for 0 days', () => {
    expect(getSupplyStatusLabel(0)).toBe('Depleted');
  });
  it('returns singular for 1 day', () => {
    expect(getSupplyStatusLabel(1)).toBe('1 day left');
  });
  it('returns plural for multiple days', () => {
    expect(getSupplyStatusLabel(14)).toBe('14 days left');
  });
});
