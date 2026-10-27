import { describe, expect, it } from 'vitest'
import { part, parts } from '@/test/fixtures'
import { classifySource, type SourceKind } from './sources'
import { sourceFor } from './fieldSource'
import { gapsFor } from './gaps'
import { photoUrl, qualityFor } from './photos'
import { firstBlockingAction, queueFinding, readinessCounts } from './readiness'
import { isArabic, displayValue } from './text'

describe('source classification', () => {
  const labels: [string, SourceKind][] = [
    ['spreadsheet row 9', 'spreadsheet'], ['Arabic yard note', 'arabic_note'],
    ['translation of Arabic title', 'translation'], ['seller SKU label', 'seller_record'],
    ['seller register', 'seller_record'], ['vehicle registration photo', 'document_photo'],
    ['OCR photo 2', 'ocr'], ['upload OCR', 'ocr'], ['photo label', 'ocr'],
    ['build-time Tesseract', 'ocr'], ['CodeBuddy AI (build-time)', 'ai'],
    ['synthetic demo label', 'demo'], ['demo label', 'demo'], ['import validation', 'computed'],
    ['runChecks', 'computed'], ['seller edit', 'seller_edit'],
    ['spreadsheet row 2 (inventory.csv)', 'spreadsheet'], ['OCR + CodeBuddy AI agree (photo 1)', 'readers_agree'],
    ['CodeBuddy AI, confirmed by seller', 'ai_confirmed'],
    ['synthetic reference catalogue (test data, not verified)', 'reference'], ['Warehouse ticket', 'other'],
  ]
  it.each(labels)('%s has the correct kind and a human source title', (label, kind) => {
    expect(classifySource(label)).toMatchObject({ kind, title: kind === 'computed' ? "Worked out by FiltaCar's checks" : label })
    expect(classifySource(label).explanation).not.toBe('')
  })
  it('keeps parsed evidence coordinates', () => {
    expect(classifySource('spreadsheet row 2 (inventory.csv)')).toMatchObject({ row: 2, file: 'inventory.csv' })
    expect(classifySource('OCR photo 2')).toMatchObject({ photoNumber: 2, explanation: 'Read from photo 2 by the offline label reader' })
    expect(classifySource('Warehouse ticket').explanation).toBe('Warehouse ticket')
  })
})
it('resolves exact sources, nearest parent and null', () => {
  expect(sourceFor(part, 'donor_vehicle.year')).toBe('spreadsheet row 9')
  expect(sourceFor(part, 'packaged_dimensions_cm.length.value')).toBe('spreadsheet row 9')
  expect(sourceFor(part, 'not.recorded')).toBeNull()
  expect(sourceFor({ field_sources: { a: 'parent', 'a.b': 'nearest', 'a.b.c': 'exact' } }, 'a.b.c')).toBe('exact')
  expect(sourceFor({ field_sources: { a: 'parent', 'a.b': 'nearest' } }, 'a.b.c')).toBe('nearest')
})
it('matches exact and parent gaps, not sibling gaps', () => {
  expect(gapsFor(part, 'donor_vehicle.year')[0].type).toBe('conflict')
  expect(gapsFor(part, 'donor_vehicle.model')).toEqual([])
  const record = { gaps_and_conflicts: [{ field: 'dimensions', type: 'missing' as const, detail: 'Not recorded', sources: [] }] }
  expect(gapsFor(record, 'dimensions.length')).toHaveLength(1)
})
it('normalizes local photos and rejects remote image URLs', () => {
  expect(photoUrl('uploads/mir-0007-01.jpg')).toBe('/uploads/mir-0007-01.jpg')
  expect(photoUrl('/demo/labels/MIR-0007.png')).toBe('/demo/labels/MIR-0007.png')
  expect(photoUrl('https://filtacar.invalid/photo.png')).toBe('')
})
it('uses the newest OCR quality for the same photo', () => {
  const read = part.ocr![0]
  expect(qualityFor({ ocr: [{ ...read, read_at: '2026-01-02', quality: { sharpness: 1, blurry: true } }, { ...read, read_at: '2026-01-01' }] }, read.photo)).toEqual({ sharpness: 1, blurry: true })
  expect(qualityFor({ ocr: null }, read.photo)).toBeNull()
})
it('counts the real three readiness lanes', () => {
  expect(readinessCounts(parts)).toEqual({ ready_for_review: 3, information_missing: 5, specialist_review_required: 2 })
  expect(Object.values(readinessCounts([]))).toEqual([0, 0, 0])
})
it('finds the highest priority blocking action', () => {
  expect(firstBlockingAction(part)?.field).toBe('donor_vehicle.year')
  expect(firstBlockingAction(parts[0])).toBeNull()
})
it('computes the finding from the record list', () => {
  expect(queueFinding(parts)).toContain('5 parts need information from you.')
  expect(queueFinding([])).toBe('No parts are waiting for missing information.')
})
it('detects Arabic and does not mistake English identifiers', () => {
  expect(isArabic(part.original_title_ar!)).toBe(true)
  expect(isArabic('MIR-0007, 2018')).toBe(false)
  expect(isArabic('')).toBe(false)
})
it('keeps real zeros and unknown values distinct', () => {
  expect(displayValue(0)).toBe('0')
  expect(displayValue(null)).toBe('Not recorded')
  expect(displayValue(undefined)).toBe('Not recorded')
})
