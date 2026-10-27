import { formatGap } from '@/domain/gaps'
import { fieldLabel } from '@/domain/fields'
import { formatTime } from '@/domain/time'
import { sourceTitle } from '@/domain/sources'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePart } from '@/api/queries'
import { ErrorBlock, LoadingRows } from '@/components/BlockState'
import { PhoneScreen } from '@/components/PhoneScreen'
import { StatusPill } from '@/components/StatusPill'
import { RecordedText } from '@/components/ArabicText'
import { ClaimText } from '@/components/ClaimText'
import { GuidanceText } from '@/components/LabelTag'
import { Button } from '@/components/ui/button'
import { WorkspaceSection } from '@/components/workspace/WorkspaceSection'
import { QuestionsContent } from '@/components/workspace/QuestionsPanel'
import { DraftPanel } from '@/components/workspace/DraftPanel'
import { CorridorPanel } from '@/components/workspace/CorridorPanel'
import { ReadersPanel } from '@/components/workspace/ReadersPanel'
import { PhotoQualityPanel } from '@/components/workspace/PhotoQualityPanel'
import { ApprovalPanel } from '@/components/workspace/ApprovalPanel'
import { SourceLine } from '@/components/workspace/SourceLine'
import { approvalText } from '@/domain/readiness'
import { recordFacts } from '@/domain/workspace'
import { displayValue, isArabic } from '@/domain/text'

export function EvidenceScreen() {
  const { id = '' } = useParams()
  const part = usePart(id)
  const [generatedAt] = useState(() => new Date().toISOString())
  const record = part.data
  const labels = record?.corridor ? [record.corridor.uk_side_wording.label, record.corridor.drive_side_warning.label, record.corridor.shipping.label, record.corridor.packing_alert.label] : []
  return <PhoneScreen title={id} detail backTo={`/parts/${encodeURIComponent(id)}`} backLabel={id}>
    {part.isPending ? <LoadingRows label="Loading evidence" /> : part.isError ? <ErrorBlock error={part.error} retry={() => void part.refetch()} /> : record && <article className="evidence-page">
      <div className="mt-3"><h2 className="text-title-2 font-semibold">Evidence</h2><div className="mt-3"><StatusPill status={record.readiness_status} /></div><p className="mt-2">{approvalText(record)}</p><p className="mt-2 text-footnote text-muted-foreground">Generated <time dateTime={generatedAt}>{formatTime(generatedAt)}</time></p><p className="mt-1 text-footnote text-muted-foreground">Generated time is the time this evidence page was opened.</p><Button className="mt-4 w-full no-print" onClick={() => window.print()}>Print or save as PDF</Button></div>
      <WorkspaceSection title="Facts and sources" summary="Every returned fact" expanded><dl className="divided-list">{recordFacts(record).map(fact => <div className="p-4" key={fact.path}>
        <dt className="break-words text-footnote text-muted-foreground">{fieldLabel(fact.path)}</dt><dd className="mt-1 break-words">{fact.path === 'original_title_ar' || fact.path === 'notes_ar' ? <ClaimText text={displayValue(fact.value)} claims={record.draft?.blocked_claims ?? []} /> : isArabic(displayValue(fact.value)) ? <RecordedText text={displayValue(fact.value)} /> : <p className="whitespace-pre-wrap"><GuidanceText text={displayValue(fact.value)} labels={labels} /></p>}<SourceLine record={record} path={fact.path} /></dd>
      </div>)}</dl></WorkspaceSection>
      <WorkspaceSection title="Gaps and conflicts" summary={`${record.gaps_and_conflicts.length} recorded gaps`} expanded>
        {record.gaps_and_conflicts.length ? <ul className="divided-list">{record.gaps_and_conflicts.map((gap, index) => <li key={index} className="p-4"><RecordedText text={formatGap(gap)} className="mt-2" /><p className="mt-2 text-footnote text-muted-foreground">Sources: {gap.sources.map(sourceTitle).join('; ') || 'No source recorded'}</p><SourceLine record={record} path="gaps_and_conflicts" /></li>)}</ul> : <p className="p-4">No gaps or conflicts recorded.</p>}
      </WorkspaceSection>
      <ReadersPanel record={record} expanded />
      <WorkspaceSection title="Questions for the yard" summary={`${record.questions.length} open questions`} expanded><QuestionsContent record={record} /></WorkspaceSection>
      <DraftPanel record={record} expanded />
      <CorridorPanel record={record} expanded />
      <PhotoQualityPanel record={record} expanded />
      <ApprovalPanel record={record} expanded />
      <footer className="mt-5 text-footnote">Synthetic demo data. FiltaCar prepares drafts; the seller approves; nothing is published.</footer>
    </article>}
  </PhoneScreen>
}
