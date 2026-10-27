// Shared readers for OCR and AI evidence on a record, per docs/CONTRACT.md.
// Pure: never mutates the record.

/**
 * Newest OCR reading. record.ocr is an array, newest last; a plain object from
 * older records is still accepted. Missing or empty values return null.
 */
export function latestOcr(record) {
  const ocr = record?.ocr;
  if (Array.isArray(ocr)) return ocr.length > 0 ? ocr[ocr.length - 1] : null;
  if (ocr && typeof ocr === "object" && Object.keys(ocr).length > 0) return ocr;
  return null;
}

/** Newest ai_reads entry for exactly this photo, or null. */
export function latestAiRead(record, photo) {
  const reads = Array.isArray(record?.ai_reads) ? record.ai_reads : [];
  for (let i = reads.length - 1; i >= 0; i -= 1) {
    if (reads[i] && reads[i].photo === photo) return reads[i];
  }
  return null;
}

/** Newest OCR entry for exactly this photo, or null. */
export function latestOcrForPhoto(record, photo) {
  const ocr = record?.ocr;
  const list = Array.isArray(ocr) ? ocr : ocr && typeof ocr === "object" ? [ocr] : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i] && list[i].photo === photo) return list[i];
  }
  return null;
}

/** The newest ai_reads entry per photo, in the order the photos were last read. */
export function latestAiReadPerPhoto(record) {
  const reads = Array.isArray(record?.ai_reads) ? record.ai_reads : [];
  const newest = new Map();
  for (const read of reads) {
    if (!read || typeof read !== "object") continue;
    newest.delete(read.photo);
    newest.set(read.photo, read);
  }
  return [...newest.values()];
}

/** Part numbers compare without spaces or dashes, uppercased. */
export function normalizePartNumber(value) {
  return String(value ?? "").replace(/[\s-]/g, "").toUpperCase();
}

const present = (value) => value !== undefined && value !== null && String(value).trim() !== "";

/**
 * What each photo's newest AI read actually says, checked against the newest
 * OCR entry for the same photo. result.readable false counts as no reading. The
 * stored agreement is kept unless the readings it relies on are absent (for
 * example tesseract_only with no Tesseract number is really neither).
 * @returns {{photo: string, agreement: string, ai: string|null, ocr: string|null, damage_notes: string[]}[]}
 */
export function aiReadings(record) {
  return latestAiReadPerPhoto(record).map((read) => {
    const readable = read.result?.readable !== false;
    const ai = readable && present(read.result?.part_number) ? String(read.result.part_number) : null;
    const ocrEntry = latestOcrForPhoto(record, read.photo);
    const ocr = ocrEntry && present(ocrEntry.part_number_candidate) ? String(ocrEntry.part_number_candidate) : null;
    const derived = ai && ocr
      ? (normalizePartNumber(ai) === normalizePartNumber(ocr) ? "agree" : "disagree")
      : ai ? "ai_only" : ocr ? "tesseract_only" : "neither";
    const consistent = {
      agree: ai && ocr,
      disagree: ai && ocr,
      ai_only: ai && !ocr,
      tesseract_only: !ai && ocr,
      neither: !ai && !ocr,
    }[read.agreement];
    const notes = readable && Array.isArray(read.result?.damage_notes) ? read.result.damage_notes : [];
    return {
      photo: read.photo,
      agreement: consistent ? read.agreement : derived,
      ai,
      ocr,
      damage_notes: notes.filter(present).map(String),
    };
  });
}

// field_sources values meaning the seller owns a field. Other values starting
// with "seller" ("seller SKU label", "seller register") are bookkeeping.
export const SELLER_SOURCES = new Set(["seller edit", "CodeBuddy AI, confirmed by seller"]);

/**
 * True for a value that came from CodeBuddy AI alone. "OCR + CodeBuddy AI agree"
 * and "CodeBuddy AI, confirmed by seller" are known facts, not AI-only.
 */
export function isAiOnlySource(source) {
  return typeof source === "string" &&
    source.includes("CodeBuddy AI") &&
    !source.startsWith("OCR + CodeBuddy AI agree") &&
    !SELLER_SOURCES.has(source);
}
