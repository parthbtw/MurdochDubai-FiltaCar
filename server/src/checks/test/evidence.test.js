import { test } from "node:test";
import assert from "node:assert/strict";
import { aiReadings, isAiOnlySource, latestAiRead, latestAiReadPerPhoto, latestOcr, normalizePartNumber } from "../evidence.js";

const first = { photo: "a.png", part_number_candidate: "SBM-1", read_at: "2026-10-27T10:00:00.000Z" };
const second = { photo: "a.png", part_number_candidate: "SBM-2", read_at: "2026-10-27T11:00:00.000Z" };

test("latestOcr returns the newest (last) entry of an array", () => {
  assert.equal(latestOcr({ ocr: [first, second] }), second);
  assert.equal(latestOcr({ ocr: [first] }), first);
});

test("latestOcr accepts an old plain-object ocr value", () => {
  assert.equal(latestOcr({ ocr: first }), first);
});

test("latestOcr returns null for null, missing, empty array and empty object", () => {
  assert.equal(latestOcr({ ocr: null }), null);
  assert.equal(latestOcr({}), null);
  assert.equal(latestOcr({ ocr: [] }), null);
  assert.equal(latestOcr({ ocr: {} }), null);
  assert.equal(latestOcr(null), null);
});

test("latestOcr never mutates the record", () => {
  const record = { ocr: [first, second] };
  const snapshot = structuredClone(record);
  latestOcr(record);
  assert.deepStrictEqual(record, snapshot);
});

test("latestAiRead returns the newest entry for exactly that photo", () => {
  const record = {
    ai_reads: [
      { photo: "a.png", agreement: "agree" },
      { photo: "b.png", agreement: "disagree" },
      { photo: "a.png", agreement: "ai_only" },
    ],
  };
  assert.equal(latestAiRead(record, "a.png").agreement, "ai_only");
  assert.equal(latestAiRead(record, "b.png").agreement, "disagree");
  assert.equal(latestAiRead(record, "c.png"), null);
  assert.equal(latestAiRead({}, "a.png"), null);
});

test("latestAiReadPerPhoto keeps the newest entry per photo", () => {
  const record = {
    ai_reads: [
      { photo: "a.png", agreement: "disagree" },
      { photo: "b.png", agreement: "ai_only" },
      { photo: "a.png", agreement: "agree" },
    ],
  };
  const newest = latestAiReadPerPhoto(record);
  assert.equal(newest.length, 2);
  assert.equal(newest.find((r) => r.photo === "a.png").agreement, "agree");
  assert.deepEqual(latestAiReadPerPhoto({}), []);
  assert.deepEqual(latestAiReadPerPhoto({ ai_reads: null }), []);
});

test("aiReadings keeps a consistent stored agreement and corrects an inconsistent one", () => {
  const ocr = [{ photo: "a.png", part_number_candidate: "SBM-1" }];
  const read = (agreement, part_number, readable = true) => ({ photo: "a.png", agreement, result: { part_number, readable, damage_notes: [] } });
  assert.equal(aiReadings({ ocr, ai_reads: [read("agree", "SBM-1")] })[0].agreement, "agree");
  assert.equal(aiReadings({ ocr, ai_reads: [read("agree", "SBM-1", false)] })[0].agreement, "tesseract_only");
  assert.equal(aiReadings({ ocr: [], ai_reads: [read("tesseract_only", null)] })[0].agreement, "neither");
  assert.equal(aiReadings({ ocr: [], ai_reads: [read("agree", "SBM-1")] })[0].agreement, "ai_only");
  assert.deepEqual(aiReadings({ ocr, ai_reads: [read("disagree", "SBM-2")] })[0], {
    photo: "a.png", agreement: "disagree", ai: "SBM-2", ocr: "SBM-1", damage_notes: [],
  });
});

test("isAiOnlySource separates AI-only values from known facts", () => {
  assert.equal(isAiOnlySource("CodeBuddy AI (live)"), true);
  assert.equal(isAiOnlySource("OCR + CodeBuddy AI agree (photo 2)"), false);
  assert.equal(isAiOnlySource("CodeBuddy AI, confirmed by seller"), false);
  assert.equal(isAiOnlySource("spreadsheet row 3"), false);
  assert.equal(isAiOnlySource(undefined), false);
});

test("normalizePartNumber removes spaces and dashes and uppercases", () => {
  assert.equal(normalizePartNumber(" sbm-7946 pf "), "SBM7946PF");
  assert.equal(normalizePartNumber(null), "");
});
