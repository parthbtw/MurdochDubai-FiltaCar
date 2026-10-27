import type { PartRecord } from '@/api/types'
import { formatGap } from './gaps'

export function approvalReasons(record: PartRecord): string[] {
  return [...(record.readiness_status === 'specialist_review_required' ? ['Specialist review required.'] : []), ...record.gaps_and_conflicts.filter(gap => gap.type === 'missing' || gap.type === 'conflict').map(formatGap)]
}
