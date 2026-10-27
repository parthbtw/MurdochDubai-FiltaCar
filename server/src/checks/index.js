// Owned by Developer C. Replace the body of runChecks but keep the function
// name and the exact return keys: gaps_and_conflicts, questions,
// readiness_status, draft, corridor.
// Developer C replaces the body but keeps the name and return keys.
export function runChecks(record) {
  return {
    gaps_and_conflicts: record.gaps_and_conflicts || [],
    questions: record.questions || [],
    readiness_status: record.readiness_status,
    draft: record.draft || null,
    corridor: record.corridor || null,
  }
}
