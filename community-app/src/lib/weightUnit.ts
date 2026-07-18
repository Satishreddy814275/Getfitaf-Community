// Every weight value in workout_logged_sets is stored canonical kg,
// regardless of what a given member has their profile set to (see
// migration-weight-unit.sql) - this file is the one place that
// conversion happens, so display and input can never drift apart by
// using slightly different rounding in two spots.

export type WeightUnit = 'kg' | 'lbs'

const KG_PER_LB = 0.45359237

export function kgToLbs(kg: number): number {
  return kg / KG_PER_LB
}

export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB
}

// Rounded to 1 decimal for display - a raw kg<->lbs conversion almost
// never lands on a clean number (20kg is 44.092452kg->lbs), and gym
// weights are inherently coarse (plates come in fixed increments), so
// more precision than this would just be visual noise.
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// null-safe wrapper for the various "last logged" / history spots that
// pass through a possibly-absent weight.
export function convertWeightForDisplay(kg: number | null, unit: WeightUnit): number | null {
  if (kg == null) return null
  return unit === 'kg' ? round1(kg) : round1(kgToLbs(kg))
}

// The inverse, for turning a typed input value (already in the
// member's preferred unit) into the canonical kg number that actually
// gets written to workout_logged_sets. Deliberately NOT pre-rounded to
// 1 decimal here - storage keeps full precision, only display rounds,
// so repeated unit-switching doesn't compound rounding error.
export function convertWeightToKgForStorage(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : lbsToKg(value)
}
