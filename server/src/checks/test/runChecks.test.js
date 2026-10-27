import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runChecks } from "../runChecks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seeds = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "seed-parts.json"), "utf8"),
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
    assert.ok(VALID_READINESS.has(result.readiness_status), `${record.item_id}: bad status ${result.readiness_status}`);
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

test("expected readiness per seed", () => {
  const expected = {
    "MIR-001": "ready_for_review", // clean
    "MIR-002": "specialist_review_required", // demo difficult case: unclear OCR + year conflict
    "MIR-003": "specialist_review_required", // side conflict spreadsheet vs Arabic note
    "MIR-004": "information_missing", // missing part number
    "MIR-005": "ready_for_review", // cannot_claim alone never changes readiness
    "MIR-006": "ready_for_review", // seller resolved year + typed part number
    "MIR-007": "ready_for_review", // Arabic-Indic year agrees, folding phrase parsed
    "MIR-008": "specialist_review_required", // driver-side ambiguity
    "MIR-009": "information_missing", // unknown Arabic word
    "MIR-010": "specialist_review_required", // part number conflict
  };
  for (const record of seeds) {
    const { readiness_status } = runChecks(record);
    assert.equal(readiness_status, expected[record.item_id], `${record.item_id}`);
  }
});

test("demo difficult case: unclear OCR + year conflict is specialist_review_required", () => {
  const demo = seeds.find((r) => r.item_id === "MIR-002");
  const result = runChecks(demo);
  assert.equal(result.readiness_status, "specialist_review_required");
  assert.ok(result.gaps_and_conflicts.some((g) => g.field === "year" && g.type === "conflict"));
  assert.ok(result.gaps_and_conflicts.some((g) => g.field === "part_number" && g.detail === "OCR Unclear, seller to type value"));
});

test("after a simulated seller edit the demo case becomes ready_for_review", () => {
  const demo = structuredClone(seeds.find((r) => r.item_id === "MIR-002"));

  // Seller fixes the year and types the part number (recorded like the server does).
  demo.part_details.year = 2018;
  demo.part_details.part_number = "87940-60L70";
  demo.history.push(
    { at: "2026-10-23T08:00:00.000Z", field: "part_details.year", old: 2016, new: 2018, by: "seller" },
    { at: "2026-10-23T08:02:00.000Z", field: "part_details.part_number", old: "", new: "87940-60L70", by: "seller" },
  );
  demo.field_sources = {
    "part_details.year": "seller",
    "part_details.part_number": "seller",
  };
  const snapshot = structuredClone(demo);

  const result = runChecks(demo);
  assert.equal(result.readiness_status, "ready_for_review");
  assert.ok(!result.gaps_and_conflicts.some((g) => g.field === "year"));
  assert.ok(!result.gaps_and_conflicts.some((g) => g.field === "part_number"));
  assert.ok(!result.gaps_and_conflicts.some((g) => g.detail === "OCR Unclear, seller to type value"));
  assert.deepEqual(result.questions, []);
  assert.deepStrictEqual(demo, snapshot); // runChecks did not mutate the edited record either
});

test("unknown Arabic words surface as a question, never as an attribute", () => {
  const record = seeds.find((r) => r.item_id === "MIR-009");
  const result = runChecks(record);
  const gap = result.gaps_and_conflicts.find((g) => g.field === "notes_ar");
  assert.ok(gap);
  assert.match(gap.detail, /مرايا/);
  const q = result.questions.find((x) => x.field === "notes_ar");
  assert.ok(q);
  assert.match(q.question_ar, /مرايا/);
});

test("draft and corridor are placeholders for the next task", () => {
  const result = runChecks(seeds[0]);
  assert.deepEqual(result.draft, { title: "", description: "", item_specifics: {}, blocked_claims: [] });
  assert.equal(result.corridor, null);
});

test("cannot_claim gaps produce questions but never change readiness", () => {
  const record = seeds.find((r) => r.item_id === "MIR-005");
  const result = runChecks(record);
  assert.ok(result.gaps_and_conflicts.some((g) => g.type === "cannot_claim"));
  assert.equal(result.readiness_status, "ready_for_review");
  assert.ok(result.questions.some((q) => q.field === "title"));
});
