// Pure entry point for the checks pipeline. Never mutates its input, makes no
// network calls, and returns exactly:
// { gaps_and_conflicts, questions, readiness_status, draft, corridor }

import { analyzeConflicts } from "./conflicts.js";
import { questionsFor } from "./questions.js";

function readinessFor(gaps) {
  const hasConflict = gaps.some((g) => g.type === "conflict");
  if (hasConflict) return "specialist_review_required";
  const hasMissing = gaps.some((g) => g.type === "missing");
  if (hasMissing) return "information_missing";
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
