import type { PartRecord } from '@/api/types'

export function sourceFor(record: Pick<PartRecord, 'field_sources'>, path: string): string | null {
  let current = path
  while (current) {
    const source = record.field_sources[current]
    if (source?.trim()) return source
    const parent = current.lastIndexOf('.')
    if (parent < 0) break
    current = current.slice(0, parent)
  }
  return null
}
