import { applyClaimGuard, confirmedPartNumber, hasTestRecord } from './claimGuard.js';

export function buildDraft(record, gaps, corridor) {
  const blocked_claims = [];
  const open = path => gaps.some(g => ['missing', 'conflict'].includes(g.type) &&
    (g.field === path || path.startsWith(`${g.field}.`) || g.field.startsWith(`${path}.`)));
  const guard = value => {
    const result = applyClaimGuard(value, record);
    blocked_claims.push(...result.blocked);
    return result.text.replace(/\u2014/g, '-');
  };
  const read = path => {
    if (open(path)) return '';
    const value = path.split('.').reduce((v, key) => v?.[key], record);
    return value == null ? '' : guard(Array.isArray(value) ? value.join(', ') : String(value));
  };
  const side = open('part_details.placement') || open('part_details.side') ? '' :
    corridor.uk_side_wording.value || '';
  const pn = read('part_details.part_number.extracted_value');
  const facts = ['make', 'model', 'year', 'colour'].map(key => read(`part_details.${key}`));
  const title = ['Used', side.startsWith('N/S') ? 'N/S' : side ? 'O/S' : '', 'Wing Mirror', ...facts.slice(0, 3), pn, facts[3]]
    .filter(Boolean).join(' ').slice(0, 80).trim();
  const paragraphs = [];
  const state = read('condition.state');
  const damage = read('condition.cosmetic_damage');
  if (state || damage) paragraphs.push([state, damage].filter(Boolean).join('. ') + '.');
  if (!hasTestRecord(record) || open('condition.testing_status')) paragraphs.push('Untested, not described as working.');
  else paragraphs.push(read('condition.testing_status') || 'Test record available.');
  const donor = ['year', 'make', 'model'].map(key => read(`donor_vehicle.${key}`)).filter(Boolean).join(' ');
  if (donor) paragraphs.push(`Removed from a ${donor} (donor vehicle, not a fitment guarantee). Please match the part number before buying.`);
  if (side) paragraphs.push(`${side}. ${corridor.uk_side_wording.label}.`);
  if (corridor.drive_side_warning.value) paragraphs.push(`${corridor.drive_side_warning.value} ${corridor.drive_side_warning.label}.`);
  paragraphs.push('Fragile, glass. Pack securely. Shipping guidance, verify: 2 to 15 kg.');
  const item_specifics = {};
  if (side) item_specifics['Placement on Vehicle'] = side;
  if (facts[3]) item_specifics.Colour = facts[3];
  const features = read('part_details.features');
  if (features) item_specifics.Features = features;
  const confirmed = confirmedPartNumber(record);
  if (pn && confirmed && !open('part_details.part_number.extracted_value')) {
    item_specifics['Manufacturer Part Number'] = guard(`OEM part number ${confirmed}`);
  }
  // Imported titles and notes are also audited, but never copied as fitment.
  for (const path of ['original_title_en', 'original_title_ar', 'notes_ar']) {
    guard(record[path] || '');
  }
  return { title, description: paragraphs.join('\n\n'), item_specifics, blocked_claims };
}
