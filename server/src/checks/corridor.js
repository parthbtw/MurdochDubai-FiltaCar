// Glass applies to mirrors and anything described as glass.
function hasGlass(record) {
  const text = [
    record.part_details?.subcategory,
    record.original_title_en,
    ...(Array.isArray(record.condition?.cosmetic_damage) ? record.condition.cosmetic_damage : []),
  ].join(' ');
  return /\b(?:mirror|glass)\b/i.test(text) || /زجاج|مرآة|مراة/.test(String(record.notes_ar ?? ''));
}

// Shipping tier from the top-level weight_kg. Without a weight the medium tier
// is kept as an estimate.
function shippingFor(record, label) {
  const weight = Number(record.weight_kg);
  const glass = hasGlass(record);
  if (record.weight_kg == null || record.weight_kg === '' || !Number.isFinite(weight) || weight <= 0) {
    return { label, tier: '2 to 15 kg', size: 'medium', fragile: true, estimated: true };
  }
  if (weight < 2) return { label, tier: 'under 2 kg', size: 'standard', fragile: glass, estimated: false };
  if (weight <= 15) return { label, tier: '2 to 15 kg', size: 'medium', fragile: true, estimated: false };
  return { label, tier: 'over 15 kg', size: 'heavy', fragile: glass, estimated: false };
}

export function buildCorridor(record) {
  const label = 'guidance, verify';
  const side = String(record.part_details?.placement || '').toLowerCase();
  const wording = { left: 'N/S (nearside, left)', right: 'O/S (offside, right)' }[side] || null;
  const lhd = /^(lhd|left|left-hand drive|left hand drive)$/i.test(String(record.donor_vehicle?.drive_side || ''));
  return {
    uk_side_wording: { label, value: wording, note: wording ? null : 'Side unknown. Please verify left or right.' },
    drive_side_warning: { label, value: lhd ? 'This mirror came from a left-hand drive vehicle. UK cars are right-hand drive. Mirror glass and angle can differ. The buyer must verify against the part number.' : null },
    shipping: shippingFor(record, label),
    packing_alert: { label, value: 'fragile, glass' },
  };
}
