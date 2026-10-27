import { formatTime } from './time'
import type { PartRecord, Readiness } from '@/api/types'
export const readiness: Record<Readiness, { label: string; short: string; tone: 'ready' | 'warning' | 'danger' }> = {
  ready_for_review: { label: 'Ready for review', short: 'Ready', tone: 'ready' },
  information_missing: { label: 'Information missing', short: 'Missing', tone: 'warning' },
  specialist_review_required: { label: 'Specialist review required', short: 'Specialist', tone: 'danger' },
}
export const lanes = Object.keys(readiness) as Readiness[]
export function readinessCounts(parts: Pick<PartRecord, 'readiness_status'>[]) {
  return parts.reduce<Record<Readiness, number>>((counts, part) => {
    counts[part.readiness_status] += 1
    return counts
  }, { ready_for_review: 0, information_missing: 0, specialist_review_required: 0 })
}
export const firstBlockingAction = (part: PartRecord) => [...part.actions_required].filter(action => action.blocking).sort((a, b) => a.priority - b.priority)[0] ?? null
export function queueFinding(parts: PartRecord[]): string {
  const missing = parts.filter(part => part.readiness_status === 'information_missing')
  if (!missing.length) return 'No parts are waiting for missing information.'
  const fields = new Map<string, number>()
  missing.forEach(part => new Set(part.actions_required.filter(action => action.blocking).map(action => action.field)).forEach(field => fields.set(field, (fields.get(field) ?? 0) + 1)))
  const common = [...fields].sort((a, b) => b[1] - a[1])[0]?.[0]
  const names: Record<string, string> = { 'part_details.part_number': 'part number', 'part_details.part_number.extracted_value': 'part number', 'donor_vehicle.year': 'donor year', 'condition.testing_status': 'testing status', weight_kg: 'packaged weight', packaged_dimensions_cm: 'package measurements', included_components: 'included components' }
  return `${missing.length} ${missing.length === 1 ? 'part needs' : 'parts need'} information from you.${common ? ` Most common blocker: ${names[common] ?? common.replaceAll('_', ' ')}.` : ''}`
}
export function approvalText(part: PartRecord): string {
  if (!part.seller_approval.approved) return 'Not approved yet'
  const date = part.seller_approval.approved_at
  return date ? `Approved by the seller on ${formatTime(date)}` : 'Approved by the seller. Date not recorded'
}
