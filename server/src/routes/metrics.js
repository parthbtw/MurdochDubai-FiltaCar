import { Router } from 'express'
import { readParts, readJson, DATA_DIR } from '../store.js'
import path from 'node:path'
import { MANUAL_MINUTES_PER_LISTING, FILTACAR_MINUTES_PER_LISTING } from '../config.js'

const router = Router()

function baselineFor() {
  let baseline
  try {
    baseline = readJson(path.join(DATA_DIR, 'manual_baseline.json'))
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null
    throw error
  }
  if (!baseline || typeof baseline.parts !== 'number' || !Number.isFinite(baseline.parts) || baseline.parts <= 0 ||
    typeof baseline.total_minutes !== 'number' || !Number.isFinite(baseline.total_minutes) || baseline.total_minutes < 0 ||
    typeof baseline.measured_on !== 'string' || !baseline.measured_on.trim() ||
    typeof baseline.method !== 'string' || !baseline.method.trim()) return null
  return { minutes_per_listing: baseline.total_minutes / baseline.parts, measured_on: baseline.measured_on, method: baseline.method }
}

router.get('/', (req, res) => {
  const parts = readParts().filter(part => req.query.seller_id === undefined || part.seller_id === req.query.seller_id)
  const timings = []
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
    seller_field_edits: 0,
    measured: { approved_with_timing: 0, median_minutes_to_approval: null },
    time_estimate: {
      source: 'assumption',
      manual_minutes_per_listing: MANUAL_MINUTES_PER_LISTING,
      filtacar_minutes_per_listing: FILTACAR_MINUTES_PER_LISTING,
      basis: 'assumption for illustration, not measured',
    },
  }
  for (const part of parts) {
    if (part.seller_approval?.approved === true) metrics.approved++
    if (typeof part.created_at === 'string' && typeof part.seller_approval?.approved_at === 'string') {
      const start = Date.parse(part.created_at)
      const end = Date.parse(part.seller_approval.approved_at)
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) timings.push((end - start) / 60000)
    }
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
    metrics.seller_field_edits += (part.history || []).filter((entry) => entry.by === 'seller' && entry.field !== 'seller_approval').length
    metrics.seller_edits += (part.history || []).filter((entry) => entry.by === 'seller').length
  }
  timings.sort((a, b) => a - b)
  metrics.measured.approved_with_timing = timings.length
  if (timings.length) {
    const middle = Math.floor(timings.length / 2)
    metrics.measured.median_minutes_to_approval = timings.length % 2
      ? timings[middle] : (timings[middle - 1] + timings[middle]) / 2
  }
  const baseline = baselineFor()
  if (baseline) metrics.baseline = baseline
  if (baseline && timings.length) {
    metrics.time_estimate = {
      manual_minutes_per_listing: baseline.minutes_per_listing,
      filtacar_minutes_per_listing: metrics.measured.median_minutes_to_approval,
      source: 'measured',
      basis: 'manual baseline and median recorded creation-to-approval elapsed time; not active working time',
    }
  }
  res.json(metrics)
})

export default router
