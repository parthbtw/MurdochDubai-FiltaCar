// Pure entry point for the checks pipeline. Never mutates its input, makes no
// network calls, and returns exactly:
// { gaps_and_conflicts, questions, readiness_status, draft, corridor }

import { analyzeConflicts, SELLER_FIXABLE_CONFLICT_FIELDS } from "./conflicts.js";
import { questionsFor } from "./questions.js";

function readinessFor(gaps) {
  // Conflicts the seller cannot settle by typing a value (e.g. electrical
  // function that cannot be verified from the data) need a specialist.
  const needsSpecialist = gaps.some(
    (g) => g.type === "conflict" && !SELLER_FIXABLE_CONFLICT_FIELDS.has(g.field),
  );
  if (needsSpecialist) return "specialist_review_required";
  // Seller-fixable conflicts (year, side, part number) and missing data are
  // things the seller can resolve, so they only block for information.
  if (gaps.some((g) => g.type === "conflict" || g.type === "missing")) return "information_missing";
  return "ready_for_review"; // cannot_claim alone never changes readiness
}

export function runChecks(record) {
  const gaps = analyzeConflicts(record);
  return {
    gaps_and_conflicts: gaps,
    questions: questionsFor(gaps, record),
    readiness_status: readinessFor(gaps),
    // Placeholders: filled in by the next task.
    draft: { title: "", description: "", item_specifics: {}, blocked_claims: [] },
    corridor: null,
  };
}
