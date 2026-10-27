import { Router } from 'express'
import { readParts, writeParts, readCompatibilityMap } from '../store.js'
import { runChecks, buildQuestionPack } from '../checks/index.js'

const router = Router()

const VALID_STATUSES = ['ready_for_review', 'information_missing', 'specialist_review_required']
const PROTECTED_FIELDS = [
  'gaps_and_conflicts',
  'questions',
  'readiness_status',
  'field_sources',
  'draft',
  'corridor',
  'ocr',
  'ai_reads',
  'candidates',
  'history',
  'seller_approval',
  'item_id',
]

function findPart(parts, id) {
  return parts.find((p) => p.item_id === id)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Deep merges patch onto target. Records every changed field path (dot
// notation) into changes[] as { field, old, new }. Arrays are replaced
// wholesale, objects are merged recursively.
function applyPatch(target, patch, prefix, changes) {
  for (const [key, value] of Object.entries(patch)) {
    const field = prefix ? `${prefix}.${key}` : key
    const oldValue = target[key]
    if (isPlainObject(value) && isPlainObject(oldValue)) {
      applyPatch(oldValue, value, field, changes)
    } else {
      if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
        changes.push({ field, old: oldValue ?? null, new: value })
      }
      target[key] = value
    }
  }
}

function validatePatch(patch, existing) {
  const errors = []
  if (!isPlainObject(patch)) {
    return ['request body must be a JSON object']
  }
  for (const key of Object.keys(patch)) {
    if (PROTECTED_FIELDS.includes(key)) {
      errors.push(`${key} is computed or system-owned and cannot be edited`)
    }
  }
  if ('item_id' in patch && patch.item_id !== existing.item_id) {
    errors.push('item_id cannot be changed')
  }
  return errors
}

// GET /api/parts: all records, optional ?status= filter.
router.get('/', (req, res) => {
  let parts = readParts()
  const { status } = req.query
  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
      })
    }
    parts = parts.filter((p) => p.readiness_status === status)
  }
  res.json({ parts })
})

// GET /api/parts/:id: one record or 404.
router.get('/:id', (req, res) => {
  const part = findPart(readParts(), req.params.id)
  if (!part) {
    return res.status(404).json({ error: `part ${req.params.id} not found` })
  }
  res.json(part)
})

// Copyable text only. No message is sent and the stored record is unchanged.
router.get('/:id/question-pack', (req, res) => {
  const part = findPart(readParts(), req.params.id)
  if (!part) {
    return res.status(404).json({ error: `part ${req.params.id} not found` })
  }
  res.json({
    item_id: part.item_id,
    text: buildQuestionPack(part),
    questions_count: (part.questions || []).length,
  })
})

// PUT /api/parts/:id: merge changed fields, tag their field_sources as
// "seller edit", append history, run Developer C's checks and persist every
// key those checks return.
router.put('/:id', (req, res) => {
  const parts = readParts()
  const part = findPart(parts, req.params.id)
  if (!part) {
    return res.status(404).json({ error: `part ${req.params.id} not found` })
  }

  const errors = validatePatch(req.body || {}, part)
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join('; ') })
  }

  const changes = []
  applyPatch(part, req.body, '', changes)

  if (changes.length > 0) {
    part.field_sources = part.field_sources || {}
    for (const change of changes) {
      part.field_sources[change.field] = 'seller edit'
      part.history.push({
        at: new Date().toISOString(),
        field: change.field,
        old: change.old,
        new: change.new,
        by: 'seller',
      })
    }
  }

  // Developer C's checks decide gaps, questions, readiness and drafts.
  const checked = runChecks(part)
  for (const key of Object.keys(checked)) {
    part[key] = checked[key]
  }

  writeParts(parts)
  res.json(part)
})

// POST /api/parts/:id/approve: sets seller_approval. Blocked with 409 while
// any "missing" or "conflict" item remains in gaps_and_conflicts.
router.post('/:id/approve', (req, res) => {
  const parts = readParts()
  const part = findPart(parts, req.params.id)
  if (!part) {
    return res.status(404).json({ error: `part ${req.params.id} not found` })
  }

  if (part.readiness_status === 'specialist_review_required') {
    return res.status(409).json({
      error: 'cannot approve: specialist review required',
    })
  }

  const blockers = (part.gaps_and_conflicts || []).filter(
    (g) => g.type === 'missing' || g.type === 'conflict'
  )
  if (blockers.length > 0) {
    return res.status(409).json({
      error: `cannot approve: ${blockers.length} unresolved gap(s) or conflict(s) remain`,
      gaps_and_conflicts: blockers,
    })
  }

  const alreadyApproved = part.seller_approval && part.seller_approval.approved
  part.seller_approval = {
    approved: true,
    approved_at: new Date().toISOString(),
  }
  if (!alreadyApproved) {
    part.history.push({
      at: part.seller_approval.approved_at,
      field: 'seller_approval',
      old: { approved: false, approved_at: null },
      new: part.seller_approval,
      by: 'seller',
    })
  }

  writeParts(parts)
  res.json(part)
})

export default router

export function compatibilityLookup(partNumber) {
  const map = readCompatibilityMap()
  return map[partNumber] || null
}
