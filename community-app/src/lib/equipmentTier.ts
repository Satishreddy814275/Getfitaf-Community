// program_templates.equipment_tier is free text with inconsistent
// casing in real data (e.g. "minimal_equipment" vs "Minimal_equipment",
// "dumbbell_and_bands", "bands_only", "Commercial_Gym") - nothing
// upstream normalizes it today, so anywhere it's shown raw (like
// ProgramPickerCard on /programs) members see the literal stored
// string, underscores and all. This maps the known values to a clean
// label; anything unrecognized falls back to the raw value rather than
// hiding it.
const TIER_LABELS: Record<string, string> = {
  minimal_equipment: 'No equipment needed',
  bands_only: 'Bands needed',
  dumbbell_and_bands: 'Dumbbells & bands needed',
  commercial_gym: 'Full gym required',
}

export function formatEquipmentTier(raw: string | null | undefined): string {
  if (!raw) return 'Equipment not specified'
  const key = raw.trim().toLowerCase()
  return TIER_LABELS[key] || raw
}
