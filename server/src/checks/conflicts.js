// Gap/conflict analysis for a single part record.
// Pure: never mutates the record, never touches the network.
// donor_vehicle is evidence only: it is never used as fitment and never fills
// a missing part_details value.

import { normalizeArabic, parseArabicNote } from "./arabicDictionary.js";

const SIDE_VALUES = new Set(["left", "right"]);
const DRIVER_PASSENGER = new Set(["driver", "passenger"]);

// English claim words we cannot verify; also a few common Arabic equivalents.
export const RISKY_CLAIM_WORDS = [
  "genuine",
  "tested working",
  "working",
  "works",
  "oem",
  "original",
  "new",
];
const RISKY_CLAIM_WORDS_AR = ["اصلي", "جديد", "شغال"].map(normalizeArabic);

const REQUIRED_PART_DETAILS = ["part_number", "side", "condition", "make", "model", "year"];

function isBlank(value) {
  return value === undefined || value === null || value === "";
}

function toYearNumber(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1990 && n <= 2030 ? n : null;
}

function yearsInText(text) {
  const normalized = normalizeArabic(text);
  const out = [];
  for (const match of normalized.match(/\b\d{4}\b/g) || []) {
    const n = Number(match);
    if (n >= 1990 && n <= 2030 && !out.includes(n)) out.push(n);
  }
  return out;
}

function normalizePartNumber(value) {
  return String(value ?? "").replace(/[\s-]/g, "").toUpperCase();
}

function partNumberCandidates(ocrText) {
  const out = [];
  for (const token of String(ocrText ?? "").split(/[^\w-]+/)) {
    if (token.length >= 6 && /[A-Za-z]/.test(token) && /\d/.test(token) && !out.includes(token)) {
      out.push(token);
    }
  }
  return out;
}

/**
 * True when the seller provided this field: field_sources says "seller", or the
 * latest history entry for the field was made by the seller. The seller's value
 * then wins and no conflict or missing gap is raised for that field.
 */
function sellerOwnsField(record, field) {
  const sources = record.field_sources || {};
  const isSeller = (v) => typeof v === "string" && v.trim().toLowerCase() === "seller";
  if (isSeller(sources[field]) || isSeller(sources[`part_details.${field}`])) return true;
  const history = Array.isArray(record.history) ? record.history : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry.field === field || entry.field === `part_details.${field}`) {
      return typeof entry.by === "string" && entry.by.trim().toLowerCase() === "seller";
    }
  }
  return false;
}

function riskyClaimHits(record) {
  const titleEn = String(record.original_title_en ?? "").toLowerCase();
  const titleAr = normalizeArabic(record.original_title_ar ?? "");
  const hits = [];
  const matched = [];
  // longest first so "tested working" swallows the shorter "working"/"works"
  for (const word of [...RISKY_CLAIM_WORDS].sort((a, b) => b.length - a.length)) {
    if (titleEn.includes(word) && !matched.some((m) => m.includes(word))) {
      matched.push(word);
      hits.push(word);
    }
  }
  for (const word of RISKY_CLAIM_WORDS_AR) {
    if (titleAr.includes(word)) hits.push(word);
  }
  return hits;
}

/**
 * @returns {{field: string, type: "missing"|"conflict"|"cannot_claim", detail: string, sources: string[]}[]}
 */
export function analyzeConflicts(record) {
  const gaps = [];
  const partDetails = record.part_details || {};
  const note = parseArabicNote(record.notes_ar);
  const ocr = record.ocr || {};

  const sellerFields = new Set();
  for (const field of [
    ...REQUIRED_PART_DETAILS,
    "photos",
    "notes_ar",
    "title",
  ]) {
    if (sellerOwnsField(record, field)) sellerFields.add(field);
  }

  // ---- Year ----------------------------------------------------------------
  const yearSources = [];
  const spreadsheetYear = toYearNumber(partDetails.year);
  if (spreadsheetYear !== null) yearSources.push({ source: "spreadsheet", value: spreadsheetYear });
  for (const y of note.years) yearSources.push({ source: "Arabic note", value: y });
  for (const y of yearsInText(ocr.text)) yearSources.push({ source: "OCR", value: y });

  if (!sellerFields.has("year")) {
    const distinct = [...new Set(yearSources.map((s) => s.value))];
    if (distinct.length >= 2) {
      gaps.push({
        field: "year",
        type: "conflict",
        detail: yearSources.map((s) => `${s.source} says ${s.value}`).join(", "),
        sources: yearSources.map((s) => s.source),
      });
    } else if (spreadsheetYear === null) {
      gaps.push({
        field: "year",
        type: "missing",
        detail: "Year is missing from the spreadsheet",
        sources: ["spreadsheet"],
      });
    }
  }

  // ---- Side ----------------------------------------------------------------
  if (!sellerFields.has("side")) {
    const spreadsheetSide = isBlank(partDetails.side) ? null : String(partDetails.side).toLowerCase();
    const noteSides = note.attributes.filter((a) => a.attribute === "side").map((a) => a.value);

    const explicit = [
      { source: "spreadsheet", value: spreadsheetSide },
      ...noteSides.map((v) => ({ source: "Arabic note", value: v })),
    ].filter((s) => SIDE_VALUES.has(s.value));

    if (explicit.length >= 2 && new Set(explicit.map((s) => s.value)).size >= 2) {
      gaps.push({
        field: "side",
        type: "conflict",
        detail: explicit.map((s) => `${s.source} says ${s.value}`).join(", "),
        sources: explicit.map((s) => s.source),
      });
    } else if (explicit.length === 0) {
      const relative = [
        { source: "spreadsheet", value: spreadsheetSide },
        ...noteSides.map((v) => ({ source: "Arabic note", value: v })),
      ].filter((s) => DRIVER_PASSENGER.has(s.value));
      if (relative.length > 0) {
        gaps.push({
          field: "side",
          type: "conflict",
          detail:
            `Side given only as "${relative[0].value} side" by ${relative[0].source}; ` +
            "driver side means left on a UAE left-hand drive donor but right in the UK. Confirm left or right",
          sources: relative.map((s) => s.source),
        });
      } else {
        gaps.push({
          field: "side",
          type: "missing",
          detail: "No source gives a side (spreadsheet and Arabic note)",
          sources: ["spreadsheet", "Arabic note"],
        });
      }
    }
  }

  // ---- Part number -----------------------------------------------------------
  if (!sellerFields.has("part_number")) {
    const spreadsheetPn = isBlank(partDetails.part_number) ? null : String(partDetails.part_number);
    const candidates = partNumberCandidates(ocr.text);

    if (spreadsheetPn !== null && candidates.length > 0) {
      const normalizedSpreadsheet = normalizePartNumber(spreadsheetPn);
      const normalizedCandidates = candidates.map(normalizePartNumber);
      if (!normalizedCandidates.includes(normalizedSpreadsheet)) {
        gaps.push({
          field: "part_number",
          type: "conflict",
          detail:
            `spreadsheet says ${spreadsheetPn}, OCR candidates are ${candidates.join(", ")}`,
          sources: ["spreadsheet", "OCR"],
        });
      }
    } else if (spreadsheetPn === null) {
      gaps.push({
        field: "part_number",
        type: "missing",
        detail:
          candidates.length > 0
            ? `Part number missing from spreadsheet (OCR found candidates: ${candidates.join(", ")})`
            : "Part number missing from spreadsheet",
        sources: ["spreadsheet"],
      });
    }

    if (ocr.unclear === true) {
      gaps.push({
        field: "part_number",
        type: "missing",
        detail: "OCR Unclear, seller to type value",
        sources: ["OCR"],
      });
    }
  }

  // ---- Other required fields -------------------------------------------------
  // condition lives at the top level of the record; make/model in part_details.
  if (!sellerFields.has("condition") && isBlank(record.condition)) {
    gaps.push({
      field: "condition",
      type: "missing",
      detail: "condition is missing from the spreadsheet",
      sources: ["spreadsheet"],
    });
  }
  for (const field of ["make", "model"]) {
    if (!sellerFields.has(field) && isBlank(partDetails[field])) {
      gaps.push({
        field,
        type: "missing",
        detail: `${field} is missing from the spreadsheet`,
        sources: ["spreadsheet"],
      });
    }
  }
  if (!sellerFields.has("photos") && (!Array.isArray(record.photos) || record.photos.length === 0)) {
    gaps.push({
      field: "photos",
      type: "missing",
      detail: "At least one photo is required",
      sources: ["photos"],
    });
  }

  // ---- Unknown Arabic words ----------------------------------------------------
  if (!sellerFields.has("notes_ar") && note.unknown_words.length > 0) {
    gaps.push({
      field: "notes_ar",
      type: "missing",
      detail: `Unrecognised Arabic words: ${note.unknown_words.join(", ")}`,
      sources: ["Arabic note"],
    });
  }

  // ---- Unverifiable claims in the title -----------------------------------------
  for (const word of riskyClaimHits(record)) {
    gaps.push({
      field: "title",
      type: "cannot_claim",
      detail: `Cannot claim "${word}" in the title without proof`,
      sources: ["original title"],
    });
  }

  return gaps;
}
