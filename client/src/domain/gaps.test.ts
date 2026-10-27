import { expect, it } from 'vitest'
import type { Gap } from '@/api/types'
import { formatGap } from './gaps'
import { approvalReasons } from './approval'
import { part } from '@/test/fixtures'

const missing: Gap = { field: 'donor_vehicle.year', type: 'missing', detail: 'missing from the spreadsheet', sources: ['spreadsheet'] }

it('formats a field and capitalized detail as one sentence without generic missing wording', () => {
  expect(formatGap(missing)).toBe('Donor year: Missing from the spreadsheet.')
  expect(formatGap({ ...missing, detail: ' Information missing. Information missing. missing from the spreadsheet. ' })).toBe('Donor year: Missing from the spreadsheet.')
  expect(formatGap({ ...missing, detail: 'Information missing from the spreadsheet.' })).toBe('Donor year: Missing from the spreadsheet.')
})

it('preserves conflict values and joins sentences without inventing facts', () => {
  const conflict: Gap = { ...missing, type: 'conflict', detail: 'record says 2018. Please check the note for 2015.' }
  expect(formatGap(conflict)).toBe('Donor year: Record says 2018; Please check the note for 2015.')
  expect(formatGap({ ...missing, field: 'weight_kg', detail: 'recorded as 1.5 kg.' })).toBe('Packaged weight, kg: Recorded as 1.5 kg.')
})

it('keeps claim reasons and supplies only the gap type when no detail is recorded', () => {
  expect(formatGap({ ...missing, type: 'cannot_claim', detail: 'Cannot claim: subjective condition; describe the actual condition instead' })).toBe('Donor year: Cannot claim: subjective condition; describe the actual condition instead.')
  expect(formatGap({ ...missing, detail: '' })).toBe('Donor year: Missing.')
  expect(formatGap({ ...missing, type: 'conflict', detail: '' })).toBe('Donor year: Sources disagree.')
})

it('uses the same sentences for approval and keeps specialist blockers without blocking claims alone', () => {
  expect(approvalReasons({ ...part, readiness_status: 'specialist_review_required', gaps_and_conflicts: [missing] })).toEqual(['Specialist review required.', 'Donor year: Missing from the spreadsheet.'])
  expect(approvalReasons({ ...part, readiness_status: 'ready_for_review', gaps_and_conflicts: [{ ...missing, type: 'cannot_claim' }] })).toEqual([])
})
