import type { ReactNode } from 'react'
import type { PartRecord } from '@/api/types'
import { RecordedText } from '@/components/ArabicText'
import type { TraceField } from '@/components/SourceSheet'
import { sourceFor } from '@/domain/fieldSource'
import { gapsFor } from '@/domain/gaps'
import { displayValue } from '@/domain/text'
import { cn } from '@/lib/utils'
import { ClaimText } from './ClaimText'
import { Button } from './ui/button'
import { Link } from 'react-router-dom'
import { sourceTitle } from '@/domain/sources'
import { factId } from '@/domain/workspace'

export function FactCell({ record, path, label, value, note, mono = false, traceLabel = label, onTrace, onEdit, changed = false }: {
  record: PartRecord; path: string; label: string; value: unknown; note?: ReactNode
  mono?: boolean; traceLabel?: string; onEdit?: () => void; changed?: boolean; onTrace: (field: TraceField) => void
}) {
  const source = sourceFor(record, path)
  const gaps = gapsFor(record, path)
  const values = Array.isArray(value) ? value.length ? value : ['None reported'] : [displayValue(value)]
  return <div className={cn('fact-cell grid grid-cols-[minmax(0,1fr)_auto]', changed && 'fact-changed')} id={factId(path)} tabIndex={-1}>
    <button className="pressable block min-h-11 min-w-0 flex-1 px-4 py-3 text-start" aria-label={`Source for ${traceLabel.toLowerCase()}: ${source ?? 'No source recorded'}`} onClick={event => onTrace({ path, label: traceLabel, trigger: event.currentTarget })}>
      <span className="block text-footnote text-muted-foreground">{label}</span>
      {values.map((text, index) => (path === 'original_title_ar' || path === 'notes_ar')
        ? <ClaimText key={index} text={displayValue(text)} claims={record.draft?.blocked_claims ?? []} className="mt-1 break-words text-base" />
        : <RecordedText key={index} text={displayValue(text)} className={cn('mt-1 break-words text-base', mono && 'font-mono')} />)}
      {gaps.map((gap, index) => <div key={index} className={cn('mt-2 text-sm', gap.type === 'conflict' ? 'text-danger' : gap.type === 'missing' ? 'text-warning' : 'text-muted-foreground')}>
        <span className="font-semibold">{gap.type === 'cannot_claim' ? <><span aria-hidden="true" className="line-through">Claim</span> Cannot claim</> : gap.type === 'conflict' ? 'Conflict' : 'Missing'}</span>
        <RecordedText text={gap.detail} className="mt-1" />
        {gap.sources.length > 0 && <p className="mt-1 text-footnote">Sources: {gap.sources.map(sourceTitle).join('; ')}</p>}
      </div>)}
      <span className="source-chip mt-1"><span className="source-chip-label">{source ?? 'No source recorded'}</span></span>
    </button>
    {onEdit && <Button variant="ghost" className="col-start-2 row-start-1 me-2 mt-1 shrink-0 text-accent" onClick={onEdit} aria-label={`Edit ${traceLabel.toLowerCase()}`}>Edit</Button>}
    {path === 'part_details.part_number.extracted_value' && (!record.part_details.part_number.extracted_value || record.part_details.part_number.requires_manual_verification) && <Link className="pressable col-span-full flex min-h-11 items-center px-4 pb-2 font-semibold" to={`/parts/${encodeURIComponent(record.item_id)}/label`}>Check label</Link>}
    {note && <div className="col-span-full px-4 pb-3 text-footnote text-muted-foreground">{note}</div>}
  </div>
}
