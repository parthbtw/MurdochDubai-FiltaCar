// Pure entry point for the checks pipeline. Never mutates its input, makes no
// network calls, and returns exactly:
// { gaps_and_conflicts, questions, readiness_status, draft, corridor }

import { analyzeConflicts, SELLER_FIXABLE_CONFLICT_FIELDS } from "./conflicts.js";
import { questionsFor } from "./questions.js";
import { buildCorridor } from './corridor.js';
import { buildDraft } from './draft.js';
export { buildQuestionPack } from './questionPack.js';

function readinessFor(gaps) {
  // Conflicts the seller cannot settle by typing a value (e.g. electrical
  // function that cannot be verified from the data) need a specialist.
  const needsSpecialist = gaps.some(
    (g) => g.type === "conflict" && !SELLER_FIXABLE_CONFLICT_FIELDS.has(g.field),
  );
  if (needsSpecialist) return "specialist_review_required";
  // Seller-fixable conflicts (side, part number, year) and missing data are
  // things the seller can resolve, so they only block for information.
  if (gaps.some((g) => g.type === "conflict" || g.type === "missing")) return "information_missing";
  return "ready_for_review"; // cannot_claim alone never changes readiness
}

export function runChecks(record) {
  const gaps = analyzeConflicts(record);
  const corridor = buildCorridor(record);
  const draft = buildDraft(record, gaps, corridor);
  for (const block of draft.blocked_claims) {
    const sources = [];
    const visit = (value, path) => {
      if (typeof value === 'string' && value.toLowerCase().includes(block.phrase.toLowerCase())) sources.push(path);
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    };
    for (const key of ['part_details', 'condition', 'donor_vehicle', 'original_title_en', 'original_title_ar', 'notes_ar']) visit(record[key], key);
    gaps.push({ field: 'draft', type: 'cannot_claim', detail: block.reason, sources: sources.length ? sources : ['seller data'] });
  }
  return {
    gaps_and_conflicts: gaps,
    questions: questionsFor(gaps, record),
    readiness_status: readinessFor(gaps),
    draft,
    corridor,
  };
}
