import { describe, it, expect } from "vitest";
import { calculateDoseUnits } from "./dose-utils";

describe("calculateDoseUnits", () => {
  it("calculates standard dose correctly", () => {
    // 0.5mg at 2.5mg/mL = 0.2mL = 20 units
    expect(calculateDoseUnits(0.5, 2.5)).toBe(20);
  });

  it("calculates higher dose correctly", () => {
    // 2mg at 2.5mg/mL = 0.8mL = 80 units
    expect(calculateDoseUnits(2, 2.5)).toBe(80);
  });

  it("rounds to nearest whole unit", () => {
    // 1mg at 3mg/mL = 0.333mL = 33 units (rounded from 33.33)
    expect(calculateDoseUnits(1, 3)).toBe(33);
  });

  it("returns 0 for zero dose", () => {
    expect(calculateDoseUnits(0, 2.5)).toBe(0);
  });

  it("returns 0 for zero concentration", () => {
    expect(calculateDoseUnits(0.5, 0)).toBe(0);
  });

  it("returns 0 for negative concentration", () => {
    expect(calculateDoseUnits(0.5, -1)).toBe(0);
  });

  it("returns 0 for negative dose", () => {
    expect(calculateDoseUnits(-0.5, 2.5)).toBe(0);
  });

  it("handles 1:1 concentration (10mg/mL)", () => {
    // 1mg at 10mg/mL = 0.1mL = 10 units
    expect(calculateDoseUnits(1, 10)).toBe(10);
  });
});
