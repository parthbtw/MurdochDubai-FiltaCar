// Arabic templates pending review by a native speaker.

// One question per gap, keyed by `${type}:${field}` (contract leaf paths).
// Fields with several kinds of gap pick a variant by the gap's detail.
// question_ar never contains gap.detail or English text: only Arabic plus
// values (item number, years, part numbers, sides written in Arabic).

import { parseArabicNote } from "./arabicDictionary.js";

const SIDE_AR = { left: "يسار", right: "يمين" };

const unknownWords = (r) => parseArabicNote(r.notes_ar).unknown_words.join("، ");
const trimStop = (text) => String(text).replace(/\.$/, "");
const yearsIn = (text) => [...new Set(String(text).match(/\b(?:19|20)\d{2}\b/g) || [])].join("، ");
const sidesIn = (text) =>
  [...new Set((String(text).match(/\b(?:left|right)\b/gi) || []).map((s) => SIDE_AR[s.toLowerCase()]))].join("، ");

const TEMPLATES = {
  "missing:weight_kg": {
    en: r => `For item ${r.item_id}, what is the packaged weight in kilograms? Please weigh the package.`,
    ar: r => `بالنسبة للقطعة رقم ${r.item_id}: ما وزن العبوة بالكيلوغرام؟ يرجى وزن العبوة.`,
  },
  "missing:packaged_dimensions_cm": {
    en: r => `For item ${r.item_id}, what are the packaged length, width and height in centimetres?`,
    ar: r => `بالنسبة للقطعة رقم ${r.item_id}: ما طول العبوة وعرضها وارتفاعها بالسنتيمتر؟`,
  },
  "missing:included_components": {
    en: r => `For item ${r.item_id}, which components are included? List only the components supplied with this part.`,
    ar: r => `بالنسبة للقطعة رقم ${r.item_id}: ما المكونات المرفقة؟ يرجى ذكر المكونات التي ستباع مع هذه القطعة فقط.`,
  },
  "missing:condition.cosmetic_damage": {
    en: r => `For item ${r.item_id}, describe the actual defects, or explicitly record none reported.`,
    ar: r => `بالنسبة للقطعة رقم ${r.item_id}: صف العيوب الفعلية أو سجل صراحة عدم وجود عيوب مبلغة.`,
  },
  "cannot_claim:draft": {
    en: (r, g) => `For item ${r.item_id}, we removed an unsupported claim (${g.detail}). Please confirm the factual wording.`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: حذفنا وصفا غير موثق. يرجى تأكيد الوصف الواقعي للقطعة.`,
  },
  "conflict:donor_vehicle.year": {
    en: (r, g) => `For item ${r.item_id}, the years do not agree (${g.detail}). Which year is correct?`,
    ar: (r, g) =>
      `بالنسبة للقطعة رقم ${r.item_id}: سنة الصنع غير متطابقة بين المصادر (${yearsIn(g.detail)}). ما هي سنة الصنع الصحيحة؟`,
  },
  "conflict:condition.testing_status": {
    en: (r, g) =>
      `For item ${r.item_id}, the electrical function cannot be checked from the records (${g.detail}). Could a specialist test it before we list it?`,
    ar: (r) =>
      `بالنسبة للقطعة رقم ${r.item_id}: لا يمكن التحقق من الوظيفة الكهربائية من السجلات. هل يمكن لأخصائي فحصها قبل العرض؟`,
  },
  "missing:part_details.placement": {
    en: (r) => `For item ${r.item_id}, the side is not given. Is the part left or right?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: جهة القطعة غير محددة. هل القطعة يمين أم يسار؟`,
  },
  "missing:part_details.colour_code": {
    en: (r) =>
      `For item ${r.item_id}, the colour and colour code are not recorded. What is the colour, and the colour code if there is one?`,
    ar: (r) =>
      `بالنسبة للقطعة رقم ${r.item_id}: لون القطعة وكود اللون غير مسجلين. ما هو اللون، وما هو كود اللون إن وجد؟`,
  },
  "missing:donor_vehicle.year": {
    en: (r) => `For item ${r.item_id}, the donor vehicle year is missing. What year is the part from?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: سنة سيارة التبرع غير موجودة. من أي سنة هذه القطعة؟`,
  },
  "missing:donor_vehicle.make": {
    en: (r) => `For item ${r.item_id}, the donor make is missing. Which make is the part from?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: شركة سيارة التبرع غير موجودة. من أي شركة هذه القطعة؟`,
  },
  "missing:donor_vehicle.model": {
    en: (r) => `For item ${r.item_id}, the donor model is missing. Which model is the part from?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: طراز سيارة التبرع غير موجود. من أي طراز هذه القطعة؟`,
  },
  "missing:condition.state": {
    en: (r) => `For item ${r.item_id}, the condition is not given. What condition is the part in?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: حالة القطعة غير محددة. ما هي حالة القطعة؟`,
  },
  "missing:condition.testing_status": {
    en: (r) => `For item ${r.item_id}, the part has not been tested. Could it be tested before we list it?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: لم يتم فحص القطعة. هل يمكن فحصها قبل العرض؟`,
  },
  "missing:photos": {
    en: (r) => `For item ${r.item_id}, there are no photos. Could you add at least one photo of the part?`,
    ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: لا توجد صور للقطعة. هل يمكنك إضافة صورة واحدة على الأقل؟`,
  },
  "cannot_claim:notes_ar": {
    en: (r) =>
      `For item ${r.item_id}, we did not recognise some words in your Arabic note (${unknownWords(r)}). Nothing from them is used in the listing. Could you explain what they mean?`,
    ar: (r) =>
      `بالنسبة للقطعة رقم ${r.item_id}: لم نتعرف على بعض الكلمات في ملاحظتك (${unknownWords(r)}). لم نستخدم شيئا منها في الإعلان. هل يمكنك توضيح معناها؟`,
  },
  "cannot_claim:original_title_en": {
    en: (r, g) => `For item ${r.item_id}, ${g.detail}. Could you confirm it, or should we remove the claim?`,
    ar: (r) =>
      `بالنسبة للقطعة رقم ${r.item_id}: العنوان يحتوي على صفة لا يمكن إثباتها. هل يمكنك تأكيد ذلك، أم نحذف هذه الصفة؟`,
  },
  "cannot_claim:original_title_ar": {
    en: (r, g) => `For item ${r.item_id}, ${g.detail}. Could you confirm it, or should we remove the claim?`,
    ar: (r) =>
      `بالنسبة للقطعة رقم ${r.item_id}: العنوان العربي يحتوي على صفة لا يمكن إثباتها. هل يمكنك تأكيد ذلك، أم نحذف هذه الصفة؟`,
  },
};

// Variants are tried in order; `match` runs on gap.detail and its groups are
// passed to the template as values.
const VARIANTS = {
  "conflict:part_details.placement": [
    {
      match: /^Side given only as "(driver|passenger) side"/,
      en: (r, g) => `For item ${r.item_id}, the side is unclear (${g.detail}). Is the part left or right?`,
      ar: (r, g, [, rel]) =>
        `بالنسبة للقطعة رقم ${r.item_id}: الجهة مذكورة فقط كجهة ${rel === "driver" ? "السائق" : "الراكب"}، وهي تختلف بين سيارة إماراتية وسيارة بريطانية. هل القطعة يمين أم يسار؟`,
    },
    {
      match: /./,
      en: (r, g) => `For item ${r.item_id}, the side is unclear (${g.detail}). Is the part left or right?`,
      ar: (r, g) =>
        `بالنسبة للقطعة رقم ${r.item_id}: جهة القطعة غير متطابقة بين المصادر (${sidesIn(g.detail)}). هل القطعة يمين أم يسار؟`,
    },
  ],
  "conflict:part_details.part_number.extracted_value": [
    {
      // record versus label
      match: /^record says (.+?); label read as (.+?) by /,
      en: (r, g) => `For item ${r.item_id}, the part numbers do not agree (${trimStop(g.detail)}). What is the correct part number?`,
      ar: (r, g, [, recorded, label]) =>
        `بالنسبة للقطعة رقم ${r.item_id}: رقم القطعة في السجل هو ${recorded}، لكن الملصق في الصورة يقرأ ${label}. يرجى التحقق من الرقم المختوم على القطعة. ما هو رقم القطعة الصحيح؟`,
    },
    {
      // disagree
      match: /^OCR read (.+?), CodeBuddy AI read (.+)$/,
      en: (r, g) =>
        `For item ${r.item_id}, the two label readers disagree (${g.detail}). Please check the stamp on the part and type the correct part number.`,
      ar: (r, g, [, first, second]) =>
        `بالنسبة للقطعة رقم ${r.item_id}: قراءتان مختلفتان لرقم القطعة من الصورة (${first} و ${second}). يرجى التحقق من الرقم المختوم على القطعة وكتابة الرقم الصحيح.`,
    },
    {
      match: /^part number (.+?) was extracted/,
      en: (r, g) => `For item ${r.item_id}, the part number needs checking (${g.detail}). What is the correct part number?`,
      ar: (r, g, [, value]) =>
        `بالنسبة للقطعة رقم ${r.item_id}: رقم القطعة ${value} يحتاج إلى تحقق. يرجى مطابقته مع الرقم المختوم على القطعة.`,
    },
  ],
  "missing:part_details.part_number.extracted_value": [
    {
      match: /^OCR Unclear, seller to type value$/,
      en: (r, g) => `For item ${r.item_id}, the label photo could not be read (${g.detail}). Could you type the part number?`,
      ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: صورة الملصق غير واضحة. هل يمكنك كتابة رقم القطعة؟`,
    },
    {
      // neither
      match: /^Neither OCR nor CodeBuddy AI/,
      en: (r) =>
        `For item ${r.item_id}, neither the photo reader nor CodeBuddy AI could read the part number. Could you type it from the stamp on the part?`,
      ar: (r) =>
        `بالنسبة للقطعة رقم ${r.item_id}: لم تتمكن القراءة الآلية من قراءة رقم القطعة. هل يمكنك كتابته من الرقم المختوم على القطعة؟`,
    },
    {
      // ai_only
      match: /^CodeBuddy AI read (.+); please confirm$/,
      en: (r, g, [, value]) =>
        `For item ${r.item_id}, CodeBuddy AI read the part number as ${value}. Is this correct? Please check the stamp on the part.`,
      ar: (r, g, [, value]) =>
        `بالنسبة للقطعة رقم ${r.item_id}: قرأ المساعد الآلي رقم القطعة ${value}. هل هذا الرقم صحيح؟ يرجى التحقق من الرقم المختوم على القطعة.`,
    },
    {
      match: /./,
      en: (r, g) => `For item ${r.item_id}, the part number is not confirmed (${g.detail}). Could you type the part number?`,
      ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: رقم القطعة غير موجود. هل يمكنك كتابة رقم القطعة؟`,
    },
  ],
  "cannot_claim:condition": [
    {
      // AI damage note suggestion
      match: /^CodeBuddy AI sees: (.*)\. Not used until the seller confirms$/,
      en: (r, g, [, note]) => `CodeBuddy AI sees: ${note}. Is this correct?`,
      ar: (r) =>
        `بالنسبة للقطعة رقم ${r.item_id}: لاحظ المساعد الآلي ضررا محتملا في صورة القطعة. هل هذا صحيح؟`,
    },
  ],
};

const DEFAULT_TEMPLATE = {
  en: (r, g) => `For item ${r.item_id}, please check ${g.field} (${g.detail}).`,
  ar: (r) => `بالنسبة للقطعة رقم ${r.item_id}: يرجى مراجعة بيانات هذه القطعة.`,
};

function templateFor(gap) {
  if (gap.type === 'cannot_claim' && gap.detail.includes('subjective condition')) {
    return { template: {
      en: r => `For item ${r.item_id}, subjective condition cannot be claimed. Please describe the actual damage and condition instead.`,
      ar: r => `بالنسبة للقطعة رقم ${r.item_id}: لا نستخدم أوصاف الحالة الذاتية. يرجى وصف الحالة الفعلية والعيوب بدلا من ذلك.`,
    }, groups: [] };
  }
  const key = `${gap.type}:${gap.field}`;
  for (const variant of VARIANTS[key] || []) {
    const groups = String(gap.detail ?? "").match(variant.match);
    if (groups) return { template: variant, groups };
  }
  return { template: TEMPLATES[key] || DEFAULT_TEMPLATE, groups: [] };
}

/**
 * @param {{field: string, type: string, detail: string, sources: string[]}[]} gaps
 * @param {object} record
 * @returns {{field: string, question_en: string, question_ar: string}[]}
 */
export function questionsFor(gaps, record) {
  const list = Array.isArray(gaps) ? gaps : [];
  return list.map((gap) => {
    const { template, groups } = templateFor(gap);
    return {
      field: gap.field,
      question_en: template.en(record, gap, groups),
      question_ar: template.ar(record, gap, groups),
    };
  });
}
