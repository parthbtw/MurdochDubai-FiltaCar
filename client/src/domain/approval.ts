import type { PartRecord } from '@/api/types'
import { fieldLabel } from './fields'

export function approvalReasons(record: PartRecord): string[] {
  return [...(record.readiness_status === 'specialist_review_required' ? ['Specialist review required.'] : []), ...record.gaps_and_conflicts.filter(gap => gap.type === 'missing' || gap.type === 'conflict').map(gap => `${fieldLabel(gap.field)}: ${gap.type === 'missing' ? 'Information missing' : 'Sources disagree'}. ${gap.detail}`)]
}
