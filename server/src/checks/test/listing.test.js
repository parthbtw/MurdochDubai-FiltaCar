import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClaimGuard } from '../claimGuard.js';
import { buildCorridor } from '../corridor.js';
import { buildDraft } from '../draft.js';
import { runChecks, buildQuestionPack } from '../index.js';
import { baseRecord } from './helpers.js';

const groups = [
  [['genuine', 'original', 'authentic', 'أصلي'], 'Cannot claim: authenticity is never certified'],
  [['guaranteed', 'guarantee', 'warranty', 'مضمون'], 'Cannot claim: no guarantees offered'],
  [['fits all', 'universal', 'fits any', 'يركب على الكل'], 'Cannot claim: compatibility is not guaranteed'],
  [['OEM', 'وكالة'], 'Cannot claim: part number not confirmed by two sources'],
  [['tested working', 'working', 'fully functional', 'شغال', 'مجرب'], 'Cannot claim: no test record'],
];
for (const [phrases, reason] of groups) for (const phrase of phrases) {
  test(`claim guard removes ${phrase}`, () => {
    const result = applyClaimGuard(`, ${phrase.toUpperCase()}, Mirror`, baseRecord());
    assert.equal(result.text, 'Mirror');
    assert.equal(result.blocked.length, 1);
    assert.equal(result.blocked[0].reason, reason);
  });
}

test('OEM is permitted only as a confirmed item-specific number', () => {
  const record = baseRecord({ ocr: { text: 'SBM-0001-T17', unclear: false } });
  assert.equal(applyClaimGuard('OEM Mirror', record).text, 'Mirror');
  assert.equal(applyClaimGuard('OEM part number SBM-0001-T17', record).blocked.length, 0);
  const draft = buildDraft(record, [], buildCorridor(record));
  assert.equal(draft.item_specifics['Manufacturer Part Number'], 'OEM part number SBM-0001-T17');
  assert.ok(!/OEM/i.test(draft.title));
  const seller = baseRecord({ field_sources: { 'part_details.part_number.extracted_value': 'seller edit' }, ocr: { text: 'SBM-0001-T17' } });
  assert.equal(applyClaimGuard('OEM part number SBM-0001-T17', seller).blocked.length, 0);
});

test('working requires a sourced test record', () => {
  assert.equal(applyClaimGuard('tested working mirror', baseRecord()).blocked.length, 1);
  const record = baseRecord({ condition: { test_record: { result: 'Passed', source: 'bench report' } } });
  assert.equal(applyClaimGuard('tested working mirror', record).blocked.length, 0);
});

test('draft uses part facts only, omits conflicts and caps title length', () => {
  const record = baseRecord({ part_details: { make: 'PartMake', model: 'LongModel '.repeat(20), year: 2018, colour: 'silver', features: ['heated'] } });
  const draft = buildDraft(record, [{ field: 'part_details.make', type: 'conflict' }], buildCorridor(record));
  assert.ok(draft.title.length <= 80);
  assert.ok(!draft.title.includes('PartMake'));
  assert.ok(!draft.title.includes('Toyota'));
  assert.ok(draft.description.includes('donor vehicle, not a fitment guarantee'));
  assert.ok(draft.description.includes('Untested, not described as working.'));
});

test('corridor sides and every top-level item carry guidance labels', () => {
  for (const [side, expected] of [['Left', 'N/S (nearside, left)'], ['Right', 'O/S (offside, right)'], [null, null]]) {
    const corridor = buildCorridor(baseRecord({ part_details: { placement: side } }));
    assert.equal(corridor.uk_side_wording.value, expected);
    assert.ok(Object.values(corridor).every(item => item.label === 'guidance, verify'));
    assert.match(corridor.drive_side_warning.value, /Mirror glass and angle can differ/);
    assert.equal(corridor.shipping.estimated, true);
  }
  assert.equal(buildCorridor(baseRecord({ part_details: { weight: 3 } })).shipping.estimated, false);
});

test('question pack contains all bilingual questions and handles no questions', () => {
  const record = baseRecord({ questions: [{ question_en: 'Which side?', question_ar: 'أي جهة؟' }, { question_en: 'Which year?', question_ar: 'أي سنة؟' }] });
  const pack = buildQuestionPack(record);
  for (const q of record.questions) assert.ok(pack.includes(q.question_en) && pack.includes(q.question_ar));
  assert.ok(pack.includes(record.item_id));
  assert.match(buildQuestionPack(baseRecord()), /No open questions/);
  assert.match(buildQuestionPack(baseRecord()), /لا توجد أسئلة مفتوحة/);
});

test('blocked drafts generate sourced cannot_claim gaps and matching questions', () => {
  const record = baseRecord({ original_title_en: 'Authentic mirror' });
  const snapshot = structuredClone(record);
  const result = runChecks(record);
  const gap = result.gaps_and_conflicts.find(g => g.field === 'draft');
  assert.equal(gap.type, 'cannot_claim');
  assert.ok(gap.sources.includes('original_title_en'));
  assert.ok(result.questions.some(q => q.field === 'draft'));
  assert.equal(result.readiness_status, 'ready_for_review');
  assert.deepEqual(record, snapshot);
});
