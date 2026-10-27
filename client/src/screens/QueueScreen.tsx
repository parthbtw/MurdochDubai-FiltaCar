import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useMetrics, useParts } from '@/api/queries'
import type { PartRecord, Readiness } from '@/api/types'
import { ArabicText } from '@/components/ArabicText'
import { PartTitle } from '@/components/PartTitle'
import { ErrorBlock, LoadingRows } from '@/components/BlockState'
import { PhoneScreen } from '@/components/PhoneScreen'
import { LabelTag } from '@/components/LabelTag'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { approvalText, firstBlockingAction, lanes, queueFinding, readiness, readinessCounts } from '@/domain/readiness'
import { displayValue } from '@/domain/text'

function PartCell({ part, returnTo }: { part: PartRecord; returnTo: string }) {
  const action = firstBlockingAction(part)
  const donor = [part.donor_vehicle.make, part.donor_vehicle.model, part.donor_vehicle.year].filter(value => value != null && value !== '').join(' ')
  const side = part.corridor?.uk_side_wording
  return <li className="part-cell">
    <Link to={`/parts/${encodeURIComponent(part.item_id)}`} state={{ returnTo }} className="pressable block p-4" aria-label={`Review ${part.item_id}`}>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2"><p className="font-mono text-sm text-accent">{part.item_id}</p><ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" /></div>
          {!part.draft?.title && part.original_title_en && <p className="mt-1 text-xs text-muted-foreground">Original seller title, evidence only</p>}
          <PartTitle text={displayValue(part.draft?.title || part.original_title_en)} partNumber={part.part_details.part_number.extracted_value} className="mt-1 text-base font-semibold" />
          <p className="mt-1 text-footnote text-muted-foreground">Donor: {donor || 'Not recorded'}</p>
          {side?.value && <div className="mt-1 text-footnote text-muted-foreground"><p>UK side: {side.value}</p><LabelTag label={side.label} /></div>}
        </div>
      </div>
      {action && <div className="mt-3"><p className="text-sm">{action.action_en}</p><ArabicText className="mt-1">{action.action_ar}</ArabicText></div>}
      <p className="mt-3 text-footnote text-muted-foreground">{part.questions.length} open {part.questions.length === 1 ? 'question' : 'questions'}. {approvalText(part)}</p>
    </Link>
  </li>
}
function EvidenceMetrics() {
  const metrics = useMetrics()
  return <section className="mt-5" aria-labelledby="metrics-heading">
    <h2 id="metrics-heading" className="group-heading">Evidence summary</h2>
    {metrics.isPending ? <LoadingRows label="Loading evidence summary" /> : metrics.isError ? <ErrorBlock error={metrics.error} retry={() => void metrics.refetch()} /> : <div className="group p-4">
      <dl className="space-y-2 text-footnote">
        {[
          ['Facts with a source', metrics.data.facts_with_sources], ['Open questions', metrics.data.questions_open],
          ['Conflicts', metrics.data.conflicts_open], ['Claims blocked', metrics.data.claims_blocked],
          ['AI declined to guess', metrics.data.readers.ai_declined_to_guess],
        ].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd className="text-end tabular-nums">{value}</dd></div>)}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Source: stored API records. A source is not independent verification.</p>
      {metrics.data.parts_total === 0 && <p className="mt-2 text-sm">No parts recorded yet.</p>}
    </div>}
  </section>
}
export function QueueScreen() {
  const parts = useParts()
  const [params, setParams] = useSearchParams()
  const requested = params.get('status')
  const status: Readiness = lanes.includes(requested as Readiness) ? requested as Readiness : 'ready_for_review'
  const counts = readinessCounts(parts.data?.parts ?? [])
  const returnTo = `/${params.size ? `?${params}` : ''}`
  return <PhoneScreen title="Readiness queue">
    {parts.data && <p className="mt-2 text-sm text-muted-foreground">{queueFinding(parts.data.parts)}</p>}
    <div className="mt-4">
      {parts.isPending ? <LoadingRows label="Loading readiness queue" /> : parts.isError ? <ErrorBlock error={parts.error} retry={() => void parts.refetch()} /> : <Tabs value={status} onValueChange={value => {
        const next = new URLSearchParams(params)
        next.set('status', value)
        setParams(next, { replace: true })
      }}>
        <TabsList aria-label="Readiness lanes">
          {lanes.map(lane => <TabsTrigger key={lane} value={lane}>{readiness[lane].short} <span className="tabular-nums">{counts[lane]}</span></TabsTrigger>)}
        </TabsList>
        {lanes.map(lane => <TabsContent key={lane} value={lane} className="mt-4">
          <h2 className="group-heading">{readiness[lane].label}</h2>
          {counts[lane] ? <ul className="group">{parts.data.parts.filter(part => part.readiness_status === lane).map(part => <PartCell key={part.item_id} part={part} returnTo={returnTo} />)}</ul> : <p className="group p-4 text-sm">No parts in this lane.</p>}
        </TabsContent>)}
      </Tabs>}
    </div>
    <EvidenceMetrics />
    <p className="mt-5 text-footnote text-muted-foreground">Facts in. Guesses out.</p>
    <p className="mt-1 text-xs text-muted-foreground">Synthetic used mirrors, UAE to UK. Nothing is published. Seller approval is always the last step.</p>
  </PhoneScreen>
}
