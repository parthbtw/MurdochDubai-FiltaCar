import { expect, it } from 'vitest'
import { part, part0004, part0005, part0009, putYear, putNumber, approvedPart, afterApprovalEdit, approveMissingError, approveSpecialistError, aiReadPart, aiStatusNow } from '@/test/fixtures'
import { compareRecords } from './ripple'
import { approvalReasons } from './approval'
import { editableFields, editorFor, fieldLabel, fieldPatch, validateField } from './fields'
import { classifySource } from './sources'

it('uses all eight captured response fixtures with the expected shapes', () => {
  expect(putYear.item_id).toBe('MIR-0007')
  expect(putNumber.item_id).toBe('MIR-0004')
  expect(approvedPart.seller_approval.approved).toBe(true)
  expect(afterApprovalEdit.seller_approval.approved).toBe(false)
  expect(approveMissingError.gaps_and_conflicts).toHaveLength(4)
  expect(approveSpecialistError.error).toBe('cannot approve: specialist review required')
  expect(aiReadPart.ai_reads?.at(-1)?.mode).toBe('live')
  expect(typeof aiStatusNow.available).toBe('boolean')
})
it('compares the captured year correction, readiness, gaps, questions, draft and checklist', () => {
  const original = JSON.stringify(part)
  const ripple = compareRecords(part, putYear)
  expect(ripple.readiness).toEqual({ before: 'information_missing', after: 'ready_for_review' })
  expect(ripple.gaps.resolved).toContainEqual(expect.objectContaining({ field: 'donor_vehicle.year', type: 'conflict' }))
  expect(ripple.changedFields).toContain('donor_vehicle.year')
  expect(ripple.questions.resolved.some(question => question.field === 'donor_vehicle.year')).toBe(true)
  expect(ripple.actions.resolved.some(action => action.field === 'donor_vehicle.year')).toBe(true)
  expect(ripple.description.resolved.length).toBeGreaterThan(0)
  expect(ripple.description.added.length).toBeGreaterThan(0)
  expect(JSON.stringify(part)).toBe(original)
})
it('detects withdrawal from the approved fixture and its recorded system history', () => {
  expect(compareRecords(approvedPart, afterApprovalEdit).approvalWithdrawn).toBe(true)
  expect(compareRecords(approvedPart, afterApprovalEdit).changedFields).toEqual(['storage_location'])
  expect(afterApprovalEdit.history.at(-1)?.by).toBe('system: changed after approval')
})
it('handles a missing corridor before or after the change without inventing checklist transitions', () => {
  const withoutBefore = compareRecords({ ...part, corridor: null }, putYear)
  const withoutAfter = compareRecords(part, { ...putYear, corridor: null })
  for (const ripple of [withoutBefore, withoutAfter]) {
    expect(ripple.checklist).toEqual([])
    expect(ripple.readiness).toEqual({ before: 'information_missing', after: 'ready_for_review' })
    expect(ripple.gaps.resolved).toContainEqual(expect.objectContaining({ field: 'donor_vehicle.year', type: 'conflict' }))
  }
  expect(compareRecords({ ...part, corridor: null }, { ...putYear, corridor: null }).checklist).toEqual([])
})
it('compares missing part number resolution and does not invent changes for an identical record', () => {
  expect(compareRecords(part0004, putNumber).gaps.resolved.some(gap => gap.field.includes('part_number'))).toBe(true)
  const ripple = compareRecords(part, part)
  expect(ripple.changedFields).toEqual([])
  expect(ripple.readiness).toBeNull()
  expect(ripple.checklist).toEqual([])
})
it('blocks only specialist readiness and missing or conflict gaps', () => {
  expect(approvalReasons(part0009)).toContain('Specialist review required.')
  expect(approvalReasons(part0005).length).toBeGreaterThan(0)
  expect(approvalReasons(putYear)).toEqual([])
})
it('normalizes numbers and makes only the requested nested patch', () => {
  expect(fieldPatch(editorFor('part_details.part_number')!, ' sbm - 7943 - ac15 ')).toEqual({ part_details: { part_number: { extracted_value: 'SBM-7943-AC15' } } })
  expect(fieldPatch(editorFor('donor_vehicle.year')!, '2015')).toEqual({ donor_vehicle: { year: 2015 } })
  expect(fieldPatch(editorFor('packaged_dimensions_cm.width')!, '12.5')).toEqual({ packaged_dimensions_cm: { width: 12.5 } })
})
it('validates years, numeric measurements, choices, lists and part number groups', () => {
  expect(validateField(editorFor('donor_vehicle.year')!, '1949', 2026)).toBeTruthy()
  expect(validateField(editorFor('donor_vehicle.year')!, '2028', 2026)).toBeTruthy()
  expect(validateField(editorFor('donor_vehicle.year')!, '2027', 2026)).toBeNull()
  for (const path of ['weight_kg', 'packaged_dimensions_cm.length', 'packaged_dimensions_cm.width', 'packaged_dimensions_cm.height']) {
    for (const input of ['0', '-2', 'Infinity', 'a', '']) expect(validateField(editorFor(path)!, input)).toBe('Enter a positive number.')
    expect(validateField(editorFor(path)!, '1.25')).toBeNull()
  }
  expect(validateField(editorFor('part_details.part_number')!, 'SBM--A')).toBeNull()
  expect(fieldPatch(editorFor('part_details.part_number')!, 'sbm __ 7944--pj14')).toEqual({ part_details: { part_number: { extracted_value: 'SBM-7944-PJ14' } } })
  expect(validateField(editorFor('part_details.part_number')!, 'SBM--?A')).toBeTruthy()
  expect(validateField(editorFor('part_details.part_number')!, 'sbm - a1')).toBeNull()
  expect(validateField(editorFor('part_details.placement')!, 'Front')).toBeTruthy()
  expect(validateField(editorFor('included_components')!, '')).toBeTruthy()
  expect(fieldPatch(editorFor('condition.cosmetic_damage')!, ' scratch\n crack ')).toEqual({ condition: { cosmetic_damage: ['scratch', 'crack'] } })
  expect(editableFields).toHaveLength(15)
})
it('uses shared human field and computed source titles', () => {
  expect(fieldLabel('item_id')).toBe('Item ID')
  expect(fieldLabel('original_title_ar')).toBe('Original Arabic title')
  expect(classifySource('runChecks').title).toBe("Worked out by FiltaCar's checks")
})
