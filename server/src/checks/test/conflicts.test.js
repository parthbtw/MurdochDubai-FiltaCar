import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConflicts } from "../conflicts.js";
import { baseRecord, gapWhere } from "./helpers.js";

const PN_FIELD = "part_details.part_number.extracted_value";

test("year conflict on donor_vehicle.year fires when two sources disagree", () => {
  const record = baseRecord({ notes_ar: "٢٠١٥" });
  const gaps = analyzeConflicts(record);
  const gap = gapWhere(gaps, "donor_vehicle.year", "conflict");
  assert.ok(gap, "expected a year conflict");
  assert.match(gap.detail, /says 2017/);
  assert.match(gap.detail, /Arabic yard note says 2015/);
  assert.ok(gap.sources.includes("Arabic yard note"));
});

test("year conflict also fires between spreadsheet and OCR", () => {
  const record = baseRecord({
    ocr: { text: "TOYOTA LAND CRUISER SBM-0001-T17 2013", confidence: 0.9, unclear: false, quality: "good" },
  });
  const gap = gapWhere(analyzeConflicts(record), "donor_vehicle.year", "conflict");
  assert.ok(gap);
  assert.match(gap.detail, /OCR says 2013/);
});

test("side conflict fires when placement and Arabic note disagree", () => {
  const record = baseRecord({ part_details: { placement: "Right" }, notes_ar: "يسار" });
  const gap = gapWhere(analyzeConflicts(record), "part_details.placement", "conflict");
  assert.ok(gap, "expected a side conflict");
  assert.match(gap.detail, /says right/);
  assert.match(gap.detail, /Arabic yard note says left/);
});

test("driver/passenger-only placement raises the LHD/RHD ambiguity conflict", () => {
  const record = baseRecord({ part_details: { placement: "Driver" } });
  const gap = gapWhere(analyzeConflicts(record), "part_details.placement", "conflict");
  assert.ok(gap);
  assert.match(gap.detail, /driver side means left on a UAE left-hand drive donor but right in the UK/);
});

test("missing placement raises a missing gap", () => {
  const record = baseRecord({ part_details: { placement: null } });
  assert.ok(gapWhere(analyzeConflicts(record), "part_details.placement", "missing"));
});

test("part number conflict fires when OCR candidates do not match", () => {
  const record = baseRecord({
    ocr: { text: "MIRROR SBM-9999-ZZZ 2017", confidence: 0.9, unclear: false, quality: "good" },
  });
  const gap = gapWhere(analyzeConflicts(record), PN_FIELD, "conflict");
  assert.ok(gap);
  assert.match(gap.detail, /SBM-0001-T17/);
  assert.match(gap.detail, /SBM-9999-ZZZ/);
});

test("part number comparison ignores dashes, spaces and case", () => {
  const record = baseRecord({
    ocr: { text: "MIRROR sbm 0001 t17 2017", confidence: 0.9, unclear: false, quality: "good" },
  });
  // "sbm 0001 t17" splits into short tokens, so no false conflict is expected.
  assert.ok(!gapWhere(analyzeConflicts(record), PN_FIELD, "conflict"));
});

test("OCR unclear raises a missing part number gap with the exact detail", () => {
  const record = baseRecord({
    ocr: { text: "MIRROR SBM-0001-T17 2017", confidence: 0.4, unclear: true, quality: "poor" },
  });
  const gap = gapWhere(analyzeConflicts(record), PN_FIELD, "missing");
  assert.ok(gap);
  assert.equal(gap.detail, "OCR Unclear, seller to type value");
});

test("a part number flagged requires_manual_verification raises a conflict", () => {
  const record = baseRecord({
    part_details: {
      part_number: {
        extracted_value: "SBM-0002-T18",
        extraction_method: "OCR photo",
        requires_manual_verification: true,
      },
    },
  });
  const gap = gapWhere(analyzeConflicts(record), PN_FIELD, "conflict");
  assert.ok(gap);
  assert.match(gap.detail, /manual verification/);
});

test("required fields raise missing gaps when absent", () => {
  const record = baseRecord({
    part_details: { part_number: { extracted_value: null, extraction_method: "none", requires_manual_verification: true }, placement: "" },
    condition: { state: "", cosmetic_damage: [], testing_status: "" },
    donor_vehicle: { make: "", model: "", year: "" },
    photos: [],
  });
  const gaps = analyzeConflicts(record);
  for (const field of [
    PN_FIELD,
    "part_details.placement",
    "condition.state",
    "condition.testing_status",
    "donor_vehicle.make",
    "donor_vehicle.model",
    "donor_vehicle.year",
    "photos",
  ]) {
    assert.ok(gapWhere(gaps, field, "missing"), `${field} should be missing`);
  }
});

test("unknown Arabic words become one missing gap on notes_ar", () => {
  const record = baseRecord({ notes_ar: "برادو يمين" });
  const gap = gapWhere(analyzeConflicts(record), "notes_ar", "missing");
  assert.ok(gap);
  assert.match(gap.detail, /برادو/);
});

test("risky claim words become cannot_claim gaps on the title fields", () => {
  const record = baseRecord({
    original_title_en: "Genuine Tested Working Toyota Mirror",
    original_title_ar: "مرآة اصلية",
  });
  const gaps = analyzeConflicts(record);
  const claims = gaps.filter((g) => g.type === "cannot_claim");
  // "tested working" swallows "working" in English, plus the Arabic "اصلي"
  assert.equal(claims.length, 3);
  assert.ok(claims.some((g) => g.field === "original_title_en"));
  assert.ok(claims.some((g) => g.field === "original_title_ar"));
});

test("electrical damage (cut wires) raises a conflict needing specialist review", () => {
  const record = baseRecord({
    condition: { state: "Used", cosmetic_damage: ["two wires cut at connector"], testing_status: "Untested" },
  });
  const gap = gapWhere(analyzeConflicts(record), "condition.testing_status", "conflict");
  assert.ok(gap);
  assert.match(gap.detail, /specialist review required/);
});

test("electrical damage (bent connector pins) raises the specialist conflict", () => {
  const record = baseRecord({
    condition: { state: "Used", cosmetic_damage: ["connector pins bent"], testing_status: "Untested" },
  });
  assert.ok(gapWhere(analyzeConflicts(record), "condition.testing_status", "conflict"));
});

test("Arabic electrical damage phrases raise the specialist conflict", () => {
  const record = baseRecord({
    condition: { state: "Used", cosmetic_damage: [], testing_status: "Untested" },
    notes_ar: "سلكان مقطوعان عند الموصل",
  });
  assert.ok(gapWhere(analyzeConflicts(record), "condition.testing_status", "conflict"));
});

test("untested without electrical damage stays a missing gap, not a conflict", () => {
  const record = baseRecord({
    condition: { state: "Used", cosmetic_damage: ["scratch across glass"], testing_status: "Untested" },
  });
  const gaps = analyzeConflicts(record);
  assert.ok(gapWhere(gaps, "condition.testing_status", "missing"));
  assert.ok(!gapWhere(gaps, "condition.testing_status", "conflict"));
});

test("seller field_sources value 'seller edit' wins and suppresses conflicts", () => {
  const record = baseRecord({
    notes_ar: "٢٠١٥",
    field_sources: { "donor_vehicle.year": "seller edit" },
  });
  const gaps = analyzeConflicts(record);
  assert.ok(!gapWhere(gaps, "donor_vehicle.year", "conflict"));
  assert.ok(!gapWhere(gaps, "donor_vehicle.year", "missing"));
});

test("seller field_sources value 'seller' also wins", () => {
  const record = baseRecord({
    notes_ar: "٢٠١٥",
    field_sources: { "donor_vehicle.year": "seller" },
  });
  assert.ok(!gapWhere(analyzeConflicts(record), "donor_vehicle.year", "conflict"));
});

test("a seller edit of a parent path covers the leaf gap field", () => {
  const record = baseRecord({
    notes_ar: "٢٠١٥",
    field_sources: { "donor_vehicle": "seller edit" },
  });
  assert.ok(!gapWhere(analyzeConflicts(record), "donor_vehicle.year", "conflict"));
});

test("latest seller history entry wins and suppresses conflicts", () => {
  const record = baseRecord({
    part_details: { placement: "Right" },
    notes_ar: "يسار",
    history: [
      { at: "2026-10-21T09:00:00.000Z", field: "part_details.placement", old: "Right", new: "Left", by: "seller" },
    ],
  });
  assert.ok(!gapWhere(analyzeConflicts(record), "part_details.placement", "conflict"));
});

test("a later staff edit after a seller edit re-enables checking", () => {
  const record = baseRecord({
    notes_ar: "٢٠١٥",
    history: [
      { at: "2026-10-21T09:00:00.000Z", field: "donor_vehicle.year", old: 2017, new: 2015, by: "seller" },
      { at: "2026-10-22T09:00:00.000Z", field: "donor_vehicle.year", old: 2015, new: 2017, by: "staff" },
    ],
  });
  assert.ok(gapWhere(analyzeConflicts(record), "donor_vehicle.year", "conflict"));
});

test("a seller-typed part number clears the OCR unclear gap", () => {
  const record = baseRecord({
    ocr: { text: "MIRROR ???? 2017", confidence: 0.3, unclear: true, quality: "poor" },
    field_sources: { [PN_FIELD]: "seller edit" },
  });
  const gaps = analyzeConflicts(record);
  assert.ok(!gapWhere(gaps, PN_FIELD, "missing"));
  assert.ok(!gapWhere(gaps, PN_FIELD, "conflict"));
});

test("donor_vehicle is never used to fill missing part_details values", () => {
  const record = baseRecord({
    part_details: {
      part_number: { extracted_value: null, extraction_method: "none", requires_manual_verification: true },
      placement: null,
    },
    donor_vehicle: { make: "Toyota", model: "Land Cruiser", year: 2017, drive_side: "LHD" },
  });
  const gaps = analyzeConflicts(record);
  assert.ok(gapWhere(gaps, PN_FIELD, "missing"), "part number must stay missing");
  assert.ok(gapWhere(gaps, "part_details.placement", "missing"), "placement must stay missing");
});

test("analyzeConflicts never mutates the record", () => {
  const record = baseRecord({ notes_ar: "٢٠١٥ يمين برادو" });
  const snapshot = structuredClone(record);
  analyzeConflicts(record);
  assert.deepStrictEqual(record, snapshot);
});

test("ocr: null (upload step not run yet) is handled without gaps", () => {
  const record = baseRecord({ ocr: null });
  const gaps = analyzeConflicts(record);
  assert.ok(!gaps.some((g) => g.sources.includes("OCR")));
});
