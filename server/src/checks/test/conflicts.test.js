import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConflicts } from "../conflicts.js";
import { baseRecord, gapWhere } from "./helpers.js";

test("year conflict fires when two sources disagree", () => {
  const record = baseRecord({ notes_ar: "٢٠١٧" });
  const gaps = analyzeConflicts(record);
  const gap = gapWhere(gaps, "year", "conflict");
  assert.ok(gap, "expected a year conflict");
  assert.match(gap.detail, /spreadsheet says 2015/);
  assert.match(gap.detail, /Arabic note says 2017/);
  assert.ok(gap.sources.includes("spreadsheet"));
  assert.ok(gap.sources.includes("Arabic note"));
});

test("year conflict also fires between spreadsheet and OCR", () => {
  const record = baseRecord({
    ocr: { text: "TOYOTA COROLLA 12345-AB678 2013", confidence: 0.9, unclear: false, quality: "good" },
  });
  const gap = gapWhere(analyzeConflicts(record), "year", "conflict");
  assert.ok(gap);
  assert.match(gap.detail, /OCR says 2013/);
});

test("side conflict fires when spreadsheet and Arabic note disagree", () => {
  const record = baseRecord({ part_details: { side: "right" }, notes_ar: "يسار" });
  const gap = gapWhere(analyzeConflicts(record), "side", "conflict");
  assert.ok(gap, "expected a side conflict");
  assert.match(gap.detail, /spreadsheet says right/);
  assert.match(gap.detail, /Arabic note says left/);
});

test("driver/passenger-only side raises the LHD/RHD ambiguity conflict", () => {
  const record = baseRecord({ part_details: { side: "driver" } });
  const gap = gapWhere(analyzeConflicts(record), "side", "conflict");
  assert.ok(gap);
  assert.match(gap.detail, /driver side means left on a UAE left-hand drive donor but right in the UK/);
});

test("missing side raises a missing gap", () => {
  const record = baseRecord({ part_details: { side: "" } });
  const gap = gapWhere(analyzeConflicts(record), "side", "missing");
  assert.ok(gap);
});

test("part number conflict fires when OCR candidates do not match", () => {
  const record = baseRecord({
    ocr: { text: "TOYOTA COROLLA 67890-ZZ123 2015", confidence: 0.9, unclear: false, quality: "good" },
  });
  const gap = gapWhere(analyzeConflicts(record), "part_number", "conflict");
  assert.ok(gap);
  assert.match(gap.detail, /spreadsheet says 12345-AB678/);
  assert.match(gap.detail, /67890-ZZ123/);
});

test("part number conflict ignores dashes, spaces and case", () => {
  const record = baseRecord({
    ocr: { text: "TOYOTA COROLLA 12345 ab 678 2015", confidence: 0.9, unclear: false, quality: "good" },
  });
  const gaps = analyzeConflicts(record);
  assert.ok(!gapWhere(gaps, "part_number", "conflict"), "spaces should not create a conflict");
});

test("OCR unclear raises a missing part number gap with the exact detail", () => {
  const record = baseRecord({
    ocr: { text: "TOYOTA COROLLA 12345-AB678 2015", confidence: 0.4, unclear: true, quality: "poor" },
  });
  const gap = gapWhere(analyzeConflicts(record), "part_number", "missing");
  assert.ok(gap);
  assert.equal(gap.detail, "OCR Unclear, seller to type value");
});

test("required fields raise missing gaps when absent", () => {
  const record = baseRecord({
    condition: "",
    part_details: { part_number: "", side: "", make: "", model: "", year: "" },
    photos: [],
  });
  const gaps = analyzeConflicts(record);
  for (const field of ["part_number", "side", "condition", "make", "model", "year", "photos"]) {
    assert.ok(gapWhere(gaps, field, "missing"), `${field} should be missing`);
  }
});

test("unknown Arabic words become one missing gap on notes_ar", () => {
  const record = baseRecord({ notes_ar: "مرايا يمين" });
  const gap = gapWhere(analyzeConflicts(record), "notes_ar", "missing");
  assert.ok(gap);
  assert.match(gap.detail, /مرايا/);
});

test("risky claim words become cannot_claim gaps", () => {
  const record = baseRecord({ original_title_en: "Genuine Tested Working Toyota Mirror" });
  const gaps = analyzeConflicts(record);
  const claims = gaps.filter((g) => g.type === "cannot_claim");
  assert.equal(claims.length, 2); // "tested working" swallows "working"
  assert.ok(claims.every((g) => g.field === "title"));
  assert.match(claims[0].detail, /genuine|tested working/);
});

test("seller field_sources value wins and suppresses conflicts", () => {
  const record = baseRecord({ notes_ar: "٢٠١٧", field_sources: { "part_details.year": "seller" } });
  const gaps = analyzeConflicts(record);
  assert.ok(!gapWhere(gaps, "year", "conflict"));
  assert.ok(!gapWhere(gaps, "year", "missing"));
});

test("latest seller history entry wins and suppresses conflicts", () => {
  const record = baseRecord({
    part_details: { side: "right" },
    notes_ar: "يسار",
    history: [{ at: "2026-10-21T09:00:00.000Z", field: "part_details.side", old: "right", new: "left", by: "seller" }],
  });
  assert.ok(!gapWhere(analyzeConflicts(record), "side", "conflict"));
});

test("a later staff edit after a seller edit re-enables checking", () => {
  const record = baseRecord({
    notes_ar: "٢٠١٧",
    history: [
      { at: "2026-10-21T09:00:00.000Z", field: "part_details.year", old: 2015, new: 2017, by: "seller" },
      { at: "2026-10-22T09:00:00.000Z", field: "part_details.year", old: 2017, new: 2015, by: "staff" },
    ],
  });
  assert.ok(gapWhere(analyzeConflicts(record), "year", "conflict"));
});

test("a seller-typed part number clears the OCR unclear gap", () => {
  const record = baseRecord({
    ocr: { text: "TOYOTA COROLLA ???? 2015", confidence: 0.3, unclear: true, quality: "poor" },
    field_sources: { "part_details.part_number": "seller" },
  });
  const gaps = analyzeConflicts(record);
  assert.ok(!gapWhere(gaps, "part_number", "missing"));
  assert.ok(!gapWhere(gaps, "part_number", "conflict"));
});

test("donor_vehicle is never used to fill missing part_details values", () => {
  const record = baseRecord({
    part_details: { part_number: "", side: "", year: "" },
    donor_vehicle: { make: "Toyota", model: "Corolla", year: 2015, drive_side: "left" },
  });
  const gaps = analyzeConflicts(record);
  for (const field of ["part_number", "side", "year"]) {
    assert.ok(gapWhere(gaps, field, "missing"), `${field} must stay missing despite donor_vehicle`);
  }
});

test("analyzeConflicts never mutates the record", () => {
  const record = baseRecord({ notes_ar: "٢٠١٧ يمين مرايا" });
  const snapshot = structuredClone(record);
  analyzeConflicts(record);
  assert.deepStrictEqual(record, snapshot);
});
