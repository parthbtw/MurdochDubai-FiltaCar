import { RecordedText } from './ArabicText'
import { Button } from './ui/button'
import { fieldLabel } from '@/domain/fields'
import { formatGap } from '@/domain/gaps'
import { readiness } from '@/domain/readiness'
import type { Ripple } from '@/domain/ripple'

export function RippleBanner({ ripple, onClose }: { ripple: Ripple; onClose: () => void }) {
  return <section className="group mt-4 border border-input p-4" aria-label="What changed" aria-live="polite">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">What changed</h2><Button variant="ghost" onClick={onClose}>Dismiss</Button></div>
    <p className="text-footnote text-muted-foreground">Source: comparison of the API records before and after this change.</p>
    {ripple.readiness && <p className="mt-3">{readiness[ripple.readiness.before].label} to {readiness[ripple.readiness.after].label}</p>}
    {ripple.approvalWithdrawn && <p className="mt-3 font-semibold">Approval withdrawn because the record changed. Approve again when ready.</p>}
    {(['resolved', 'added'] as const).map(kind => <div key={kind}>
      {ripple.gaps[kind].map((gap, index) => <RecordedText key={`gap-${index}`} className="mt-2" text={`${kind === 'resolved' ? 'Gap resolved' : 'New gap'}: ${formatGap(gap)}`} />)}
      {ripple.questions[kind].map((question, index) => <div key={`question-${index}`} className="mt-2"><p className="text-footnote">{kind === 'resolved' ? 'Question resolved' : 'New question'}: {fieldLabel(question.field)}</p><RecordedText text={question.question_en} /></div>)}
      {ripple.actions[kind].map((action, index) => <div key={`action-${index}`} className="mt-2"><p className="text-footnote">{kind === 'resolved' ? 'Action resolved' : 'New action'}: {fieldLabel(action.field)}</p><RecordedText text={action.action_en} /></div>)}
    </div>)}
    {ripple.title && <div className="mt-3"><h3 className="text-footnote">Draft title</h3><del><RecordedText text={ripple.title.before || 'Not recorded'} /></del><mark className="changed-text"><RecordedText text={ripple.title.after || 'Not recorded'} /></mark></div>}
    {(ripple.description.resolved.length > 0 || ripple.description.added.length > 0) && <div className="mt-3"><h3 className="text-footnote">Draft description sentences</h3>{ripple.description.resolved.map((text, index) => <del key={`old-${index}`}><RecordedText text={text} /></del>)}{ripple.description.added.map((text, index) => <mark className="changed-text" key={`new-${index}`}><RecordedText text={text} /></mark>)}</div>}
    {ripple.checklist.map(item => <div key={item.id} className="mt-2"><p>{fieldLabel(item.id)}: {item.before} to {item.after}</p><RecordedText text={item.detail} className="text-footnote" /></div>)}
    {!ripple.changedFields.length && !ripple.readiness && !ripple.approvalWithdrawn && !ripple.gaps.resolved.length && !ripple.gaps.added.length && <p className="mt-2">No fact or readiness changes returned.</p>}
  </section>
}
