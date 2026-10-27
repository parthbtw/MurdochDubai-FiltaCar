import { SELLER_FIXABLE_CONFLICT_FIELDS } from './conflicts.js';

function priorityFor(gap) {
  if (gap.type === 'conflict') return SELLER_FIXABLE_CONFLICT_FIELDS.has(gap.field) ? 2 : 1;
  if (gap.type === 'cannot_claim') return 6;
  if (gap.field === 'part_details.part_number.extracted_value') return 3;
  if (gap.field.startsWith('condition.')) return 4;
  if (['weight_kg', 'packaged_dimensions_cm', 'included_components', 'part_details.colour_code'].includes(gap.field)) return 5;
  return 3;
}

export function buildActions(record, gaps, questions) {
  const actions = gaps.map((gap, index) => ({
    priority: priorityFor(gap),
    field: gap.field,
    action_en: questions[index].question_en,
    action_ar: questions[index].question_ar,
    blocking: ['missing', 'conflict'].includes(gap.type),
  }));
  if (typeof record.storage_location !== 'string' || !record.storage_location.trim()) {
    actions.push({ priority: 7, field: 'storage_location',
      action_en: 'Record the rack and bay so the seller can locate the part. Storage location is not listed.',
      action_ar: 'سجل الرف ومكان التخزين ليسهل العثور على القطعة. لا يظهر مكان التخزين في الإعلان.',
      blocking: false });
  }
  return actions.sort((a, b) => a.priority - b.priority);
}
