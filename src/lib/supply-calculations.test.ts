import { describe, it, expect } from 'vitest';
import { calculateSupply, getSupplyStatusColor, getSupplyStatusLabel } from './supply-calculations';

describe('calculateSupply', () => {
  const makeBottle = (current: number, initial: number) => ({
    id: 'b1',
    uid: 'B-001',
    batch_number: 'LOT-1',
    current_quantity_mg: current,
    initial_quantity_mg: initial,
  });

  it('calculates daily dosage correctly', () => {
    const result = calculateSupply(
      { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(100, 100)]
    );
    expect(result.dailyUsageMg).toBe(5);
    expect(result.daysRemaining).toBe(20);
    expect(result.status).toBe('adequate');
  });

  it('converts mcg to mg', () => {
    const result = calculateSupply(
      { dosage: 500, dosage_unit: 'mcg', frequency: 'daily' },
      [makeBottle(10, 10)]
    );
    expect(result.dailyUsageMg).toBe(0.5);
    expect(result.daysRemaining).toBe(20);
  });

  it('handles weekly frequency', () => {
    const result = calculateSupply(
      { dosage: 7, dosage_unit: 'mg', frequency: 'weekly' },
      [makeBottle(14, 14)]
    );
    expect(result.dailyUsageMg).toBe(1);
    expect(result.daysRemaining).toBe(14);
  });

  it('handles BID (twice daily) frequency', () => {
    const result = calculateSupply(
      { dosage: 5, dosage_unit: 'mg', frequency: 'bid' },
      [makeBottle(100, 100)]
    );
    expect(result.dailyUsageMg).toBe(10);
    expect(result.daysRemaining).toBe(10);
  });

  it('handles 5on2off frequency', () => {
    const result = calculateSupply(
      { dosage: 7, dosage_unit: 'mg', frequency: '5on2off' },
      [makeBottle(100, 100)]
    );
    expect(result.dailyUsageMg).toBe(5);
    expect(result.daysRemaining).toBe(20);
  });

  it('handles 3x weekly frequency', () => {
    const result = calculateSupply(
      { dosage: 10, dosage_unit: 'mg', frequency: '3x weekly' },
      [makeBottle(60, 60)]
    );
    const expectedDaily = (10 * 3) / 7;
    expect(result.dailyUsageMg).toBeCloseTo(expectedDaily, 2);
  });

  it('sums supply across multiple bottles', () => {
    const result = calculateSupply(
      { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(50, 100), makeBottle(50, 100)]
    );
    expect(result.totalSupplyMg).toBe(100);
    expect(result.daysRemaining).toBe(20);
  });

  it('returns depleted status when no supply', () => {
    const result = calculateSupply(
      { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(0, 100)]
    );
    expect(result.status).toBe('depleted');
    expect(result.daysRemaining).toBe(0);
  });

  it('returns critical status when < 3 days', () => {
    const result = calculateSupply(
      { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(10, 100)]
    );
    expect(result.status).toBe('critical');
    expect(result.daysRemaining).toBe(2);
  });

  it('returns low status when < 7 days', () => {
    const result = calculateSupply(
      { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(25, 100)]
    );
    expect(result.status).toBe('low');
    expect(result.daysRemaining).toBe(5);
  });

  it('handles zero dosage safely', () => {
    const result = calculateSupply(
      { dosage: 0, dosage_unit: 'mg', frequency: 'daily' },
      [makeBottle(100, 100)]
    );
    expect(result.dailyUsageMg).toBe(0);
    expect(result.daysRemaining).toBe(0);
    expect(result.status).toBe('depleted');
  });

  it('handles null bottle quantities', () => {
    const result = calculateSupply(
      { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
      [{ id: 'b1', uid: 'B-001', batch_number: 'LOT-1', current_quantity_mg: null, initial_quantity_mg: 100 }]
    );
    // null current_quantity_mg should fall back to initial
    expect(result.totalSupplyMg).toBe(100);
  });

  it('handles empty bottles array', () => {
    const result = calculateSupply(
      { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
      []
    );
    expect(result.totalSupplyMg).toBe(0);
    expect(result.status).toBe('depleted');
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
