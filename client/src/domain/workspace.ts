import type { ActionRequired, PartRecord } from '@/api/types'
import { newestOcrFor, photoUrl } from './photos'

export const sortedActions = (actions: ActionRequired[]) => [...actions].sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.priority - b.priority)
export const factId = (path: string) => `fact-${path}`

export function confirmedPartNumber(record: PartRecord): string | null {
  const number = record.part_details.part_number
  if (!number.extracted_value || number.requires_manual_verification || record.gaps_and_conflicts.some(gap => gap.type !== 'cannot_claim' && gap.field.startsWith('part_details.part_number'))) return null
  return number.extracted_value
}

export function readerPhotos(record: PartRecord) {
  return [...new Set([...record.photos, ...(record.ocr ?? []).map(read => read.photo), ...(record.ai_reads ?? []).map(read => read.photo)].map(photoUrl))].filter(photo =>
    newestOcrFor(record, photo) || record.ai_reads?.some(read => photoUrl(read.photo) === photo))
}

export function newestAiFor(record: PartRecord, photo: string) {
  return [...(record.ai_reads ?? [])].reverse().filter(read => photoUrl(read.photo) === photoUrl(photo)).sort((a, b) => Date.parse(b.read_at) - Date.parse(a.read_at))[0] ?? null
}

export const agreementText = {
  agree: 'Both readers found the same number',
  disagree: 'The readers found different numbers. You decide.',
  ai_only: 'Only CodeBuddy AI found a number. It stays a suggestion until you confirm it.',
  tesseract_only: 'Only the offline reader found a number.',
  neither: 'Neither reader could read a number. Type it from the photo.',
} as const

export function historyValue(value: unknown): string {
  if (value == null) return 'Not recorded'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function recordFacts(value: unknown, prefix = ''): { path: string; value: unknown }[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.entries(value).flatMap(([key, child]) =>
    key === 'field_sources' ? [] : recordFacts(child, prefix ? `${prefix}.${key}` : key))
  if (Array.isArray(value) && value.some(child => child && typeof child === 'object')) return value.flatMap((child, index) => recordFacts(child, `${prefix}.${index}`))
  return [{ path: prefix, value: Array.isArray(value) ? value.length ? value.join('; ') : 'None recorded' : value }]
}
