export function buildCorridor(record) {
  const label = 'guidance, verify';
  const side = String(record.part_details?.placement || '').toLowerCase();
  const wording = { left: 'N/S (nearside, left)', right: 'O/S (offside, right)' }[side] || null;
  const lhd = /^(lhd|left|left-hand drive|left hand drive)$/i.test(String(record.donor_vehicle?.drive_side || ''));
  return {
    uk_side_wording: { label, value: wording, note: wording ? null : 'Side unknown. Please verify left or right.' },
    drive_side_warning: { label, value: lhd ? 'This mirror came from a left-hand drive vehicle. UK cars are right-hand drive. Mirror glass and angle can differ. The buyer must verify against the part number.' : null },
    shipping: { label, tier: '2 to 15 kg', fragile: true, estimated: record.part_details?.weight == null },
    packing_alert: { label, value: 'fragile, glass' },
  };
}
