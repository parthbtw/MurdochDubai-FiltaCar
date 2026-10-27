import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runChecks } from '../runChecks.js';
import { applyClaimGuard } from '../claimGuard.js';
import { baseRecord } from './helpers.js';

const seeds = JSON.parse(readFileSync(new URL('../../../../data/parts.json', import.meta.url), 'utf8'));
const map = JSON.parse(readFileSync(new URL('../../../../data/compatibility_map.json', import.meta.url), 'utf8'));
const checklist = JSON.parse(readFileSync(new URL('../../../../data/checklists/uae-uk-mirrors-test-v1.json', import.meta.url), 'utf8'));
const seed = id => structuredClone(seeds.find(part => part.item_id === id));
const PN = 'part_details.part_number.extracted_value';
const reason = 'Cannot claim: subjective condition; describe the actual condition instead';
const arabicOnly = question => assert.doesNotMatch(question.replace(/(?:MIR|TEST)-\d+/g, ''), /[a-z]/i);

test('synthetic seeds retain exactly 3 ready, 5 missing and 2 specialist, with sourced new fields', () => {
  const statuses = seeds.map(part => runChecks(part).readiness_status);
  assert.deepEqual(statuses, [
    ...Array(3).fill('ready_for_review'), ...Array(5).fill('information_missing'), ...Array(2).fill('specialist_review_required'),
  ]);
  for (const [index, part] of seeds.entries()) {
    assert.equal(part.created_at, undefined);
    for (const field of ['storage_location', 'weight_kg', 'packaged_dimensions_cm', 'included_components']) {
      const omitted = part.item_id === 'MIR-0008' && ['storage_location', 'included_components'].includes(field) ||
        part.item_id === 'MIR-0005' && ['weight_kg', 'packaged_dimensions_cm'].includes(field);
      assert.equal(part[field] === undefined, omitted, `${part.item_id}:${field}`);
      if (!omitted) assert.equal(part.field_sources[field], `spreadsheet row ${index + 3}`);
    }
    if (part.weight_kg) assert.ok(part.weight_kg >= 1.2 && part.weight_kg <= 3.5);
    const result = runChecks(part);
    assert.ok(!JSON.stringify(result.draft).includes('storage_location'));
    if (part.storage_location) assert.ok(!JSON.stringify(result.draft).includes(part.storage_location));
  }
  assert.ok(seed('MIR-0009').included_components.includes('connector'));
  assert.ok(seed('MIR-0010').included_components.includes('connector'));
  assert.ok(seed('MIR-0010').included_components.includes('camera'));
});

test('MIR-0005 asks specific bilingual weight and dimensions questions', () => {
  const result = runChecks(seed('MIR-0005'));
  for (const [field, word] of [['weight_kg', 'weight'], ['packaged_dimensions_cm', 'length']]) {
    assert.ok(result.gaps_and_conflicts.some(gap => gap.field === field && gap.type === 'missing'));
    const question = result.questions.find(question => question.field === field);
    assert.ok(question.question_en.includes(word));
    arabicOnly(question.question_ar);
  }
  assert.equal(result.actions_required[0].priority, 3);
  assert.equal(result.actions_required[0].field, PN);
});

test('MIR-0008 has a blocking components gap and a final non-blocking storage action, never a storage gap', () => {
  const result = runChecks(seed('MIR-0008'));
  assert.ok(result.gaps_and_conflicts.some(gap => gap.field === 'included_components' && gap.type === 'missing'));
  assert.ok(!result.gaps_and_conflicts.some(gap => gap.field === 'storage_location'));
  assert.equal(result.actions_required.find(action => action.field === 'included_components').blocking, true);
  assert.deepEqual(result.actions_required.at(-1), {
    priority: 7, field: 'storage_location',
    action_en: 'Record the rack and bay so the seller can locate the part. Storage location is not listed.',
    action_ar: 'سجل الرف ومكان التخزين ليسهل العثور على القطعة. لا يظهر مكان التخزين في الإعلان.', blocking: false,
  });
  assert.doesNotMatch(result.draft.description, /Included:/);
  arabicOnly(result.questions.find(question => question.field === 'included_components').question_ar);
});

test('invalid or partial shipping data remains a missing gap even after a seller edit', () => {
  for (const weight of [null, 0, -1, '2kg', Infinity]) {
    const result = runChecks(baseRecord({ weight_kg: weight, field_sources: { weight_kg: 'seller edit' } }));
    assert.ok(result.gaps_and_conflicts.some(gap => gap.field === 'weight_kg' && gap.type === 'missing'));
  }
  for (const dimensions of [null, { length: 40, width: 20 }, { length: 40, width: 20, height: 0 }]) {
    const result = runChecks({ ...baseRecord(), packaged_dimensions_cm: dimensions });
    assert.ok(result.gaps_and_conflicts.some(gap => gap.field === 'packaged_dimensions_cm'));
    assert.equal(result.corridor.shipping.packaged_dimensions_cm, undefined);
  }
});

test('shipping uses recorded weight and dimensions, with an Included line only when supplied', () => {
  const part = seed('MIR-0001');
  const result = runChecks(part);
  assert.equal(result.corridor.shipping.estimated, false);
  assert.deepEqual(result.corridor.shipping.packaged_dimensions_cm, part.packaged_dimensions_cm);
  assert.ok(result.draft.description.includes(`Included: ${part.included_components.join(', ')}`));
  part.weight_kg = 1.2;
  assert.equal(runChecks(part).corridor.shipping.tier, 'under 2 kg');
});

test('reference compatibility requires confirmed number and no identifier conflict', () => {
  const part = seed('MIR-0001');
  const result = runChecks(part);
  assert.equal(result.draft.compatibility.supported.length, 1);
  assert.match(result.draft.compatibility.supported[0], /Toyota Land Cruiser.*listed in reference data for.*per reference catalogue \(test data, not verified\)/);
  assert.ok(result.draft.compatibility.unverified.some(text => text.includes('Donor vehicle only, not verified fitment')));
  assert.ok(result.draft.compatibility.unverified.includes('Suitability for UK right-hand drive vehicles not verified'));
  assert.equal(result.draft.compatibility.note, 'Buyer must match the part number before purchase.');
  assert.match(result.draft.description, /Compatibility\n/);
  part.ocr = null;
  part.ai_reads = [];
  const unconfirmed = runChecks(part).draft.compatibility;
  assert.deepEqual(unconfirmed.supported, []);
  assert.ok(unconfirmed.unverified.some(text => /Toyota Land Cruiser.*part number unconfirmed/.test(text)));
  assert.deepEqual(runChecks(seed('MIR-0010')).draft.compatibility.supported, []);
  part.field_sources[PN] = 'OCR + CodeBuddy AI agree (photo 1)';
  part.part_details.part_number.requires_manual_verification = true;
  assert.deepEqual(runChecks(part).draft.compatibility.supported, []);
});

test('checks accept an optional catalogue without changing their record or catalogue inputs', () => {
  const part = seed('MIR-0001');
  const custom = { 'SBM-7940-LC17': { reference_vehicles: [{ make: 'Test', model: 'Mirror vehicle', years: '2016-2021', drive_side: 'RHD' }] } };
  const before = structuredClone({ part, custom });
  assert.match(runChecks(part, custom).draft.compatibility.supported[0], /Test Mirror vehicle/);
  assert.deepEqual({ part, custom }, before);
  assert.deepEqual(runChecks(part, {}).draft.compatibility.supported, []);
  for (const entry of Object.values(map)) {
    assert.equal(entry.source, 'synthetic reference catalogue (test data, not verified)');
    assert.ok(entry.reference_vehicles.length > 0);
    assert.match(entry.reference_vehicles[0].years, /^\d{4}-\d{4}$/);
  }
});

test('actions preserve one per gap, priority order and blocking flags across all seven priorities', () => {
  const part = baseRecord({ storage_location: null, weight_kg: null, packaged_dimensions_cm: null, included_components: null,
    part_details: { part_number: { extracted_value: null } }, notes_ar: 'يمين ٢٠١٥ غريب',
    condition: { state: null, cosmetic_damage: ['connector pins bent'], testing_status: 'Untested' } });
  const result = runChecks(part);
  assert.deepEqual([...new Set(result.actions_required.map(action => action.priority))], [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(result.actions_required.length, result.gaps_and_conflicts.length + 1);
  for (const [index, gap] of result.gaps_and_conflicts.entries()) {
    const action = result.actions_required.find(action => action.field === gap.field && action.action_en === result.questions[index].question_en);
    assert.equal(action.blocking, ['missing', 'conflict'].includes(gap.type));
    arabicOnly(action.action_ar);
  }
  assert.equal(runChecks(seed('MIR-0010')).actions_required[0].priority, 1);
});

test('dated prototype checklist statuses agree with readiness and seller approval remains last', () => {
  assert.equal(checklist.id, 'UAE-UK-MIRRORS-TEST-v1');
  assert.equal(checklist.version, '1.0');
  assert.equal(checklist.dated, '2026-10-27');
  assert.match(checklist.label, /Not legal, customs or tax advice/);
  assert.deepEqual(checklist.items.filter(item => item.status === 'reference').map(item => item.verify_with), ['HM Revenue and Customs', 'UK Trade Tariff']);
  for (const part of seeds) {
    const result = runChecks(part);
    const evaluated = result.corridor.checklist;
    assert.equal(evaluated.items.length, checklist.items.length);
    assert.equal(evaluated.id, checklist.id);
    assert.equal(evaluated.items.find(item => item.id === 'seller_approval').status, 'unknown');
    assert.equal(evaluated.items.find(item => item.id === 'hazard').status, 'unknown');
    for (const item of evaluated.items) {
      assert.ok(['pass', 'fail', 'unknown', 'reference'].includes(item.status));
      if (result.readiness_status === 'ready_for_review' && checklist.items.find(definition => definition.id === item.id).blocking) {
        assert.notEqual(item.status, 'fail', `${part.item_id}:${item.id}`);
      }
    }
  }
  const shipping = runChecks(seed('MIR-0005')).corridor.checklist.items.find(item => item.id === 'shipping');
  assert.equal(shipping.status, 'fail');
});

for (const phrase of ['good condition', 'excellent', 'excellent condition', 'like new', 'perfect', 'mint', 'حالة جيدة', 'حالة ممتازة', 'ممتاز', 'نظيف', 'زي الجديد', 'مثل الجديد']) {
  test(`subjective condition is blocked: ${phrase}`, () => {
    const part = baseRecord({ condition: { test_record: { source: 'synthetic test', result: 'tested' } } });
    const guarded = applyClaimGuard(phrase, part);
    assert.equal(guarded.text, '');
    assert.equal(guarded.blocked.length, 1);
    assert.equal(guarded.blocked[0].reason, reason);
    const result = runChecks({ ...part, original_title_en: phrase });
    assert.equal(result.gaps_and_conflicts.filter(gap => gap.detail === reason).length, 1);
    arabicOnly(result.questions.find(question => question.field === 'original_title_en').question_ar);
  });
}

test('MIR-0007 subjective title and repeated note produce one subjective gap, without editing evidence', () => {
  const part = seed('MIR-0007');
  const before = structuredClone(part);
  const result = runChecks(part);
  const claims = result.gaps_and_conflicts.filter(gap => gap.detail === reason);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].field, 'original_title_ar');
  assert.equal(result.readiness_status, 'information_missing');
  assert.ok(result.questions.some(question => question.field === 'original_title_ar' && /actual damage/.test(question.question_en)));
  assert.deepEqual(part, before);
  part.donor_vehicle.year = 2015;
  part.field_sources['donor_vehicle.year'] = 'seller edit';
  assert.equal(runChecks(part).readiness_status, 'ready_for_review');
});

test('MIR-0004 and MIR-0010 seller correction journeys retain their readiness', () => {
  for (const [id, value, expected] of [['MIR-0004', 'TEST-PJ14', 'ready_for_review'], ['MIR-0010', 'SBM-7946-PX', 'specialist_review_required']]) {
    const part = seed(id);
    part.part_details.part_number.extracted_value = value;
    part.field_sources[PN] = 'seller edit';
    assert.equal(runChecks(part).readiness_status, expected);
  }
});
