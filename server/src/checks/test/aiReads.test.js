import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../runChecks.js";
import { aiReadings, latestAiReadPerPhoto } from "../evidence.js";
import { baseRecord } from "./helpers.js";

// Section 6 of the v3 handoff: ai_reads, newest per photo.

const PN_FIELD = "part_details.part_number.extracted_value";
const PHOTO = "/demo/labels/TEST-001.png";
const NO_PN = { extracted_value: null, extraction_method: "none", requires_manual_verification: true };

function ocrEntry(candidate, unclear = false) {
  return { engine: "tesseract.js (local)", photo: PHOTO, text: `${candidate ?? ""}\n`, confidence: unclear ? 30 : 91, unclear, quality: { sharpness: 1200, blurry: false }, part_number_candidate: candidate, read_at: "2026-10-27T15:00:00.000Z" };
}

function aiRead(agreement, part_number, extra = {}) {
  return { engine: "CodeBuddy AI", mode: "live", photo: PHOTO, result: { part_number, visible_text: part_number ?? "", damage_notes: [], readable: true, ...extra }, agreement, read_at: "2026-10-27T15:00:05.000Z" };
}

const pnGaps = (result) => result.gaps_and_conflicts.filter((g) => g.field === PN_FIELD);
const questionFor = (result, gap) => result.questions[result.gaps_and_conflicts.indexOf(gap)];
const draftText = (result) => JSON.stringify({ t: result.draft.title, d: result.draft.description, s: result.draft.item_specifics });

test("agree: no extra gap, and the agreed number appears as a plain number", () => {
  const record = baseRecord({ ocr: [ocrEntry("SBM-0001-T17")], ai_reads: [aiRead("agree", "SBM-0001-T17")] });
  const result = runChecks(record);
  assert.deepEqual(pnGaps(result), []);
  assert.equal(result.readiness_status, "ready_for_review");
  assert.equal(result.draft.item_specifics["Manufacturer Part Number"], "SBM-0001-T17");
});

test("agree: a part number sourced 'OCR + CodeBuddy AI agree (photo N)' is a known fact", () => {
  const record = baseRecord({
    field_sources: { [PN_FIELD]: "OCR + CodeBuddy AI agree (photo 1)" },
    ai_reads: [aiRead("agree", "SBM-0001-T17")],
    ocr: [ocrEntry("SBM-0001-T17")],
  });
  const result = runChecks(record);
  assert.deepEqual(pnGaps(result), []);
  assert.equal(result.draft.item_specifics["Manufacturer Part Number"], "SBM-0001-T17");
});

test("disagree: seller-fixable conflict showing both readings, with a bilingual question", () => {
  const record = baseRecord({ ocr: [ocrEntry("SBM-0001-T17")], ai_reads: [aiRead("disagree", "SBM-0001-T71")] });
  const result = runChecks(record);
  const gap = pnGaps(result).find((g) => g.type === "conflict");
  assert.equal(gap.detail, "OCR read SBM-0001-T17, CodeBuddy AI read SBM-0001-T71");
  assert.equal(result.readiness_status, "information_missing");
  const q = questionFor(result, gap);
  for (const text of [q.question_en, q.question_ar]) {
    assert.match(text, /SBM-0001-T17/);
    assert.match(text, /SBM-0001-T71/);
  }
  assert.match(q.question_en, /check the stamp/);
  assert.match(q.question_ar, /الرقم المختوم/);
});

test("disagree is skipped when the part number is seller-owned", () => {
  const record = baseRecord({
    ocr: [ocrEntry("SBM-0001-T17")],
    ai_reads: [aiRead("disagree", "SBM-0001-T71")],
    field_sources: { [PN_FIELD]: "seller edit" },
  });
  assert.deepEqual(pnGaps(runChecks(record)), []);
});

test("ai_only: missing gap 'CodeBuddy AI read X; please confirm' with a bilingual question, never in the draft", () => {
  const record = baseRecord({
    part_details: { part_number: NO_PN },
    ocr: [ocrEntry(null, true)],
    ai_reads: [aiRead("ai_only", "SBM-0005-XY")],
  });
  const result = runChecks(record);
  const gap = pnGaps(result).find((g) => g.detail === "CodeBuddy AI read SBM-0005-XY; please confirm");
  assert.ok(gap);
  assert.equal(gap.type, "missing");
  assert.equal(result.readiness_status, "information_missing");
  const q = questionFor(result, gap);
  assert.match(q.question_en, /SBM-0005-XY/);
  assert.match(q.question_ar, /SBM-0005-XY/);
  assert.doesNotMatch(draftText(result), /SBM-0005-XY/);
});

test("ai_only is skipped when seller-owned or when a non-AI source already holds the same value", () => {
  const sameFromSheet = baseRecord({
    field_sources: { [PN_FIELD]: "spreadsheet row 3" },
    ai_reads: [aiRead("ai_only", "sbm 0001 t17")],
  });
  assert.deepEqual(pnGaps(runChecks(sameFromSheet)), []);
  const confirmed = baseRecord({
    field_sources: { [PN_FIELD]: "CodeBuddy AI, confirmed by seller" },
    ai_reads: [aiRead("ai_only", "SBM-0001-T17")],
  });
  assert.deepEqual(pnGaps(runChecks(confirmed)), []);
  const differentValue = baseRecord({ ai_reads: [aiRead("ai_only", "SBM-0009-ZZ")] });
  assert.ok(pnGaps(runChecks(differentValue)).some((g) => g.detail === "CodeBuddy AI read SBM-0009-ZZ; please confirm"));
});

test("AI-only values never go into the draft", () => {
  const record = baseRecord({ field_sources: { [PN_FIELD]: "CodeBuddy AI (live)" }, ai_reads: [aiRead("ai_only", "SBM-0001-T17")] });
  const result = runChecks(record);
  assert.ok(pnGaps(result).some((g) => g.detail === "CodeBuddy AI read SBM-0001-T17; please confirm"));
  assert.doesNotMatch(draftText(result), /SBM-0001-T17/);
});

test("tesseract_only with a Tesseract number behaves as before (label check only)", () => {
  const same = baseRecord({ ocr: [ocrEntry("SBM-0001-T17")], ai_reads: [aiRead("tesseract_only", null)] });
  assert.deepEqual(pnGaps(runChecks(same)), []);
  const differs = baseRecord({ ocr: [ocrEntry("SBM-0001-T99")], ai_reads: [aiRead("tesseract_only", null)] });
  assert.equal(pnGaps(runChecks(differs))[0].detail, "record says SBM-0001-T17; label read as SBM-0001-T99 by OCR. Please check the stamp on the part.");
});

test("tesseract_only where neither reader produced a number is treated as neither", () => {
  const record = baseRecord({ part_details: { part_number: NO_PN }, ocr: [], ai_reads: [aiRead("tesseract_only", null)] });
  assert.equal(aiReadings(record)[0].agreement, "neither");
  const gaps = pnGaps(runChecks(record));
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].detail, /^Neither OCR nor CodeBuddy AI could read the part number/);
});

test("neither: a missing part number the seller types, never a second gap next to OCR Unclear", () => {
  const alone = baseRecord({ part_details: { part_number: NO_PN }, ai_reads: [aiRead("neither", null)] });
  const result = runChecks(alone);
  const gaps = pnGaps(result);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].type, "missing");
  assert.match(questionFor(result, gaps[0]).question_en, /type it/);

  const withUnclear = baseRecord({ part_details: { part_number: NO_PN }, ocr: [ocrEntry(null, true)], ai_reads: [aiRead("neither", null)] });
  const both = pnGaps(runChecks(withUnclear));
  assert.equal(both.length, 1);
  assert.equal(both[0].detail, "OCR Unclear, seller to type value");
});

test("readable false counts as no reading", () => {
  const agreeUnreadable = baseRecord({
    ocr: [ocrEntry("SBM-0001-T17")],
    ai_reads: [aiRead("disagree", "SBM-0001-T71", { readable: false, damage_notes: ["crack on glass"] })],
  });
  assert.equal(aiReadings(agreeUnreadable)[0].agreement, "tesseract_only");
  const result = runChecks(agreeUnreadable);
  assert.deepEqual(pnGaps(result), []);
  assert.ok(!result.gaps_and_conflicts.some((g) => g.field === "condition"), "unreadable reads give no damage notes");

  const labelCheck = baseRecord({ ocr: [ocrEntry("SBM-0001-T99")], ai_reads: [aiRead("agree", "SBM-0001-T99", { readable: false })] });
  assert.match(pnGaps(runChecks(labelCheck))[0].detail, /by OCR\./, "an unreadable AI read never counts as agreement");
});

test("only the newest read per photo counts", () => {
  const record = baseRecord({
    ocr: [ocrEntry("SBM-0001-T17")],
    ai_reads: [aiRead("disagree", "SBM-0001-T71"), aiRead("agree", "SBM-0001-T17")],
  });
  assert.equal(latestAiReadPerPhoto(record).length, 1);
  assert.deepEqual(pnGaps(runChecks(record)), []);
});

test("damage_notes are cannot_claim suggestions on condition, never in condition or the draft", () => {
  const record = baseRecord({ ai_reads: [aiRead("agree", "SBM-0001-T17", { damage_notes: ["crack in lower glass corner", "crack in lower glass corner"] })], ocr: [ocrEntry("SBM-0001-T17")] });
  const snapshot = structuredClone(record);
  const result = runChecks(record);
  const notes = result.gaps_and_conflicts.filter((g) => g.field === "condition");
  assert.equal(notes.length, 1, "the same note is suggested once");
  assert.equal(notes[0].type, "cannot_claim");
  assert.equal(notes[0].detail, "CodeBuddy AI sees: crack in lower glass corner. Not used until the seller confirms");
  const q = questionFor(result, notes[0]);
  assert.equal(q.question_en, "CodeBuddy AI sees: crack in lower glass corner. Is this correct?");
  assert.match(q.question_ar, /هل هذا صحيح؟/);
  assert.equal(result.readiness_status, "ready_for_review");
  assert.doesNotMatch(draftText(result), /crack in lower glass corner/);
  assert.deepStrictEqual(record, snapshot);
});

test("damage_notes are skipped once condition is seller-owned", () => {
  const record = baseRecord({
    ai_reads: [aiRead("agree", "SBM-0001-T17", { damage_notes: ["crack in lower glass corner"] })],
    field_sources: { "condition.cosmetic_damage": "seller edit" },
  });
  assert.ok(!runChecks(record).gaps_and_conflicts.some((g) => g.field === "condition"));
});
