import type { PartRecord } from '@/api/types'
export function gapsFor(record: Pick<PartRecord, 'gaps_and_conflicts'>, path: string) {
  return record.gaps_and_conflicts.filter(gap => gap.field === path || path.startsWith(`${gap.field}.`))
}
