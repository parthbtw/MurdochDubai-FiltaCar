import { readFileSync } from 'node:fs';
import { confirmedPartNumber } from './claimGuard.js';
import { sellerOwnsField } from './conflicts.js';
import { hasComponents, hasDimensions, positiveNumber } from './shippingInfo.js';

const checklist = JSON.parse(readFileSync(new URL('../../../data/checklists/uae-uk-mirrors-test-v1.json', import.meta.url), 'utf8'));
const PN_FIELD = 'part_details.part_number.extracted_value';

export function buildChecklist(record, gaps, draft, corridor) {
  const blocked = field => gaps.some(gap => ['missing', 'conflict'].includes(gap.type) &&
    (gap.field === field || gap.field.startsWith(`${field}.`) || field.startsWith(`${gap.field}.`)));
  const result = (pass, detail) => ({ status: pass ? 'pass' : 'fail', detail });
  const pn = record.part_details?.part_number?.extracted_value;
  const outcomes = {
    part_number: blocked(PN_FIELD) || !pn
      ? result(false, 'Part number missing or unresolved.')
      : { status: confirmedPartNumber(record) || sellerOwnsField(record, PN_FIELD) ? 'pass' : 'unknown', detail: 'Two-source or seller confirmation required; reference data remains test data.' },
    side: result(!blocked('part_details.placement') && Boolean(corridor.uk_side_wording.value), 'Confirmed side and UK wording required.'),
    condition: result(!blocked('condition.state') && !blocked('condition.cosmetic_damage') && Boolean(record.condition?.state) && Array.isArray(record.condition?.cosmetic_damage), 'Disclose actual condition and defects; an empty defects array records none reported.'),
    testing: result(!blocked('condition.testing_status') && Boolean(record.condition?.testing_status), 'Disclose testing status. Unsupported working claims are removed; electrical conflicts require specialist review.'),
    photo: result(Array.isArray(record.photos) && record.photos.length > 0, 'At least one recorded photo required.'),
    shipping: result(positiveNumber(record.weight_kg) && hasDimensions(record), 'Positive weight and all three packaged dimensions required.'),
    components: result(hasComponents(record), 'List the included components.'),
    packing: { status: corridor.packing_alert.value ? 'pass' : 'unknown', detail: 'Fragile glass packing alert shown; verify actual packing before shipment.' },
    hazard: { status: 'unknown', detail: 'No sourced seller declaration that the item contains no battery or airbag. Verify before shipment.' },
    compatibility: result(Boolean(draft.compatibility?.note) && draft.compatibility.unverified.length > 0, 'Donor evidence and test reference listings are labelled, not verified fitment. Buyer must match the part number.'),
    seller_approval: { status: record.seller_approval?.approved === true && record.seller_approval.approved_at ? 'pass' : 'unknown', detail: 'Seller approval is the last step, after resolving blockers.' },
  };
  const declaration = record.hazard_declaration;
  if (declaration && record.field_sources?.hazard_declaration) {
    outcomes.hazard = result(declaration.side_mirror === true && declaration.no_battery === true && declaration.no_airbag === true,
      'Seller hazard declaration only; verify before shipment.');
  }
  return {
    id: checklist.id, version: checklist.version, dated: checklist.dated, label: checklist.label,
    items: checklist.items.map(item => ({ id: item.id, ...(item.status === 'reference'
      ? { status: 'reference', detail: `${item.requirement_en}. Verify with ${item.verify_with}.` }
      : outcomes[item.id]) })),
  };
}
