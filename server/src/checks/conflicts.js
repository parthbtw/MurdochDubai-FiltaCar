// Gap/conflict analysis for a single part record, per docs/CONTRACT.md.
// Pure: never mutates the record, never touches the network.
// donor_vehicle is evidence only: it is never used as fitment and never fills
// a missing part_details value (the donor year/make/model ARE the year/make/
// model data, so they are checked like any other source).

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

// Conflicts the seller can resolve by typing a value only lower readiness to
// information_missing. Conflicts on anything else (e.g. electrical function
// that cannot be verified from the data) need specialist_review_required.
export const SELLER_FIXABLE_CONFLICT_FIELDS = new Set([
  "donor_vehicle.year",
  "part_details.placement",
  "part_details.part_number.extracted_value",
]);

// Indicators that electrical function cannot be verified from the data, so a
// specialist must inspect the part before it can be listed.
const ELECTRICAL_DAMAGE_PATTERNS = [
  /\bwires?\s+cut\b|\bcut\s+wires?\b/i,
  /\bbent\s+pins?\b|\bpins?\s+bent\b/i,
  /\bconnector\s+(?:pins?\s+)?(?:cut|bent|damaged)\b/i,
  /\b(?:wiring|electrics?|electrical)\s+(?:unclear|unconfirmed|unknown|damaged|faulty)\b/i,
];
const ELECTRICAL_DAMAGE_AR = [
  ["سلك", "مقطوع"], // wire ... cut
  ["موصل", "منحني"], // connector ... bent
  ["كهرب", "غير مؤكد"], // electrics ... unconfirmed
].map(([a, b]) => [normalizeArabic(a), normalizeArabic(b)]);

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

// A field_sources / history entry covers a gap field when the paths match at
// any depth (e.g. a seller edit of "part_details.part_number" covers
// "part_details.part_number.extracted_value").
function pathCovers(key, field) {
  return key === field || field.startsWith(`${key}.`) || key.startsWith(`${field}.`);
}

/**
 * True when the seller provided this field: field_sources says the value came
 * from the seller (e.g. "seller" or "seller edit"), or the latest history
 * entry covering the field was made by the seller. The seller's value then
 * wins and no conflict or missing gap is raised for that field.
 */
function sellerOwnsField(record, field) {
  const sources = record.field_sources || {};
  const isSeller = (v) => typeof v === "string" && v.trim().toLowerCase().startsWith("seller");
  for (const [key, value] of Object.entries(sources)) {
    if (pathCovers(key, field) && isSeller(value)) return true;
  }
  const history = Array.isArray(record.history) ? record.history : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (pathCovers(String(entry.field ?? ""), field)) {
      return typeof entry.by === "string" && entry.by.trim().toLowerCase().startsWith("seller");
    }
  }
  return false;
}

// Human-readable source label for a field path, preferring field_sources.
function sourceLabel(record, path, fallback) {
  const value = (record.field_sources || {})[path];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function electricalDamage(record, condition) {
  const english = [
    record.original_title_en ?? "",
    ...(Array.isArray(condition.cosmetic_damage) ? condition.cosmetic_damage : []),
  ].join(". ");
  for (const pattern of ELECTRICAL_DAMAGE_PATTERNS) {
    if (pattern.test(english)) return { hit: pattern.source };
  }
  const arabic = normalizeArabic(
    `${record.original_title_ar ?? ""} ${record.notes_ar ?? ""}`,
  );
  for (const [a, b] of ELECTRICAL_DAMAGE_AR) {
    if (arabic.includes(a) && arabic.includes(b)) return { hit: `${a} ... ${b}` };
  }
  return null;
}

function riskyClaimHits(record) {
  const titleEn = String(record.original_title_en ?? "");
  const titleAr = normalizeArabic(record.original_title_ar ?? "");
  const hits = [];
  const matched = [];
  // longest first so "tested working" swallows the shorter "working"/"works"
  for (const word of [...RISKY_CLAIM_WORDS].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`\\b${word.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (pattern.test(titleEn) && !matched.some((m) => m.includes(word))) {
      matched.push(word);
      hits.push({ field: "original_title_en", word });
    }
  }
  for (const word of RISKY_CLAIM_WORDS_AR) {
    if (titleAr.includes(word)) hits.push({ field: "original_title_ar", word });
  }
  return hits;
}

/**
 * @returns {{field: string, type: "missing"|"conflict"|"cannot_claim", detail: string, sources: string[]}[]}
 */
export function analyzeConflicts(record) {
  const gaps = [];
  const partDetails = record.part_details || {};
  const partNumber = partDetails.part_number || {};
  const condition = record.condition || {};
  const donor = record.donor_vehicle || {};
  const note = parseArabicNote(record.notes_ar);
  const ocr = record.ocr || null;

  const sellerFields = new Set();
  for (const field of [
    "part_details.part_number.extracted_value",
    "part_details.placement",
    "donor_vehicle.year",
    "donor_vehicle.make",
    "donor_vehicle.model",
    "condition.state",
    "condition.testing_status",
    "photos",
    "notes_ar",
    "original_title_en",
    "original_title_ar",
  ]) {
    if (sellerOwnsField(record, field)) sellerFields.add(field);
  }

  // ---- Year (donor_vehicle.year) ------------------------------------------
  if (!sellerFields.has("donor_vehicle.year")) {
    const yearSources = [];
    const spreadsheetYear = toYearNumber(donor.year);
    if (spreadsheetYear !== null) {
      yearSources.push({
        source: sourceLabel(record, "donor_vehicle.year", "spreadsheet"),
        value: spreadsheetYear,
      });
    }
    for (const y of note.years) yearSources.push({ source: "Arabic yard note", value: y });
    if (ocr) {
      for (const y of yearsInText(ocr.text)) yearSources.push({ source: "OCR", value: y });
    }

    const distinct = [...new Set(yearSources.map((s) => s.value))];
    if (distinct.length >= 2) {
      gaps.push({
        field: "donor_vehicle.year",
        type: "conflict",
        detail: yearSources.map((s) => `${s.source} says ${s.value}`).join(", "),
        sources: yearSources.map((s) => s.source),
      });
    } else if (spreadsheetYear === null) {
      gaps.push({
        field: "donor_vehicle.year",
        type: "missing",
        detail: "donor vehicle year is missing from the spreadsheet",
        sources: [sourceLabel(record, "donor_vehicle.year", "spreadsheet")],
      });
    }
  }

  // ---- Side (part_details.placement) ----------------------------------------
  if (!sellerFields.has("part_details.placement")) {
    const spreadsheetSide = isBlank(partDetails.placement)
      ? null
      : String(partDetails.placement).toLowerCase();
    const noteSides = note.attributes.filter((a) => a.attribute === "side").map((a) => a.value);

    const explicit = [
      { source: sourceLabel(record, "part_details.placement", "spreadsheet"), value: spreadsheetSide },
      ...noteSides.map((v) => ({ source: "Arabic yard note", value: v })),
    ].filter((s) => SIDE_VALUES.has(s.value));

    if (explicit.length >= 2 && new Set(explicit.map((s) => s.value)).size >= 2) {
      gaps.push({
        field: "part_details.placement",
        type: "conflict",
        detail: explicit.map((s) => `${s.source} says ${s.value}`).join(", "),
        sources: explicit.map((s) => s.source),
      });
    } else if (explicit.length === 0) {
      const relative = [
        { source: sourceLabel(record, "part_details.placement", "spreadsheet"), value: spreadsheetSide },
        ...noteSides.map((v) => ({ source: "Arabic yard note", value: v })),
      ].filter((s) => DRIVER_PASSENGER.has(s.value));
      if (relative.length > 0) {
        gaps.push({
          field: "part_details.placement",
          type: "conflict",
          detail:
            `Side given only as "${relative[0].value} side" by ${relative[0].source}; ` +
            "driver side means left on a UAE left-hand drive donor but right in the UK. Confirm left or right",
          sources: relative.map((s) => s.source),
        });
      } else {
        gaps.push({
          field: "part_details.placement",
          type: "missing",
          detail: "no source gives a side (spreadsheet and Arabic yard note)",
          sources: [
            sourceLabel(record, "part_details.placement", "spreadsheet"),
            "Arabic yard note",
          ],
        });
      }
    }
  }

  // ---- Part number -----------------------------------------------------------
  if (!sellerFields.has("part_details.part_number.extracted_value")) {
    const pnField = "part_details.part_number.extracted_value";
    const spreadsheetPn = isBlank(partNumber.extracted_value)
      ? null
      : String(partNumber.extracted_value);
    const pnSource = sourceLabel(record, pnField, "spreadsheet");
    const candidates = ocr ? partNumberCandidates(ocr.text) : [];

    if (spreadsheetPn !== null && candidates.length > 0) {
      const normalizedSpreadsheet = normalizePartNumber(spreadsheetPn);
      const normalizedCandidates = candidates.map(normalizePartNumber);
      if (!normalizedCandidates.includes(normalizedSpreadsheet)) {
        gaps.push({
          field: pnField,
          type: "conflict",
          detail: `spreadsheet says ${spreadsheetPn}, OCR candidates are ${candidates.join(", ")}`,
          sources: [pnSource, "OCR"],
        });
      }
    } else if (spreadsheetPn !== null && partNumber.requires_manual_verification === true) {
      gaps.push({
        field: pnField,
        type: "conflict",
        detail:
          `part number ${spreadsheetPn} was extracted via "${partNumber.extraction_method}" and is ` +
          "flagged as requiring manual verification; confirm it against the stamp on the part",
        sources: [pnSource],
      });
    } else if (spreadsheetPn === null) {
      gaps.push({
        field: pnField,
        type: "missing",
        detail:
          candidates.length > 0
            ? `no part number in the spreadsheet (OCR found candidates: ${candidates.join(", ")})`
            : "no part number in any source",
        sources: [pnSource, "Arabic yard note"],
      });
    }

    if (ocr && ocr.unclear === true) {
      gaps.push({
        field: pnField,
        type: "missing",
        detail: "OCR Unclear, seller to type value",
        sources: ["OCR"],
      });
    }
  }

  // ---- Donor make / model ------------------------------------------------------
  for (const field of ["donor_vehicle.make", "donor_vehicle.model"]) {
    const leaf = field.split(".")[1];
    if (!sellerFields.has(field) && isBlank(donor[leaf])) {
      gaps.push({
        field,
        type: "missing",
        detail: `donor vehicle ${leaf} is missing from the spreadsheet`,
        sources: [sourceLabel(record, field, "spreadsheet")],
      });
    }
  }

  // ---- Condition ------------------------------------------------------------
  if (!sellerFields.has("condition.state") && isBlank(condition.state)) {
    gaps.push({
      field: "condition.state",
      type: "missing",
      detail: "condition state is not recorded",
      sources: [sourceLabel(record, "condition.state", "Arabic yard note")],
    });
  }

  if (!sellerFields.has("condition.testing_status")) {
    const damage = electricalDamage(record, condition);
    if (damage) {
      gaps.push({
        field: "condition.testing_status",
        type: "conflict",
        detail:
          `electrical function cannot be verified from the data (matched: ${damage.hit}); ` +
          "specialist review required before listing",
        sources: [
          sourceLabel(record, "condition.cosmetic_damage", "Arabic yard note"),
          "Arabic yard note",
        ],
      });
    } else if (isBlank(condition.testing_status) || String(condition.testing_status).toLowerCase() === "untested") {
      gaps.push({
        field: "condition.testing_status",
        type: "missing",
        detail: isBlank(condition.testing_status)
          ? "testing status is not recorded; function unknown"
          : "part is untested; function unknown and cannot be claimed",
        sources: [sourceLabel(record, "condition.testing_status", "Arabic yard note")],
      });
    }
  }

  // ---- Photos -------------------------------------------------------------------
  if (!sellerFields.has("photos") && (!Array.isArray(record.photos) || record.photos.length === 0)) {
    gaps.push({
      field: "photos",
      type: "missing",
      detail: "at least one photo is required",
      sources: [sourceLabel(record, "photos", "yard photo log")],
    });
  }

  // ---- Unknown Arabic words --------------------------------------------------------
  if (!sellerFields.has("notes_ar") && note.unknown_words.length > 0) {
    gaps.push({
      field: "notes_ar",
      type: "missing",
      detail: `Unrecognised Arabic words: ${note.unknown_words.join(", ")}`,
      sources: ["Arabic yard note"],
    });
  }

  // ---- Unverifiable claims in the titles ---------------------------------------------
  for (const { field, word } of riskyClaimHits(record)) {
    gaps.push({
      field,
      type: "cannot_claim",
      detail: `Cannot claim "${word}" in the title without proof`,
      sources: [field === "original_title_en" ? "translation of Arabic title" : "Arabic yard note"],
    });
  }

  return gaps;
}
