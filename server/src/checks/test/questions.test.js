import { test } from "node:test";
import assert from "node:assert/strict";
import { questionsFor } from "../questions.js";
import { analyzeConflicts } from "../conflicts.js";
import { baseRecord } from "./helpers.js";

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

test("an unknown Arabic word appears in the question, never as an attribute", () => {
  const record = baseRecord({ notes_ar: "برادو" });
  const gaps = analyzeConflicts(record);
  assert.ok(gaps.some((g) => g.type === "missing" && g.field === "notes_ar"));
  const q = questionsFor(gaps, record).find((x) => x.field === "notes_ar");
  assert.ok(q);
  assert.match(q.question_en, /برادو/);
  assert.match(q.question_ar, /برادو/);
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
    ocr: { text: "MIRROR ???? 2017", confidence: 0.3, unclear: true, quality: "poor" },
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
