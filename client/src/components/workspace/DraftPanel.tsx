import { formatGap } from '@/domain/gaps'
import { sourceTitle } from '@/domain/sources'
import { useQuery } from '@tanstack/react-query'
import type { PartRecord } from '@/api/types'
import { ApiError } from '@/api/client'
import { getCompatibility } from '@/api/endpoints'
import { retryApi } from '@/api/queries'
import { ArabicText, RecordedText } from '@/components/ArabicText'
import { GuidanceText, LabelTag } from '@/components/LabelTag'
import { PartTitle } from '@/components/PartTitle'
import { confirmedPartNumber } from '@/domain/workspace'
import { isArabic } from '@/domain/text'
import { SourceLine } from './SourceLine'
import { WorkspaceSection } from './WorkspaceSection'

function ReferenceNotes({ record }: { record: PartRecord }) {
  const number = confirmedPartNumber(record)
  const reference = useQuery({ queryKey: ['compatibility', number], queryFn: () => getCompatibility(number!), enabled: Boolean(number), retry: retryApi, staleTime: 60_000 })
  if (!number) return <p className="mt-3 text-sm text-muted-foreground">Confirm the part number before checking reference notes.</p>
  return <div className="mt-4"><p className="text-footnote font-semibold">Synthetic reference catalogue, test data, not verified</p>
    {reference.isPending ? <p className="mt-2 text-sm">Loading reference notes...</p> : reference.isError ? <p role={reference.error instanceof ApiError && reference.error.status === 404 ? undefined : 'alert'} className="mt-2 text-sm">{reference.error instanceof ApiError && reference.error.status === 404 ? 'No reference entry for this part number.' : `Reference notes could not be loaded. ${reference.error.message}`}</p> : <><RecordedText text={reference.data.region_notes ?? ''} className="mt-2 text-sm" /><p className="mt-2 text-footnote text-muted-foreground">Source: {reference.data.source}</p></>}
  </div>
}

export function ClaimGuard({ record }: { record: PartRecord }) {
  const claims = record.draft?.blocked_claims ?? []
  const gaps = record.gaps_and_conflicts.filter(gap => gap.type === 'cannot_claim')
  return <div className="p-4 border-t"><h3 className="font-semibold">Claim guard</h3>
    {(claims.length > 0 || gaps.length > 0) && <p className="mt-2 text-sm">We removed these words because they cannot be claimed</p>}
    {claims.length || gaps.length ? <ul className="mt-3 space-y-4">{claims.map((claim, index) => <li key={index}>
      {isArabic(claim.phrase) ? <ArabicText><del aria-describedby={`claim-${record.item_id}-${index}`}>{claim.phrase}</del></ArabicText> : <p><del aria-describedby={`claim-${record.item_id}-${index}`}>{claim.phrase}</del></p>}
      <RecordedText text={claim.reason} className="mt-1 text-sm text-muted-foreground" /><span id={`claim-${record.item_id}-${index}`} className="sr-only">{claim.reason}</span>
    </li>)}{gaps.map((gap, index) => <li key={`gap-${index}`}><RecordedText text={formatGap(gap)} className="mt-1 text-sm" /><p className="mt-1 text-footnote text-muted-foreground">Sources: {gap.sources.map(sourceTitle).join('; ') || 'No source recorded'}</p></li>)}</ul> : <p className="mt-2 text-sm">No blocked claims recorded.</p>}
    <SourceLine record={record} path="draft.blocked_claims" />
  </div>
}

export function DraftPanel({ record, expanded = false }: { record: PartRecord; expanded?: boolean }) {
  const draft = record.draft
  const labels = record.corridor ? [record.corridor.uk_side_wording.label, record.corridor.drive_side_warning.label, record.corridor.shipping.label, record.corridor.packing_alert.label] : []
  return <WorkspaceSection title="Listing draft" summary={draft ? 'Draft, not published' : 'No draft yet'} expanded={expanded}>
    {draft ? <><div className="p-4"><LabelTag label="Draft, not published" /><h3 className="mt-3 text-footnote text-muted-foreground">Title</h3>
      <PartTitle text={draft.title} partNumber={record.part_details.part_number.extracted_value} className="mt-1 text-title-3 font-semibold" />
      <p className="mt-2 text-footnote tabular-nums">{Array.from(draft.title).length} / 80 characters</p><SourceLine record={record} path="draft.title" />
      <h3 className="mt-4 font-semibold">Description</h3>{draft.description.split(/\n\s*\n/).map((paragraph, index) => <p key={index} className="mt-3 whitespace-pre-line"><GuidanceText text={paragraph} labels={labels} /></p>)}
      <SourceLine record={record} path="draft.description" />
      <h3 className="mt-4 font-semibold">Item specifics</h3><dl className="mt-2 specifics-list">{Object.entries(draft.item_specifics).map(([key, value]) => <div key={key}><dt>{key}</dt><dd><GuidanceText text={value} labels={labels} /></dd></div>)}</dl>
      <SourceLine record={record} path="draft.item_specifics" />
      <h3 className="mt-4 font-semibold">In the test reference catalogue</h3>{draft.compatibility.supported.length ? <ul className="mt-2 space-y-2">{draft.compatibility.supported.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="mt-2 text-sm">No supported entries recorded.</p>}
      <h3 className="mt-4 font-semibold">Not verified</h3>{draft.compatibility.unverified.length ? <ul className="mt-2 space-y-2">{draft.compatibility.unverified.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="mt-2 text-sm">No unverified entries recorded.</p>}
      <p className="mt-3 text-sm">{draft.compatibility.note}</p><SourceLine record={record} path="draft.compatibility" />
      <ReferenceNotes record={record} />
    </div><ClaimGuard record={record} /></> : <><p className="p-4">No draft yet. FiltaCar writes one after the checks run.</p><ClaimGuard record={record} /></>}
  </WorkspaceSection>
}
