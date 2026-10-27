import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClaimGuard, confirmedPartNumber } from '../claimGuard.js';
import { buildCorridor } from '../corridor.js';
import { buildDraft } from '../draft.js';
import { runChecks, buildQuestionPack } from '../index.js';
import { baseRecord } from './helpers.js';

const groups = [
  [['genuine', 'original', 'authentic', 'أصلي', 'OEM', 'وكالة'], 'Cannot claim: authenticity is never certified'],
  [['guaranteed', 'guarantee', 'warranty', 'مضمون'], 'Cannot claim: no guarantees offered'],
  [['fits all', 'universal', 'fits any', 'يركب على الكل'], 'Cannot claim: compatibility is not guaranteed'],
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

const PN_FIELD = 'part_details.part_number.extracted_value';
const clearOcr = candidate => [{ photo: '/demo/labels/TEST-001.png', unclear: false, part_number_candidate: candidate }];

test('OEM and وكالة are always blocked, even with a confirmed part number', () => {
  const record = baseRecord({ ocr: clearOcr('SBM-0001-T17') });
  assert.equal(confirmedPartNumber(record), 'SBM-0001-T17');
  for (const text of ['OEM Mirror', 'OEM part number SBM-0001-T17', 'oem', 'مرآة وكالة']) {
    const result = applyClaimGuard(text, record);
    assert.equal(result.blocked.length, 1, text);
    assert.equal(result.blocked[0].reason, 'Cannot claim: authenticity is never certified');
    assert.doesNotMatch(result.text, /OEM|وكالة/i);
  }
});

test('Manufacturer Part Number is the plain confirmed number, never labelled OEM', () => {
  const record = baseRecord({ ocr: clearOcr('SBM-0001-T17') });
  const draft = buildDraft(record, [], buildCorridor(record));
  assert.equal(draft.item_specifics['Manufacturer Part Number'], 'SBM-0001-T17');
  assert.deepEqual(draft.blocked_claims, []);
  const unconfirmed = baseRecord();
  assert.equal(buildDraft(unconfirmed, [], buildCorridor(unconfirmed)).item_specifics['Manufacturer Part Number'], undefined);
});

test('confirmedPartNumber needs a clear matching OCR candidate or an OCR + CodeBuddy AI agree source', () => {
  assert.equal(confirmedPartNumber(baseRecord({ ocr: clearOcr('sbm 0001 t17') })), 'SBM-0001-T17');
  assert.equal(confirmedPartNumber(baseRecord({ ocr: [{ unclear: true, part_number_candidate: 'SBM-0001-T17' }] })), null);
  assert.equal(confirmedPartNumber(baseRecord({ ocr: clearOcr('SBM-9999-ZZZ') })), null);
  assert.equal(confirmedPartNumber(baseRecord({ ocr: [...clearOcr('SBM-0001-T17'), ...clearOcr('SBM-9999-ZZZ')] })), null, 'newest reading wins');
  assert.equal(confirmedPartNumber(baseRecord({ ocr: { text: 'SBM-0001-T17', unclear: false } })), null, 'text alone is not a candidate');
  assert.equal(confirmedPartNumber(baseRecord()), null, 'spreadsheet alone is one source');
  assert.equal(confirmedPartNumber(baseRecord({ field_sources: { [PN_FIELD]: 'seller edit' } })), null);
  assert.equal(confirmedPartNumber(baseRecord({ field_sources: { [PN_FIELD]: 'OCR + CodeBuddy AI agree (photo 3)' } })), 'SBM-0001-T17');
  assert.equal(confirmedPartNumber(baseRecord({ part_details: { part_number: { extracted_value: null } }, ocr: clearOcr('SBM-0001-T17') })), null);
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
    const corridor = buildCorridor(baseRecord({ part_details: { placement: side }, weight_kg: null }));
    assert.equal(corridor.uk_side_wording.value, expected);
    assert.ok(Object.values(corridor).every(item => item.label === 'guidance, verify'));
    assert.match(corridor.drive_side_warning.value, /Mirror glass and angle can differ/);
    assert.equal(corridor.shipping.estimated, true);
  }
});

test('shipping tier comes from the top-level weight_kg', () => {
  const tier = weight_kg => buildCorridor(baseRecord({ weight_kg, packaged_dimensions_cm: null })).shipping;
  assert.deepEqual(tier(1.2), { label: 'guidance, verify', tier: 'under 2 kg', size: 'standard', fragile: true, estimated: false });
  assert.deepEqual(tier(2), { label: 'guidance, verify', tier: '2 to 15 kg', size: 'medium', fragile: true, estimated: false });
  assert.deepEqual(tier(15), { label: 'guidance, verify', tier: '2 to 15 kg', size: 'medium', fragile: true, estimated: false });
  assert.deepEqual(tier(22), { label: 'guidance, verify', tier: 'over 15 kg', size: 'heavy', fragile: true, estimated: false });
  for (const missing of [undefined, null, '', 'abc', 0]) {
    assert.deepEqual(tier(missing), { label: 'guidance, verify', tier: '2 to 15 kg', size: 'medium', fragile: true, estimated: true });
  }
  assert.equal(buildCorridor(baseRecord({ weight_kg: null, part_details: { weight: 3 } })).shipping.estimated, true, 'only weight_kg counts');
});

test('under 2 kg is not fragile unless glass applies; the packing alert always stays', () => {
  const noGlass = { part_details: { subcategory: 'Cover Cap' }, original_title_en: 'Plastic cover cap', condition: { cosmetic_damage: [] }, notes_ar: '', weight_kg: 0.4 };
  const plastic = buildCorridor(baseRecord(noGlass));
  assert.equal(plastic.shipping.fragile, false);
  assert.equal(plastic.packing_alert.value, 'fragile, glass');
  assert.equal(plastic.packing_alert.label, 'guidance, verify');
  assert.equal(buildCorridor(baseRecord({ ...noGlass, notes_ar: 'الزجاج سليم' })).shipping.fragile, true);
});

test('the draft quotes the corridor shipping tier', () => {
  const record = baseRecord({ weight_kg: 1.1 });
  assert.match(buildDraft(record, [], buildCorridor(record)).description, /Shipping guidance, verify: under 2 kg\./);
  assert.match(runChecks(baseRecord()).draft.description, /Shipping guidance, verify: 2 to 15 kg\./);
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
  const gap = result.gaps_and_conflicts.find(g => g.field === 'original_title_en');
  assert.equal(gap.type, 'cannot_claim');
  assert.ok(gap.sources.includes('original_title_en'));
  assert.ok(result.questions.some(q => q.field === 'original_title_en'));
  assert.equal(result.readiness_status, 'ready_for_review');
  assert.deepEqual(record, snapshot);
});
