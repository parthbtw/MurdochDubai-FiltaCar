import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runChecks } from "../runChecks.js";
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

test("expected readiness per seed (B's rules: seller-fixable conflicts are information_missing)", () => {
  const expected = {
    "MIR-0001": "information_missing", // unknown note words only
    "MIR-0002": "information_missing",
    "MIR-0003": "information_missing",
    "MIR-0004": "information_missing", // missing part number
    "MIR-0005": "information_missing", // untested + missing part number
    "MIR-0006": "information_missing",
    "MIR-0007": "information_missing", // year conflict is seller-fixable
    "MIR-0008": "information_missing", // placement unknown
    "MIR-0009": "specialist_review_required", // two cut wires, untested electrics
    "MIR-0010": "specialist_review_required", // bent connector pins, untested electrics
  };
  for (const record of seeds) {
    const { readiness_status } = runChecks(record);
    assert.equal(readiness_status, expected[record.item_id], `${record.item_id}`);
  }
});

test("MIR-0007: year conflict stays information_missing because the seller can fix it", () => {
  const record = seeds.find((r) => r.item_id === "MIR-0007");
  const result = runChecks(record);
  const gap = result.gaps_and_conflicts.find((g) => g.field === "donor_vehicle.year");
  assert.ok(gap);
  assert.equal(gap.type, "conflict");
  assert.equal(result.readiness_status, "information_missing");
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

test("demo difficult case: unclear OCR + year conflict is information_missing, seller can resolve it", () => {
  const record = baseRecord({
    ocr: { text: "MIRR0R SBM-?OO1-T17 2O17", confidence: 0.4, unclear: true, quality: "poor" },
    notes_ar: "٢٠١٥",
  });
  const result = runChecks(record);
  assert.equal(result.readiness_status, "information_missing");
  assert.ok(result.gaps_and_conflicts.some((g) => g.field === "donor_vehicle.year" && g.type === "conflict"));
  assert.ok(
    result.gaps_and_conflicts.some((g) => g.detail === "OCR Unclear, seller to type value"),
  );
});

test("after a simulated seller edit the demo case becomes ready_for_review", () => {
  const record = baseRecord({
    ocr: { text: "MIRR0R SBM-?OO1-T17 2O17", confidence: 0.4, unclear: true, quality: "poor" },
    notes_ar: "٢٠١٥",
  });

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

test("unknown Arabic words surface as a question, never as an attribute", () => {
  const record = seeds.find((r) => r.item_id === "MIR-0004");
  const result = runChecks(record);
  const gap = result.gaps_and_conflicts.find((g) => g.field === "notes_ar");
  assert.ok(gap);
  assert.match(gap.detail, /Unrecognised Arabic words: /);
  const q = result.questions.find((x) => x.field === "notes_ar");
  assert.ok(q);
  assert.ok(q.question_ar.length > 0);
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

test("draft and corridor are placeholders for the next task", () => {
  const result = runChecks(seeds[0]);
  assert.deepEqual(result.draft, { title: "", description: "", item_specifics: {}, blocked_claims: [] });
  assert.equal(result.corridor, null);
});
