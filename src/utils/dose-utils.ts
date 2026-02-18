/**
 * Calculate insulin syringe units from dose and concentration.
 * Formula: units = (doseMg / concentrationMgMl) * 100
 * Standardized on Math.round() — insulin syringes have whole-unit markings.
 * Returns 0 if inputs are invalid.
 */
export function calculateDoseUnits(
  doseMg: number,
  concentrationMgMl: number,
): number {
  if (!doseMg || !concentrationMgMl || concentrationMgMl <= 0 || doseMg <= 0) {
    return 0;
  }
  return Math.round((doseMg / concentrationMgMl) * 100);
}
