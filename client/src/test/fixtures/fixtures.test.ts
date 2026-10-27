import { expect, it } from 'vitest'
import { aiStatus, exportPreview, metrics, part, parts, questionPack, specialist } from './index'

it('keeps the captured response shapes and source dictionaries honest', () => {
  expect(parts).toHaveLength(10)
  expect(parts.map(record => record.item_id)).toContain(part.item_id)
  expect(specialist.item_id).toBe('MIR-0010')
  for (const record of parts) {
    for (const label of Object.values(record.field_sources)) expect(typeof label).toBe('string')
    expect(['ready_for_review', 'information_missing', 'specialist_review_required']).toContain(record.readiness_status)
    expect(record.created_at).toBeUndefined()
  }
  expect(metrics.parts_total).toBe(parts.length)
  expect(questionPack.questions_count).toBe(part.questions.length)
  expect(exportPreview.excluded).toHaveLength(parts.length)
  expect(aiStatus.reason === null || aiStatus.reason === undefined || typeof aiStatus.reason === 'string').toBe(true)
})
