// Pure entry point for the checks pipeline. Never mutates its input, makes no
// network calls, and returns the computed contract fields.

import { analyzeConflicts, SELLER_FIXABLE_CONFLICT_FIELDS } from "./conflicts.js";
import { questionsFor } from "./questions.js";
import { buildCorridor } from './corridor.js';
import { buildDraft } from './draft.js';
import { normalizeArabic } from './arabicDictionary.js';
import { applyClaimGuard } from './claimGuard.js';
import { buildActions } from './actions.js';
import { buildChecklist } from './checklist.js';
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

export function runChecks(record, compatibilityMap) {
  const gaps = analyzeConflicts(record);
  const corridor = buildCorridor(record);
  const draft = buildDraft(record, gaps, corridor, compatibilityMap);
  const claimKey = (field, phrase) => `${field}:${normalizeArabic(phrase).toLowerCase().replace(/\s+/g, ' ').trim()}`;
  const claimGaps = new Map();
  for (const gap of gaps) {
    const match = gap.type === 'cannot_claim' && gap.detail.match(/^Cannot claim "(.+)" in the title without proof$/);
    if (match) claimGaps.set(claimKey(gap.field, match[1]), gap);
  }
  for (const block of draft.blocked_claims) {
    if (block.reason.startsWith('Cannot claim: subjective condition')) {
      const key = 'subjective condition';
      if (!claimGaps.has(key)) {
        const fields = ['original_title_ar', 'original_title_en', 'notes_ar', 'condition', 'part_details'];
        const source = fields.find(field => applyClaimGuard(JSON.stringify(record[field] || ''), record).blocked
          .some(hit => hit.reason === block.reason)) || 'draft';
        const gap = { field: source, type: 'cannot_claim', detail: block.reason,
          sources: [record.field_sources?.[source] || source] };
        gaps.push(gap);
        claimGaps.set(key, gap);
      }
      continue;
    }
    const sources = [];
    const visit = (value, path) => {
      if (typeof value === 'string' && applyClaimGuard(value, record).blocked.some(hit => claimKey('', hit.phrase) === claimKey('', block.phrase))) sources.push(path);
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    };
    for (const key of ['part_details', 'condition', 'donor_vehicle', 'original_title_en', 'original_title_ar', 'notes_ar']) visit(record[key], key);
    for (const source of new Set(sources.length ? sources : ['seller data'])) {
      const key = claimKey(source, block.phrase);
      const existing = claimGaps.get(key);
      const detail = `Cannot claim "${block.phrase.toLowerCase()}": ${block.reason.replace(/^Cannot claim:\s*/, '')}`;
      if (existing) {
        existing.detail = detail;
      } else {
        const field = ['original_title_en', 'original_title_ar'].includes(source) ? source : 'draft';
        const gap = { field, type: 'cannot_claim', detail, sources: [source] };
        gaps.push(gap);
        claimGaps.set(key, gap);
      }
    }
  }
  const questions = questionsFor(gaps, record);
  corridor.checklist = buildChecklist(record, gaps, draft, corridor);
  return {
    gaps_and_conflicts: gaps,
    questions,
    actions_required: buildActions(record, gaps, questions),
    readiness_status: readinessFor(gaps),
    draft,
    corridor,
  };
}
