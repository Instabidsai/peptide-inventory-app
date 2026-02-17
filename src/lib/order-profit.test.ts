import { describe, it, expect } from 'vitest';
import { MERCHANT_FEE_RATE } from './order-profit';

describe('order-profit constants', () => {
  it('merchant fee rate is 5%', () => {
    expect(MERCHANT_FEE_RATE).toBe(0.05);
  });

  it('merchant fee calculation for $100 order', () => {
    const fee = Math.round(100 * MERCHANT_FEE_RATE * 100) / 100;
    expect(fee).toBe(5);
  });

  it('merchant fee calculation for $249.99 order', () => {
    const fee = Math.round(249.99 * MERCHANT_FEE_RATE * 100) / 100;
    expect(fee).toBe(12.5);
  });
});
