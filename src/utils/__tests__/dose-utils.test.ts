import { describe, it, expect } from 'vitest';
import { calculateDoseUnits } from '../dose-utils';

describe('calculateDoseUnits', () => {
  it('calculates standard insulin units', () => {
    // 0.25mg at 5mg/mL = 0.05mL = 5 units
    expect(calculateDoseUnits(0.25, 5)).toBe(5);
  });

  it('calculates higher dose units', () => {
    // 1mg at 5mg/mL = 0.2mL = 20 units
    expect(calculateDoseUnits(1, 5)).toBe(20);
  });

  it('rounds to nearest whole unit', () => {
    // 0.3mg at 5mg/mL = 0.06mL = 6 units
    expect(calculateDoseUnits(0.3, 5)).toBe(6);
  });

  it('returns 0 for zero dose', () => {
    expect(calculateDoseUnits(0, 5)).toBe(0);
  });

  it('returns 0 for zero concentration', () => {
    expect(calculateDoseUnits(1, 0)).toBe(0);
  });

  it('returns 0 for negative dose', () => {
    expect(calculateDoseUnits(-1, 5)).toBe(0);
  });

  it('returns 0 for negative concentration', () => {
    expect(calculateDoseUnits(1, -5)).toBe(0);
  });

  it('handles large doses correctly', () => {
    // 5mg at 10mg/mL = 0.5mL = 50 units
    expect(calculateDoseUnits(5, 10)).toBe(50);
  });

  it('handles low concentration', () => {
    // 1mg at 1mg/mL = 1mL = 100 units (full syringe)
    expect(calculateDoseUnits(1, 1)).toBe(100);
  });
});
