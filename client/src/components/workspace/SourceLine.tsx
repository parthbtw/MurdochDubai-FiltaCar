import type { PartRecord } from '@/api/types'
import { sourceFor } from '@/domain/fieldSource'

export function SourceLine({ record, path }: { record: PartRecord; path: string }) {
  return <p className="mt-2 text-footnote text-muted-foreground">Source: {sourceFor(record, path) ?? 'No source recorded'}</p>
}
