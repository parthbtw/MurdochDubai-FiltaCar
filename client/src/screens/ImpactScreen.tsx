import { formatTime } from '@/domain/time'
import { useMetrics } from '@/api/queries'
import type { Agreement, Metrics } from '@/api/types'
import { PhoneScreen } from '@/components/PhoneScreen'
import { ErrorBlock, LoadingRows } from '@/components/BlockState'
import { RecordedText } from '@/components/ArabicText'

const readerLabels: [Agreement, string][] = [
  ['agree', 'Both readers agree'], ['disagree', 'Readers disagree'], ['ai_only', 'AI reader only'], ['tesseract_only', 'Offline reader only'], ['neither', 'Neither reader found a number'],
]
function TimeEvidence({ metrics }: { metrics: Metrics }) {
  const time = metrics.time_estimate
  return <section className="mt-5" aria-labelledby="time-heading"><h2 id="time-heading" className="group-heading">Time</h2><div className="group p-4">
    <p className="text-footnote text-muted-foreground">Source: {time.source === 'assumption' ? 'assumption' : 'measured'}</p>
    {time.source === 'assumption' ? <p className="mt-2">Assumption for illustration, not measured: about {time.manual_minutes_per_listing} minutes by hand and {time.filtacar_minutes_per_listing} minutes with FiltaCar per listing.</p> : <><p className="mt-2">Manual baseline: {time.manual_minutes_per_listing} minutes per listing. Median elapsed creation to approval: {time.filtacar_minutes_per_listing} minutes per listing.</p><p className="mt-2 text-footnote">Elapsed time is not active working time.</p></>}
    <RecordedText text={time.basis} className="mt-2 text-footnote text-muted-foreground" />
    {metrics.baseline && <div className="mt-4"><p>Manual baseline: {metrics.baseline.minutes_per_listing} minutes per listing.</p><RecordedText text={`Method: ${metrics.baseline.method}`} className="mt-2 text-footnote" /><p className="mt-1 text-footnote">Measured on {formatTime(metrics.baseline.measured_on)}</p></div>}
    <p className="mt-3 text-footnote">Approvals with timing: {metrics.measured.approved_with_timing}</p><p className="mt-1 text-footnote">Median elapsed creation to approval: {metrics.measured.median_minutes_to_approval == null ? 'Not measured' : `${metrics.measured.median_minutes_to_approval} minutes`}</p>
  </div></section>
}
export function ImpactScreen() {
  const query = useMetrics()
  const metrics = query.data
  const figures = metrics ? [
    ['Parts', metrics.parts_total], ['Approved', metrics.approved], ['Facts with a source', metrics.facts_with_sources], ['Open questions', metrics.questions_open],
    ['Missing details', metrics.missing_open], ['Conflicts', metrics.conflicts_open], ['Claims blocked', metrics.claims_blocked], ['AI declined to guess', metrics.readers.ai_declined_to_guess], ['Seller field edits', metrics.seller_field_edits],
  ] as const : []
  const largest = metrics ? Math.max(1, ...Object.values(metrics.readers.by_agreement)) : 1
  return <PhoneScreen title="Impact"><p className="mt-2 text-title-3">What did FiltaCar catch, and what could it save?</p>
    {query.isPending ? <div className="mt-4"><LoadingRows label="Loading impact" /></div> : query.isError ? <div className="mt-4"><ErrorBlock error={query.error} retry={() => void query.refetch()} /></div> : metrics && <>
      <p className="mt-4 font-semibold">{metrics.claims_blocked} claims blocked and {metrics.conflicts_open} conflicts caught across {metrics.parts_total} parts.</p>
      {metrics.parts_total === 0 && <p className="mt-2 text-muted-foreground">No parts recorded. Counts below are the returned totals.</p>}
      <dl className="impact-figures mt-5">{figures.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className={value === 0 ? 'text-muted-foreground' : undefined}>{value ?? 'Not recorded'}</dd></div>)}</dl>
      <section className="mt-5" aria-labelledby="readers-heading"><h2 id="readers-heading" className="group-heading">Readers</h2><ul className="group p-4 reader-bars">{readerLabels.map(([key, label]) => {
        const count = metrics.readers.by_agreement[key]
        return <li key={key} aria-label={`${label}: ${count}`} className={count === 0 ? 'reader-zero' : undefined}><span className="text-sm">{label}</span><span className="reader-count">{count}</span><div className="reader-track" aria-hidden="true"><div className="reader-bar" style={{ inlineSize: `${count / largest * 100}%` }} /></div></li>
      })}</ul><p className="mt-2 text-footnote text-muted-foreground">Saved readings by agreement. Counts reflect the readings, including repeat readings.</p></section>
      <TimeEvidence metrics={metrics} />
    </>}
  </PhoneScreen>
}
