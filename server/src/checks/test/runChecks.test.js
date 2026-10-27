import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runChecks } from "../runChecks.js";
import { SELLER_FIXABLE_CONFLICT_FIELDS } from "../conflicts.js";
import { baseRecord } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/checks/test -> repo root -> data/parts.json
const seeds = JSON.parse(
  readFileSync(path.join(__dirname, "..", "..", "..", "..", "data", "parts.json"), "utf8"),
);

const VALID_READINESS = new Set([
  "ready_for_review",
  "information_missing",
  "specialist_review_required",
]);

test("every seed part runs through runChecks and returns all 5 keys with a valid status", () => {
  assert.equal(seeds.length, 10);
  for (const record of seeds) {
    const result = runChecks(record);
    assert.deepEqual(
      Object.keys(result).sort(),
      ["corridor", "draft", "gaps_and_conflicts", "questions", "readiness_status"],
    );
    assert.ok(
      VALID_READINESS.has(result.readiness_status),
      `${record.item_id}: bad status ${result.readiness_status}`,
    );
    assert.ok(Array.isArray(result.gaps_and_conflicts));
    assert.ok(Array.isArray(result.questions));
  }
});

test("runChecks never mutates its input", () => {
  for (const record of seeds) {
    const snapshot = structuredClone(record);
    runChecks(record);
    assert.deepStrictEqual(record, snapshot, `${record.item_id} was mutated`);
  }
});

const seed = (id) => seeds.find((r) => r.item_id === id);
const PN_FIELD = "part_details.part_number.extracted_value";

test("all 10 seed records in data/parts.json reach the expected readiness for the expected reason", () => {
  const results = Object.fromEntries(seeds.map((record) => [record.item_id, runChecks(record)]));
  const has = (id, field, type, detail) =>
    results[id].gaps_and_conflicts.some(
      (g) => g.field === field && g.type === type && (detail === undefined || detail.test(g.detail)),
    );

  for (const id of ["MIR-0001", "MIR-0002", "MIR-0003"]) {
    assert.equal(results[id].readiness_status, "ready_for_review", id);
    assert.ok(!results[id].gaps_and_conflicts.some((g) => g.type === "missing" || g.type === "conflict"), id);
    assert.deepEqual(results[id].draft.blocked_claims, [], id);
  }
  for (const id of ["MIR-0004", "MIR-0005"]) {
    assert.equal(results[id].readiness_status, "information_missing", id);
    assert.ok(has(id, PN_FIELD, "missing", /^OCR Unclear, seller to type value$|^Neither OCR nor CodeBuddy AI/), id);
  }
  assert.equal(results["MIR-0006"].readiness_status, "information_missing");
  assert.ok(has("MIR-0006", "part_details.colour_code", "missing"));

  assert.equal(results["MIR-0007"].readiness_status, "information_missing");
  assert.ok(has("MIR-0007", "donor_vehicle.year", "conflict"));
  assert.ok(SELLER_FIXABLE_CONFLICT_FIELDS.has("donor_vehicle.year"));

  assert.equal(results["MIR-0008"].readiness_status, "information_missing");
  assert.ok(has("MIR-0008", "part_details.placement", "missing"));

  assert.equal(results["MIR-0009"].readiness_status, "specialist_review_required");
  assert.ok(has("MIR-0009", "condition.testing_status", "conflict", /wires?/));

  assert.equal(results["MIR-0010"].readiness_status, "specialist_review_required");
  assert.ok(has("MIR-0010", PN_FIELD, "conflict", /SBM-7946-PF.*SBM-7946-PX/));
});

test("MIR-0007: donor year conflict is seller-fixable (information_missing)", () => {
  const result = runChecks(seed("MIR-0007"));
  const gap = result.gaps_and_conflicts.find((g) => g.field === "donor_vehicle.year");
  assert.ok(gap);
  assert.equal(gap.type, "conflict");
  assert.equal(result.readiness_status, "information_missing");
});

test("MIR-0010 gets the record-versus-label conflict with both values", () => {
  const result = runChecks(seed("MIR-0010"));
  const gap = result.gaps_and_conflicts.find((g) => g.field === PN_FIELD && g.type === "conflict");
  assert.ok(gap);
  assert.equal(
    gap.detail,
    "record says SBM-7946-PF; label read as SBM-7946-PX by OCR and CodeBuddy AI. Please check the stamp on the part.",
  );
  assert.ok(result.questions.some((q) => q.field === PN_FIELD && q.question_en.includes("SBM-7946-PX")));
  assert.equal(result.draft.item_specifics["Manufacturer Part Number"], undefined);
});

test("MIR-0004 and MIR-0005 get the OCR Unclear gap", () => {
  for (const id of ["MIR-0004", "MIR-0005"]) {
    const gaps = runChecks(seed(id)).gaps_and_conflicts.filter((g) => g.field === PN_FIELD);
    assert.equal(gaps.length, 1, id);
    assert.equal(gaps[0].type, "missing", id);
    assert.equal(gaps[0].detail, "OCR Unclear, seller to type value", id);
  }
});

test("MIR-0006 gets the colour code gap and no other parts do", () => {
  for (const record of seeds) {
    const has = runChecks(record).gaps_and_conflicts.some(
      (g) => g.field === "part_details.colour_code" && g.type === "missing",
    );
    assert.equal(has, record.item_id === "MIR-0006", record.item_id);
  }
});

test("no seed has a missing gap on notes_ar; unknown words never block", () => {
  for (const record of seeds) {
    const gaps = runChecks(record).gaps_and_conflicts.filter((g) => g.field === "notes_ar");
    assert.ok(gaps.every((g) => g.type === "cannot_claim"), record.item_id);
  }
});

test("the word OEM never appears in any draft", () => {
  const risky = baseRecord({
    original_title_en: "OEM Toyota mirror, OEM part number SBM-0001-T17",
    original_title_ar: "مرآة وكالة",
    part_details: { features: ["OEM"] },
    ocr: [{ unclear: false, part_number_candidate: "SBM-0001-T17" }],
  });
  for (const record of [...seeds, risky]) {
    const { draft } = runChecks(record);
    const shown = JSON.stringify({ title: draft.title, description: draft.description, item_specifics: draft.item_specifics });
    assert.doesNotMatch(shown, /OEM|وكالة/i, record.item_id);
  }
  assert.equal(runChecks(risky).draft.item_specifics["Manufacturer Part Number"], "SBM-0001-T17");
});

test("MIR-0009 and MIR-0010 stay specialist_review_required (electrical damage)", () => {
  for (const id of ["MIR-0009", "MIR-0010"]) {
    const record = seeds.find((r) => r.item_id === id);
    const result = runChecks(record);
    assert.equal(result.readiness_status, "specialist_review_required", id);
    const gap = result.gaps_and_conflicts.find((g) => g.field === "condition.testing_status");
    assert.ok(gap, `${id} should flag the electrics`);
    assert.equal(gap.type, "conflict");
    assert.match(gap.detail, /specialist review required/);
  }
});

test("MIR-0009 and MIR-0010 gaps and questions show plain electrical findings without regex syntax", () => {
  for (const [id, label] of [["MIR-0009", "wires cut"], ["MIR-0010", "connector pins bent"]]) {
    const result = runChecks(seed(id));
    const gap = result.gaps_and_conflicts.find((g) => g.field === "condition.testing_status");
    assert.ok(gap.detail.includes(`found: ${label}`), id);
    assert.ok(result.questions.some((q) => q.field === gap.field && q.question_en.includes(label)), id);
    for (const text of [
      ...result.gaps_and_conflicts.map((g) => g.detail),
      ...result.questions.flatMap((q) => [q.question_en, q.question_ar]),
    ]) {
      assert.equal(text.includes("\\"), false, `${id}: ${text}`);
      assert.doesNotMatch(text, /\(\?:|[|\[\]{}^$*+]/u, id);
    }
  }
});

test("risky title phrases produce one gap and question each with the specific guard reason", () => {
  const result = runChecks(baseRecord({ original_title_en: "OEM genuine tested working fits all" }));
  const gaps = result.gaps_and_conflicts.filter((gap) => gap.type === "cannot_claim");
  const reasons = {
    oem: "authenticity is never certified",
    genuine: "authenticity is never certified",
    "tested working": "no test record",
    "fits all": "compatibility is not guaranteed",
  };
  assert.equal(gaps.length, 4);
  assert.equal(result.questions.length, 4);
  assert.equal(result.draft.blocked_claims.length, 4);
  for (const [phrase, reason] of Object.entries(reasons)) {
    const matching = gaps.filter((gap) => gap.field === "original_title_en" && gap.detail.includes(`"${phrase}"`));
    assert.equal(matching.length, 1, phrase);
    assert.equal(matching[0].detail, `Cannot claim "${phrase}": ${reason}`);
    assert.ok(result.questions.some((q) => q.field === "original_title_en" && q.question_en.includes(`"${phrase}": ${reason}`)));
  }
});

test("repeated title claims stay unique per phrase and field, and separate fields retain their own gaps", () => {
  const result = runChecks(baseRecord({
    original_title_en: "OEM genuine OEM GENUINE",
    original_title_ar: "OEM",
    part_details: { features: ["poems"] },
  }));
  const claims = result.gaps_and_conflicts.filter((gap) => gap.type === "cannot_claim");
  assert.equal(claims.filter((gap) => gap.field === "original_title_en").length, 2);
  assert.equal(claims.filter((gap) => gap.field === "original_title_ar").length, 1);
  assert.equal(claims.length, 3);
  assert.ok(claims.every((gap) => gap.detail.endsWith("authenticity is never certified")));
  assert.ok(!claims.some((gap) => gap.sources.includes("part_details.features.0")));
});

function demoCase() {
  return baseRecord({
    part_details: { part_number: { extracted_value: null, extraction_method: "none", requires_manual_verification: true } },
    ocr: [{ text: "MIRR0R SBM-?OO1-T17 2O17", confidence: 40, unclear: true, part_number_candidate: null }],
    notes_ar: "٢٠١٥",
  });
}

test("demo difficult case: unclear OCR + year conflict is information_missing", () => {
  const result = runChecks(demoCase());
  assert.equal(result.readiness_status, "information_missing");
  assert.ok(result.gaps_and_conflicts.some((g) => g.field === "donor_vehicle.year" && g.type === "conflict"));
  assert.ok(
    result.gaps_and_conflicts.some((g) => g.detail === "OCR Unclear, seller to type value"),
  );
});

test("after a simulated seller edit the demo case becomes ready_for_review", () => {
  const record = demoCase();

  // Seller fixes the year and types the part number, exactly as the server
  // records it (field_sources "seller edit", history by "seller").
  const edited = structuredClone(record);
  edited.donor_vehicle.year = 2015;
  edited.part_details.part_number.extracted_value = "SBM-0001-T17";
  edited.history.push(
    { at: "2026-10-23T08:00:00.000Z", field: "donor_vehicle.year", old: 2017, new: 2015, by: "seller" },
    { at: "2026-10-23T08:02:00.000Z", field: "part_details.part_number.extracted_value", old: null, new: "SBM-0001-T17", by: "seller" },
  );
  edited.field_sources = {
    "donor_vehicle.year": "seller edit",
    "part_details.part_number.extracted_value": "seller edit",
  };
  const snapshot = structuredClone(edited);

  const result = runChecks(edited);
  assert.equal(result.readiness_status, "ready_for_review");
  assert.deepEqual(result.gaps_and_conflicts, []);
  assert.deepEqual(result.questions, []);
  assert.deepStrictEqual(edited, snapshot); // runChecks did not mutate the edited record
});

test("unknown Arabic words surface as a cannot_claim item and a question", () => {
  const result = runChecks(seed("MIR-0007"));
  const gap = result.gaps_and_conflicts.find((g) => g.field === "notes_ar");
  assert.ok(gap);
  assert.equal(gap.type, "cannot_claim");
  const q = result.questions.find((x) => x.field === "notes_ar");
  assert.ok(q);
  assert.match(q.question_en, /اكاديمي/);
  assert.match(q.question_ar, /اكاديمي/);
});

test("a clean record is ready_for_review and cannot_claim alone never changes readiness", () => {
  const clean = baseRecord({ notes_ar: "يمين ٢٠١٧" }); // all words known, values agree
  assert.equal(runChecks(clean).readiness_status, "ready_for_review");

  const riskyTitle = baseRecord({
    notes_ar: "يمين ٢٠١٧",
    original_title_en: "Genuine Toyota Land Cruiser Mirror",
  });
  const result = runChecks(riskyTitle);
  assert.ok(result.gaps_and_conflicts.some((g) => g.type === "cannot_claim"));
  assert.equal(result.readiness_status, "ready_for_review");
  assert.ok(result.questions.some((q) => q.field === "original_title_en"));
});

test("real seed journey: MIR-0007 becomes ready_for_review once the seller sets the year", () => {
  const record = structuredClone(seed('MIR-0007'));
  const oldYear = record.donor_vehicle.year;
  record.donor_vehicle.year = 2015;
  record.field_sources['donor_vehicle.year'] = 'seller edit';
  record.history.push({ at: '2026-10-27T12:00:00.000Z', field: 'donor_vehicle.year', old: oldYear, new: 2015, by: 'seller' });
  const result = runChecks(record);
  const blocking = result.gaps_and_conflicts.filter(gap => gap.type === 'missing' || gap.type === 'conflict');
  assert.ok(
    result.readiness_status === 'ready_for_review' ||
      (result.readiness_status === 'information_missing' && blocking.every(gap => gap.field !== 'donor_vehicle.year')),
    result.readiness_status,
  );
  assert.equal(result.readiness_status, 'ready_for_review'); // today nothing else blocks MIR-0007
  assert.ok(!result.gaps_and_conflicts.some(gap => gap.field === 'donor_vehicle.year'));
  assert.ok(!blocking.some(gap => gap.field === 'notes_ar'), 'no notes_ar gap blocks it');
  assert.ok(result.gaps_and_conflicts.some(gap => gap.field === 'notes_ar' && gap.type === 'cannot_claim'));
});

// ---- Demo journeys ----------------------------------------------------------

test("demo success: MIR-0001 is ready_for_review with no blocked claims", () => {
  const result = runChecks(seed('MIR-0001'));
  assert.equal(result.readiness_status, 'ready_for_review');
  assert.deepEqual(result.draft.blocked_claims, []);
  assert.equal(result.draft.item_specifics['Manufacturer Part Number'], 'SBM-7940-LC17');
});

test("demo difficult: unreadable label, then the seller types the part number", () => {
  const record = structuredClone(seed('MIR-0001'));
  const photo = '/demo/labels/MIR-0001.png';
  record.part_details.part_number = { extracted_value: null, extraction_method: 'none', requires_manual_verification: true };
  delete record.field_sources[PN_FIELD];
  record.ocr = [
    ...record.ocr,
    { engine: 'tesseract.js (local)', photo, text: 'na\n', confidence: 27, unclear: true, quality: { sharpness: 40, blurry: true }, part_number_candidate: null, read_at: '2026-10-27T17:00:00.000Z' },
  ];
  record.ai_reads = [
    ...record.ai_reads,
    { engine: 'CodeBuddy AI', mode: 'live', photo, result: { part_number: null, visible_text: '', damage_notes: [], readable: false }, agreement: 'neither', read_at: '2026-10-27T17:00:05.000Z' },
  ];
  const before = runChecks(record);
  assert.equal(before.readiness_status, 'information_missing');
  const pnGaps = before.gaps_and_conflicts.filter(gap => gap.field === PN_FIELD);
  assert.equal(pnGaps.length, 1, 'OCR Unclear and neither give one gap, not two');
  assert.equal(before.draft.item_specifics['Manufacturer Part Number'], undefined);

  record.part_details.part_number.extracted_value = 'SBM-7940-LC17';
  record.field_sources[PN_FIELD] = 'seller edit';
  record.history.push({ at: '2026-10-27T17:05:00.000Z', field: PN_FIELD, old: null, new: 'SBM-7940-LC17', by: 'seller' });
  const after = runChecks(record);
  assert.equal(after.readiness_status, 'ready_for_review');
  assert.ok(!after.gaps_and_conflicts.some(gap => gap.field === PN_FIELD));
});

test("demo AI catch: MIR-0010 shows both values and asks in English and Arabic", () => {
  const result = runChecks(seed('MIR-0010'));
  const index = result.gaps_and_conflicts.findIndex(gap => gap.field === PN_FIELD && gap.type === 'conflict');
  assert.ok(index >= 0);
  const question = result.questions[index];
  for (const text of [question.question_en, question.question_ar]) {
    assert.match(text, /SBM-7946-PF/);
    assert.match(text, /SBM-7946-PX/);
  }
  assert.match(question.question_ar, /الرقم المختوم/);
});

test("real seed journey: MIR-0004 clears the OCR Unclear gap once the seller types the number", () => {
  const record = structuredClone(seed('MIR-0004'));
  record.part_details.part_number.extracted_value = 'SBM-7941-PJ14';
  record.field_sources[PN_FIELD] = 'seller edit';
  record.history.push({ at: '2026-10-27T12:00:00.000Z', field: PN_FIELD, old: null, new: 'SBM-7941-PJ14', by: 'seller' });
  const result = runChecks(record);
  assert.ok(!result.gaps_and_conflicts.some(gap => gap.field === PN_FIELD));
  assert.equal(result.readiness_status, 'ready_for_review');
});

test("draft and corridor contain real listing and guidance outputs", () => {
  const result = runChecks(seeds[0]);
  assert.ok(result.draft.title.includes('Wing Mirror'));
  assert.ok(result.draft.description.includes('Fragile, glass'));
  assert.equal(result.corridor.packing_alert.label, 'guidance, verify');
});
