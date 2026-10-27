// Arabic templates pending review by a native speaker.

// One question per gap, keyed by `${type}:${field}` with a fallback per field
// and a generic default. Templates are short and polite, name the item and
// quote the conflicting values (they already live in gap.detail).

const TEMPLATES = {
  "conflict:year": {
    en: (r, g) => `For item ${r.item_id}, the years do not agree (${g.detail}). Which year is correct?`,
    ar: (r, g) =>
      `بالنسبة للقطعة رقم ${r.item_id}: سنة الصنع غير متطابقة (${g.detail}). ما هي سنة الصنع الصحيحة؟`,
  },
  "conflict:side": {
    en: (r, g) => `For item ${r.item_id}, the side is unclear (${g.detail}). Is the part left or right?`,
    ar: (r, g) =>
      `بالنسبة للقطعة رقم ${r.item_id}: جهة القطعة غير واضحة (${g.detail}). هل القطعة يمين أم يسار؟`,
  },
  "conflict:part_number": {
    en: (r, g) => `For item ${r.item_id}, the part numbers do not agree (${g.detail}). What is the correct part number?`,
    ar: (r, g) =>
      `بالنسبة للقطعة رقم ${r.item_id}: رقم القطعة غير متطابق (${g.detail}). ما هو رقم القطعة الصحيح؟`,
  },
  "missing:part_number": {
    en: (r, g) => `For item ${r.item_id}, the part number is not confirmed (${g.detail}). Could you type the part number?`,
    ar: (r, g) =>
      `بالنسبة للقطعة رقم ${r.item_id}: رقم القطعة غير مؤكد (${g.detail}). هل يمكنك كتابة رقم القطعة؟`,
  },
  "missing:year": {
    en: (r) => `For item ${r.item_id}, the year is missing. What year is the part from?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: سنة الصنع غير موجودة. من أي سنة هذه القطعة؟`,
  },
  "missing:side": {
    en: (r) => `For item ${r.item_id}, the side is not given. Is the part left or right?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: جهة القطعة غير محددة. هل القطعة يمين أم يسار؟`,
  },
  "missing:condition": {
    en: (r) => `For item ${r.item_id}, the condition is not given. What condition is the part in?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: حالة القطعة غير محددة. ما هي حالة القطعة؟`,
  },
  "missing:make": {
    en: (r) => `For item ${r.item_id}, the make is missing. Which make is the part for?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: الشركة الصانعة غير موجودة. لأي شركة صانعة هذه القطعة؟`,
  },
  "missing:model": {
    en: (r) => `For item ${r.item_id}, the model is missing. Which model is the part for?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: طراز المركبة غير موجود. لأي طراز هذه القطعة؟`,
  },
  "missing:photos": {
    en: (r) => `For item ${r.item_id}, there are no photos. Could you add at least one photo of the part?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: لا توجد صور للقطعة. هل يمكنك إضافة صورة واحدة على الأقل؟`,
  },
  "missing:notes_ar": {
    en: (r, g) => `For item ${r.item_id}, some words in your Arabic note were not understood (${g.detail}). What do they mean?`,
    ar: (r, g) =>
      `بالنسبة للقطعة رقم ${r.item_id}: توجد كلمات في الملاحظة لم نفهمها (${g.detail}). ماذا تعني هذه الكلمات؟`,
  },
  "cannot_claim:title": {
    en: (r, g) => `For item ${r.item_id}, ${g.detail}. Could you confirm it, or should we remove the claim?`,
    ar: (r, g) =>
      `بالنسبة للقطعة رقم ${r.item_id}: ${g.detail}. هل يمكنك تأكيد ذلك، أم نحذف هذه الصفة؟`,
  },
};

const FIELD_FALLBACK = {
  notes_ar: {
    en: (r, g) => `For item ${r.item_id}, the Arabic note needs checking (${g.detail}). Could you clarify?`,
    ar: (r, g) => `بالنسبة للقطعة رقم ${r.item_id}: تحتاج الملاحظة إلى توضيح (${g.detail}). هل يمكنك التوضيح؟`,
  },
};

const DEFAULT_TEMPLATE = {
  en: (r, g) => `For item ${r.item_id}, please check ${g.field} (${g.detail}).`,
  ar: (r, g) => `بالنسبة للقطعة رقم ${r.item_id}: يرجى التحقق من ${g.field} (${g.detail}).`,
};

/**
 * @param {{field: string, type: string, detail: string, sources: string[]}[]} gaps
 * @param {object} record
 * @returns {{field: string, question_en: string, question_ar: string}[]}
 */
export function questionsFor(gaps, record) {
  const list = Array.isArray(gaps) ? gaps : [];
  return list.map((gap) => {
    const template =
      TEMPLATES[`${gap.type}:${gap.field}`] || FIELD_FALLBACK[gap.field] || DEFAULT_TEMPLATE;
    return {
      field: gap.field,
      question_en: template.en(record, gap),
      question_ar: template.ar(record, gap),
    };
  });
}
