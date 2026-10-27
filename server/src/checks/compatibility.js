import { readFileSync } from 'node:fs';
import { applyClaimGuard, confirmedPartNumber } from './claimGuard.js';
import { isAiOnlySource, normalizePartNumber } from './evidence.js';

const referenceMap = JSON.parse(readFileSync(new URL('../../../data/compatibility_map.json', import.meta.url), 'utf8'));
const PN_FIELD = 'part_details.part_number.extracted_value';

export function buildCompatibility(record, gaps, map = referenceMap) {
  const value = record.part_details?.part_number?.extracted_value;
  const entry = Object.entries(map).find(([number]) => value && normalizePartNumber(number) === normalizePartNumber(value))?.[1];
  const clean = value => applyClaimGuard(value, record).text.replace(/\u2014/g, '-');
  const vehicle = item => [item.make, item.model, item.years || item.year, item.drive_side]
    .filter(value => value != null && value !== '').map(clean).filter(Boolean).join(' ');
  const unverified = [`${vehicle(record.donor_vehicle || {}) || 'Unknown donor vehicle'}: Donor vehicle only, not verified fitment`];
  if (/^(lhd|left|left-hand drive|left hand drive)$/i.test(String(record.donor_vehicle?.drive_side || ''))) {
    unverified.push('Suitability for UK right-hand drive vehicles not verified');
  }
  const confirmed = confirmedPartNumber(record) &&
    !isAiOnlySource(record.field_sources?.[PN_FIELD]) &&
    !gaps.some(gap => gap.field === PN_FIELD && ['missing', 'conflict'].includes(gap.type));
  const supported = [];
  for (const item of entry?.reference_vehicles || []) {
    const name = vehicle(item);
    if (confirmed) supported.push(`${name}: listed in reference data for this part number, per reference catalogue (test data, not verified)`);
    else unverified.push(`${name}: reference vehicle only; part number unconfirmed, not verified fitment`);
  }
  return { supported, unverified, note: 'Buyer must match the part number before purchase.' };
}
