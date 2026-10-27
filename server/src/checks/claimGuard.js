import { normalizeArabic } from './arabicDictionary.js';

export function confirmedPartNumber(record) {
  const pn = record.part_details?.part_number;
  const value = typeof pn === 'object' ? pn?.extracted_value : pn;
  if (!value) return null;
  const field = 'part_details.part_number.extracted_value';
  const source = record.field_sources?.[field] || pn?.extraction_method || '';
  const seller = String(source).toLowerCase().startsWith('seller') ||
    [...(record.history || [])].reverse().find(e => e.field === field)?.by === 'seller';
  if (!seller && !/spreadsheet/i.test(source)) return null;
  if (!record.ocr || record.ocr.unclear) return null;
  const canonical = s => String(s).replace(/[\s-]/g, '').toUpperCase();
  const tokens = String(record.ocr.text || '').match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) || [];
  return tokens.some(t => canonical(t) === canonical(value)) ? String(value) : null;
}

export function hasTestRecord(record) {
  const test = record.condition?.test_record;
  return Boolean(test && typeof test === 'object' && test.source &&
    (test.result || test.status || test.tested_at || test.at));
}

const GROUPS = [
  [['genuine', 'original', 'authentic', 'أصلي'], 'Cannot claim: authenticity is never certified'],
  [['guaranteed', 'guarantee', 'warranty', 'مضمون'], 'Cannot claim: no guarantees offered'],
  [['fits all', 'universal', 'fits any', 'يركب على الكل'], 'Cannot claim: compatibility is not guaranteed'],
  [['OEM', 'وكالة'], 'Cannot claim: part number not confirmed by two sources', 'oem'],
  [['tested working', 'fully functional', 'working', 'شغال', 'مجرب'], 'Cannot claim: no test record', 'test'],
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
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${arabic ? arabicPattern : escaped}(?![\\p{L}\\p{N}])`, 'giu');
      output = output.replace(pattern, match => {
        if (kind === 'oem') {
          const pn = confirmedPartNumber(record);
          const remainder = output.slice(output.indexOf(match) + match.length).trim();
          if (pn && remainder === `part number ${pn}` && output.trim().startsWith(match)) return match;
        }
        blocked.push({ phrase: match, reason });
        return '';
      });
    }
  }
  output = output.replace(/\s+/g, ' ').replace(/\s+([,.;:!?،])/g, '$1')
    .replace(/([,;:،])(?:\s*[,;:،])+/g, '$1').replace(/^[\s,.;:!?،-]+|[\s,;:،-]+$/g, '').trim();
  return { text: output, blocked };
}
