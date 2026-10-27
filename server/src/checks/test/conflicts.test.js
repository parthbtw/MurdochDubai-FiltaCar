import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConflicts, sellerOwnsField } from "../conflicts.js";
import { runChecks } from "../runChecks.js";
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

const NO_PN = { part_details: { part_number: { extracted_value: null, extraction_method: "none", requires_manual_verification: true } } };

function ocrReading(overrides = {}) {
  return {
    engine: "tesseract.js (local)",
    photo: "/demo/labels/TEST-001.png",
    text: "SBM-9999-ZZZ\n",
    confidence: 91,
    unclear: false,
    quality: { sharpness: 1500, blurry: false },
    part_number_candidate: "SBM-9999-ZZZ",
    read_at: "2026-10-27T15:00:00.000Z",
    ...overrides,
  };
}

test("label mismatch: a clear OCR candidate that differs raises a seller-fixable conflict", () => {
  const record = baseRecord({ ocr: [ocrReading()] });
  const gap = gapWhere(analyzeConflicts(record), PN_FIELD, "conflict");
  assert.ok(gap);
  assert.equal(
    gap.detail,
    "record says SBM-0001-T17; label read as SBM-9999-ZZZ by OCR. Please check the stamp on the part.",
  );
  const result = runChecks(record);
  assert.equal(result.readiness_status, "information_missing");
});

test("label mismatch says OCR and CodeBuddy AI only when the newest AI read of that photo agrees", () => {
  const photo = "/demo/labels/TEST-001.png";
  const agree = baseRecord({
    ocr: [ocrReading()],
    ai_reads: [{ engine: "CodeBuddy AI", mode: "live", photo, result: { part_number: "SBM-9999-ZZZ" }, agreement: "agree" }],
  });
  assert.match(gapWhere(analyzeConflicts(agree), PN_FIELD, "conflict").detail, /by OCR and CodeBuddy AI\./);

  const otherPhoto = structuredClone(agree);
  otherPhoto.ai_reads[0].photo = "/demo/labels/OTHER.png";
  assert.match(gapWhere(analyzeConflicts(otherPhoto), PN_FIELD, "conflict").detail, /by OCR\./);

  const newerDisagree = structuredClone(agree);
  newerDisagree.ai_reads.push({ ...agree.ai_reads[0], agreement: "disagree" });
  assert.match(gapWhere(analyzeConflicts(newerDisagree), PN_FIELD, "conflict").detail, /by OCR\./);
});

test("label mismatch uses only the newest OCR reading and part_number_candidate, not text", () => {
  const older = ocrReading();
  const newer = ocrReading({ text: "SBM-9999-ZZZ", part_number_candidate: "SBM-0001-T17" });
  assert.ok(!gapWhere(analyzeConflicts(baseRecord({ ocr: [older, newer] })), PN_FIELD, "conflict"));
  assert.ok(gapWhere(analyzeConflicts(baseRecord({ ocr: [newer, older] })), PN_FIELD, "conflict"));
});

test("label mismatch is skipped when the candidate is unclear or the number is seller-owned", () => {
  const unclear = baseRecord({ ocr: [ocrReading({ unclear: true })] });
  assert.ok(!gapWhere(analyzeConflicts(unclear), PN_FIELD, "conflict"));
  const seller = baseRecord({ ocr: [ocrReading()], field_sources: { [PN_FIELD]: "seller edit" } });
  assert.ok(!gapWhere(analyzeConflicts(seller), PN_FIELD, "conflict"));
  const confirmed = baseRecord({ ocr: [ocrReading()], field_sources: { [PN_FIELD]: "CodeBuddy AI, confirmed by seller" } });
  assert.ok(!gapWhere(analyzeConflicts(confirmed), PN_FIELD, "conflict"));
});

test("part number comparison ignores dashes, spaces and case", () => {
  const record = baseRecord({ ocr: [ocrReading({ part_number_candidate: "sbm 0001 t17" })] });
  assert.ok(!gapWhere(analyzeConflicts(record), PN_FIELD, "conflict"));
});

test("OCR unclear raises a missing part number gap with the exact detail", () => {
  const record = baseRecord({
    ...NO_PN,
    ocr: [ocrReading({ unclear: true, part_number_candidate: null })],
  });
  const gaps = analyzeConflicts(record).filter((g) => g.field === PN_FIELD);
  assert.equal(gaps.length, 1, "one part number gap, so one question");
  assert.equal(gaps[0].type, "missing");
  assert.equal(gaps[0].detail, "OCR Unclear, seller to type value");
});

test("OCR unclear is not raised once the part has a part number", () => {
  const record = baseRecord({ ocr: [ocrReading({ unclear: true, part_number_candidate: null })] });
  assert.ok(!analyzeConflicts(record).some((g) => g.detail === "OCR Unclear, seller to type value"));
});

test("OCR unclear also works with an old plain-object ocr value", () => {
  const record = baseRecord({ ...NO_PN, ocr: { text: "??", confidence: 20, unclear: true } });
  assert.equal(gapWhere(analyzeConflicts(record), PN_FIELD, "missing").detail, "OCR Unclear, seller to type value");
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

test("unknown Arabic words become one cannot_claim item on notes_ar, never missing", () => {
  const record = baseRecord({ notes_ar: "زرنيخ يمين قنفذ" });
  const gaps = analyzeConflicts(record).filter((g) => g.field === "notes_ar");
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].type, "cannot_claim");
  assert.equal(gaps[0].detail, "Some Arabic words were not recognised; nothing from them is used in the listing");
  assert.equal(runChecks(record).readiness_status, "ready_for_review");
});

test("colour code gap is raised when both colour fields are empty and the note flags the colour", () => {
  const record = baseRecord({ notes_ar: "مرآة يمين، اللون باهت ولا يوجد كود لون" });
  const gap = gapWhere(analyzeConflicts(record), "part_details.colour_code", "missing");
  assert.ok(gap);
  assert.equal(runChecks(record).readiness_status, "information_missing");
  const q = runChecks(record).questions.find((x) => x.field === "part_details.colour_code");
  assert.match(q.question_en, /colour code/);
  assert.match(q.question_ar, /كود اللون/);
});

test("colour code gap is not raised without a colour flag, or once colour or colour code is known", () => {
  const flag = "اللون غير مؤكد";
  assert.ok(!gapWhere(analyzeConflicts(baseRecord({ notes_ar: "يمين" })), "part_details.colour_code", "missing"));
  for (const part_details of [{ colour: "silver" }, { colour_code: "1F7" }]) {
    assert.ok(!gapWhere(analyzeConflicts(baseRecord({ notes_ar: flag, part_details })), "part_details.colour_code", "missing"));
  }
  const seller = baseRecord({ notes_ar: flag, field_sources: { "part_details.colour_code": "seller edit" } });
  assert.ok(!gapWhere(analyzeConflicts(seller), "part_details.colour_code", "missing"));
});

test("a donor year conflict is seller-fixable and clears once the seller owns the year", () => {
  const record = baseRecord({ notes_ar: "٢٠١٥" });
  assert.ok(gapWhere(analyzeConflicts(record), "donor_vehicle.year", "conflict"));
  assert.equal(runChecks(record).readiness_status, "information_missing");
  const edited = baseRecord({
    notes_ar: "٢٠١٥",
    donor_vehicle: { year: 2015 },
    field_sources: { "donor_vehicle.year": "seller edit" },
  });
  assert.ok(!gapWhere(analyzeConflicts(edited), "donor_vehicle.year", "conflict"));
  assert.equal(runChecks(edited).readiness_status, "ready_for_review");
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

test("'CodeBuddy AI, confirmed by seller' is seller ownership", () => {
  const record = baseRecord({ field_sources: { [PN_FIELD]: "CodeBuddy AI, confirmed by seller" } });
  assert.equal(sellerOwnsField(record, PN_FIELD), true);
});

test("bookkeeping values like 'seller SKU label' are not seller ownership", () => {
  for (const value of ["seller SKU label", "seller register", "seller", "Seller edit", "seller edit "]) {
    const record = baseRecord({
      notes_ar: "٢٠١٥",
      field_sources: { item_id: "seller SKU label", "donor_vehicle.year": value },
    });
    assert.equal(sellerOwnsField(record, "donor_vehicle.year"), false, value);
    assert.equal(sellerOwnsField(record, "item_id"), false);
    assert.ok(gapWhere(analyzeConflicts(record), "donor_vehicle.year", "conflict"), `${value} must not suppress the conflict`);
  }
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
