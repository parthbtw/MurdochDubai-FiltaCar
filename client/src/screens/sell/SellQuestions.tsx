import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { PartRecord } from '@/api/types'
import { ArabicText, RecordedText } from '@/components/ArabicText'
import { FactEditor } from '@/components/FactEditor'
import { Button } from '@/components/ui/button'
import { editorFor, valueAt } from '@/domain/fields'
import { rippleSummary, type Ripple } from '@/domain/ripple'
import { sortedActions } from '@/domain/workspace'

export function SellQuestions({ record }: { record: PartRecord }) {
  const [summary, setSummary] = useState('')
  const actions = sortedActions(record.actions_required)
  const blocking = actions.filter(action => action.blocking)
  const action = blocking[0]
  const optional = actions.filter(action => !action.blocking)
  const path = action?.field === 'packaged_dimensions_cm' ? ['length', 'width', 'height'].map(dimension => `packaged_dimensions_cm.${dimension}`).find(path => !(Number(valueAt(record, path)) > 0)) ?? 'packaged_dimensions_cm.length' : action?.field ?? ''
  const field = editorFor(path)
  function saved(ripple: Ripple) { setSummary(rippleSummary(ripple)) }
  return <>
    {summary && <p className="group mt-4 p-4 text-sm" role="status" aria-label="Saved change" aria-live="polite">{summary}</p>}
    {action ? <section className="group mt-5 p-4" aria-label="Required question"><p className="text-footnote text-muted-foreground">{blocking.length} required {blocking.length === 1 ? 'question' : 'questions'} left</p>
      <h2 className="mt-2 text-title-2 font-semibold">{action.action_en}</h2><ArabicText className="mt-3">{action.action_ar}</ArabicText>
      {field ? <FactEditor key={`${field.path}:${JSON.stringify(valueAt(record, field.path))}`} record={record} field={field} inline onClose={() => {}} onSaved={saved} /> : <><p className="mt-4">This needs a review of the recorded evidence before you can approve.</p><Button asChild variant="outline" className="mt-3 w-full"><Link to={`/parts/${encodeURIComponent(record.item_id)}`}>Review the part</Link></Button></>}
    </section> : <p className="group mt-5 p-4 text-title-3 font-semibold">All required details are confirmed.</p>}
    {!action && optional.length > 0 && <section className="group mt-4 p-4" aria-label="Good to know"><h2 className="text-title-3 font-semibold">Good to know</h2><ul className="mt-3 space-y-4">{optional.map((item, index) => <li key={index}><RecordedText text={item.action_en} /><ArabicText className="mt-2">{item.action_ar}</ArabicText></li>)}</ul></section>}
    <Button asChild className="mt-4 w-full"><Link to={`/sell/${encodeURIComponent(record.item_id)}/draft`}>{action ? 'Review draft so far' : 'Continue'}</Link></Button>
  </>
}
