import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { questionsFor } from "../questions.js";
import { analyzeConflicts } from "../conflicts.js";
import { runChecks } from "../runChecks.js";
import { baseRecord } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seeds = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "..", "..", "data", "parts.json"), "utf8"));

const PHOTO = "/demo/labels/TEST-001.png";
const NO_PN = { part_number: { extracted_value: null, extraction_method: "none", requires_manual_verification: true } };
const aiRead = (agreement, part_number, damage_notes = []) =>
  ({ photo: PHOTO, result: { part_number, visible_text: "", damage_notes, readable: true }, agreement });
const ocr = (candidate, unclear = false) => [{ photo: PHOTO, unclear, part_number_candidate: candidate, text: "" }];

// Hand-made records that between them raise every kind of gap checks can produce.
const everyGapKind = [
  baseRecord({ notes_ar: "٢٠١٥ زرنيخ اللون غير مؤكد", original_title_en: "Genuine OEM mirror", original_title_ar: "مرآة اصلية" }),
  baseRecord({ part_details: { placement: "Right" }, notes_ar: "يسار" }),
  baseRecord({ part_details: { placement: "Driver" } }),
  baseRecord({ part_details: { ...NO_PN, placement: "" }, condition: { state: "", cosmetic_damage: [], testing_status: "" }, donor_vehicle: { make: "", model: "", year: "" }, photos: [] }),
  baseRecord({ part_details: { part_number: { extracted_value: "SBM-0002-T18", extraction_method: "OCR photo", requires_manual_verification: true } } }),
  baseRecord({ ocr: ocr("SBM-0001-T99") }),
  baseRecord({ ocr: ocr("SBM-0001-T17"), ai_reads: [aiRead("disagree", "SBM-0001-T71", ["crack in lower glass corner"])] }),
  baseRecord({ part_details: NO_PN, ocr: ocr(null, true), ai_reads: [aiRead("ai_only", "SBM-0005-XY")] }),
  baseRecord({ part_details: NO_PN, ai_reads: [aiRead("neither", null)] }),
  baseRecord({ part_details: NO_PN, ocr: ocr("SBM-0003-AB") }),
  baseRecord({ condition: { state: "Used", cosmetic_damage: ["two wires cut at connector"], testing_status: "Untested" } }),
  baseRecord({ condition: { state: "Used", cosmetic_damage: [], testing_status: "Untested" } }),
];

const isGeneric = (q) => /please check [\w.]+ \(/.test(q.question_en) || q.question_ar.includes("يرجى مراجعة بيانات هذه القطعة");

test("no seed record question falls back to the generic template", () => {
  for (const record of seeds) {
    for (const q of runChecks(record).questions) {
      assert.ok(!isGeneric(q), `${record.item_id} ${q.field}: ${q.question_en}`);
    }
  }
});

test("every gap kind has its own question template, none generic", () => {
  const kinds = new Set();
  for (const record of everyGapKind) {
    const result = runChecks(record);
    result.gaps_and_conflicts.forEach((g, i) => {
      kinds.add(`${g.type}:${g.field}`);
      assert.ok(!isGeneric(result.questions[i]), `${g.type}:${g.field} (${g.detail})`);
    });
  }
  for (const kind of [
    "cannot_claim:notes_ar", "missing:part_details.colour_code", "conflict:part_details.part_number.extracted_value",
    "missing:part_details.part_number.extracted_value", "cannot_claim:condition", "cannot_claim:draft",
    "cannot_claim:original_title_en", "cannot_claim:original_title_ar", "conflict:donor_vehicle.year",
    "conflict:part_details.placement", "conflict:condition.testing_status", "missing:photos",
  ]) {
    assert.ok(kinds.has(kind), `fixture should cover ${kind}`);
  }
});

// Latin is allowed in question_ar only inside codes such as MIR-0001 or
// SBM-7946-PX (letters, digits and dashes with at least one digit).
function latinWordsOutsideCodes(text) {
  return (text.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) || [])
    .filter((token) => /[A-Za-z]/.test(token))
    .filter((token) => !(/\d/.test(token) && token.includes("-")));
}

test("question_ar has no English: only Arabic plus values, for seeds and every gap kind", () => {
  for (const record of [...seeds, ...everyGapKind]) {
    for (const q of runChecks(record).questions) {
      assert.deepEqual(latinWordsOutsideCodes(q.question_ar), [], `${record.item_id} ${q.field}: ${q.question_ar}`);
    }
  }
});

test("Arabic questions carry the values: years, part numbers and sides in Arabic", () => {
  const year = runChecks(baseRecord({ notes_ar: "٢٠١٥" })).questions.find((q) => q.field === "donor_vehicle.year");
  assert.match(year.question_ar, /2017/);
  assert.match(year.question_ar, /2015/);
  const side = runChecks(baseRecord({ part_details: { placement: "Right" }, notes_ar: "يسار" }))
    .questions.find((q) => q.field === "part_details.placement");
  assert.match(side.question_ar, /يمين، يسار/);
});

test("one question per gap, each with field, question_en and question_ar", () => {
  const record = baseRecord({ notes_ar: "٢٠١٥ برادو", part_details: { placement: null } });
  const gaps = analyzeConflicts(record);
  const questions = questionsFor(gaps, record);
  assert.equal(questions.length, gaps.length);
  for (const q of questions) {
    assert.equal(typeof q.field, "string");
    assert.ok(q.question_en.length > 0);
    assert.ok(q.question_ar.length > 0);
  }
});

test("questions name the item", () => {
  const record = baseRecord({ part_details: { placement: null } });
  const gaps = analyzeConflicts(record);
  for (const q of questionsFor(gaps, record)) {
    assert.ok(q.question_en.includes("TEST-001"));
    assert.ok(q.question_ar.includes("TEST-001"));
  }
});

test("conflict questions quote the conflicting values", () => {
  const record = baseRecord({ notes_ar: "٢٠١٥" });
  const gaps = analyzeConflicts(record);
  const q = questionsFor(gaps, record).find((x) => x.field === "donor_vehicle.year");
  assert.ok(q);
  assert.match(q.question_en, /2017/);
  assert.match(q.question_en, /2015/);
});

test("unknown Arabic words get one bilingual question listing them, never a missing gap", () => {
  const record = baseRecord({ notes_ar: "زرنيخ قنفذ برادو" });
  const gaps = analyzeConflicts(record);
  assert.ok(gaps.some((g) => g.type === "cannot_claim" && g.field === "notes_ar"));
  assert.ok(!gaps.some((g) => g.type === "missing" && g.field === "notes_ar"));
  const qs = questionsFor(gaps, record).filter((x) => x.field === "notes_ar");
  assert.equal(qs.length, 1);
  for (const text of [qs[0].question_en, qs[0].question_ar]) {
    assert.match(text, /زرنيخ/);
    assert.match(text, /قنفذ/);
    assert.doesNotMatch(text, /برادو/, "known donor words are not asked about");
  }
  assert.match(qs[0].question_en, /explain what they mean/);
});

test("the driver-side question explains the UAE/UK difference in Arabic", () => {
  const record = baseRecord({ part_details: { placement: "Driver" } });
  const gaps = analyzeConflicts(record);
  const q = questionsFor(gaps, record).find((x) => x.field === "part_details.placement");
  assert.ok(q);
  assert.match(q.question_ar, /يمين أم يسار/);
  assert.match(q.question_en, /left or right/);
});

test("OCR unclear question asks the seller to type the part number", () => {
  const record = baseRecord({
    part_details: { part_number: { extracted_value: null, extraction_method: "none", requires_manual_verification: true } },
    ocr: [{ text: "MIRROR ????", confidence: 30, unclear: true, part_number_candidate: null }],
  });
  const gaps = analyzeConflicts(record);
  const q = questionsFor(gaps, record).find((x) => x.field === "part_details.part_number.extracted_value");
  assert.ok(q);
  assert.match(q.question_en, /OCR Unclear, seller to type value/);
});

test("cannot_claim title questions mention the risky word", () => {
  const record = baseRecord({ original_title_en: "Genuine Toyota Mirror" });
  const gaps = analyzeConflicts(record);
  const q = questionsFor(gaps, record).find((x) => x.field === "original_title_en");
  assert.ok(q);
  assert.match(q.question_en, /genuine/);
  assert.match(q.question_ar, /هل يمكنك تأكيد ذلك/);
});

test("the electrics question asks for a specialist test in both languages", () => {
  const record = baseRecord({
    condition: { state: "Used", cosmetic_damage: ["two wires cut at connector"], testing_status: "Untested" },
  });
  const gaps = analyzeConflicts(record);
  const q = questionsFor(gaps, record).find((x) => x.field === "condition.testing_status");
  assert.ok(q);
  assert.match(q.question_en, /specialist test it/);
  assert.match(q.question_ar, /أخصائي فحصها/);
});

test("unknown gap shape still gets a polite default question", () => {
  const record = baseRecord({});
  const questions = questionsFor(
    [{ field: "part_details.brand", type: "missing", detail: "brand is missing", sources: ["spreadsheet row 3"] }],
    record,
  );
  assert.equal(questions.length, 1);
  assert.match(questions[0].question_en, /part_details\.brand/);
});

test("questionsFor never mutates the gaps or the record", () => {
  const record = baseRecord({ part_details: { placement: null } });
  const gaps = analyzeConflicts(record);
  const recordSnapshot = structuredClone(record);
  const gapsSnapshot = structuredClone(gaps);
  questionsFor(gaps, record);
  assert.deepStrictEqual(record, recordSnapshot);
  assert.deepStrictEqual(gaps, gapsSnapshot);
});
