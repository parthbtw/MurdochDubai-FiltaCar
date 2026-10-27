import { normalizeArabic } from './arabicDictionary.js';
import { latestOcr, normalizePartNumber } from './evidence.js';

// The record's part number, only when two sources confirm it: the newest clear
// OCR reading has the same candidate, or OCR and CodeBuddy AI agreed on it.
export function confirmedPartNumber(record) {
  const pn = record.part_details?.part_number;
  const value = typeof pn === 'object' ? pn?.extracted_value : pn;
  if (!value) return null;
  const source = String(record.field_sources?.['part_details.part_number.extracted_value'] ?? '');
  if (source.startsWith('OCR + CodeBuddy AI agree')) return String(value);
  const ocr = latestOcr(record);
  const candidate = ocr?.part_number_candidate;
  if (ocr && ocr.unclear === false && candidate && normalizePartNumber(candidate) === normalizePartNumber(value)) {
    return String(value);
  }
  return null;
}

export function hasTestRecord(record) {
  const test = record.condition?.test_record;
  return Boolean(test && typeof test === 'object' && test.source &&
    (test.result || test.status || test.tested_at || test.at));
}

const GROUPS = [
  [['genuine', 'original', 'authentic', 'أصلي', 'OEM', 'وكالة'], 'Cannot claim: authenticity is never certified'],
  [['guaranteed', 'guarantee', 'warranty', 'مضمون'], 'Cannot claim: no guarantees offered'],
  [['fits all', 'universal', 'fits any', 'يركب على الكل'], 'Cannot claim: compatibility is not guaranteed'],
  [['tested working', 'fully functional', 'working', 'شغال', 'مجرب'], 'Cannot claim: no test record', 'test'],
  [['excellent condition', 'good condition', 'like new', 'excellent', 'perfect', 'mint', 'حالة جيدة', 'حالة ممتازة', 'ممتاز', 'نظيف', 'زي الجديد', 'مثل الجديد'], 'Cannot claim: subjective condition; describe the actual condition instead', 'subjective'],
];

export function applyClaimGuard(text, record) {
  let output = String(text ?? '');
  const blocked = [];
  for (const [phrases, reason, kind] of GROUPS) {
    if (kind === 'test' && hasTestRecord(record)) continue;
    for (const phrase of phrases) {
      const arabic = /[\u0600-\u06ff]/u.test(phrase);
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const arabicPattern = [...normalizeArabic(phrase)].map(char => {
        if (/\s/u.test(char)) return '\\s+';
        const letter = char === 'ا' ? '[اأإآٱ]' : char === 'ه' ? '[هة]' : char === 'ي' ? '[يى]' : char;
        return `${letter}[\\u064b-\\u0652\\u0670\\u0640]*`;
      }).join('');
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${arabic ? `${kind === 'subjective' ? '(?:ب|و|ال)?' : ''}${arabicPattern}` : escaped}(?![\\p{L}\\p{N}])`, 'giu');
      output = output.replace(pattern, match => {
        blocked.push({ phrase: match, reason });
        return '';
      });
    }
  }
  output = output.replace(/\s+/g, ' ').replace(/\s+([,.;:!?،])/g, '$1')
    .replace(/([,;:،])(?:\s*[,;:،])+/g, '$1').replace(/^[\s,.;:!?،-]+|[\s,;:،-]+$/g, '').trim();
  return { text: output, blocked };
}
