import { Router } from 'express'
import { readParts } from '../store.js'
import { MANUAL_MINUTES_PER_LISTING, FILTACAR_MINUTES_PER_LISTING } from '../config.js'

const router = Router()

router.get('/', (req, res) => {
  const parts = readParts()
  const metrics = {
    parts_total: parts.length,
    approved: 0,
    by_status: { ready_for_review: 0, information_missing: 0, specialist_review_required: 0 },
    facts_with_sources: 0,
    questions_open: 0,
    missing_open: 0,
    conflicts_open: 0,
    claims_blocked: 0,
    readers: {
      ocr_reads: 0,
      ai_reads: 0,
      by_agreement: { agree: 0, disagree: 0, ai_only: 0, tesseract_only: 0, neither: 0 },
      ai_declined_to_guess: 0,
    },
    seller_edits: 0,
    time_estimate: {
      manual_minutes_per_listing: MANUAL_MINUTES_PER_LISTING,
      filtacar_minutes_per_listing: FILTACAR_MINUTES_PER_LISTING,
      basis: 'assumption for illustration, not measured',
    },
  }
  for (const part of parts) {
    if (part.seller_approval?.approved === true) metrics.approved++
    if (Object.hasOwn(metrics.by_status, part.readiness_status)) metrics.by_status[part.readiness_status]++
    metrics.facts_with_sources += Object.values(part.field_sources || {})
      .filter((source) => typeof source === 'string' && source.trim()).length
    metrics.questions_open += (part.questions || []).length
    for (const gap of part.gaps_and_conflicts || []) {
      if (gap.type === 'missing') metrics.missing_open++
      if (gap.type === 'conflict') metrics.conflicts_open++
      if (gap.type === 'cannot_claim') metrics.claims_blocked++
    }
    metrics.readers.ocr_reads += Array.isArray(part.ocr) ? part.ocr.length : 0
    for (const read of part.ai_reads || []) {
      metrics.readers.ai_reads++
      if (Object.hasOwn(metrics.readers.by_agreement, read.agreement)) metrics.readers.by_agreement[read.agreement]++
      if (read.result?.part_number === null) metrics.readers.ai_declined_to_guess++
    }
    metrics.seller_edits += (part.history || []).filter((entry) => entry.by === 'seller').length
  }
  res.json(metrics)
})

export default router
