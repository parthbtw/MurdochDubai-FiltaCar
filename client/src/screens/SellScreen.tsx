import { Link, useParams } from 'react-router-dom'
import { usePart } from '@/api/queries'
import { PhoneScreen } from '@/components/PhoneScreen'
import { ErrorBlock, LoadingRows } from '@/components/BlockState'
import { ApprovalAction } from '@/components/ApprovalAction'
import { RecordedText } from '@/components/ArabicText'
import { DraftPanel } from '@/components/workspace/DraftPanel'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { approvalReasons } from '@/domain/approval'
import { SellPhoto } from './sell/SellPhoto'
import { SellLabel } from './sell/SellLabel'
import { SellQuestions } from './sell/SellQuestions'

const steps = ['photo', 'label', 'questions', 'draft', 'approve'] as const
const names = ['Photo', 'Label', 'Questions', 'Draft', 'Approve']
export function SellScreen() {
  const { id = '', step = 'photo' } = useParams()
  const part = usePart(id)
  const index = steps.findIndex(value => value === step)
  const record = part.data
  const base = `/sell/${encodeURIComponent(id)}`
  const reasons = record ? approvalReasons(record) : []
  return <PhoneScreen title="Sell a part" detail monoTitle={false} backTo={index <= 0 ? '/' : index === 1 ? `${base}/photo` : `${base}/${steps[index - 1]}`} backLabel={index <= 0 ? 'My parts' : 'Back'}>
    <div className="mt-4" aria-label="Selling progress"><Progress value={index < 0 ? 0 : (index + 1) / steps.length * 100} aria-label={`Step ${index + 1} of 5: ${names[index] ?? 'Unknown step'}`} /><ol className="sell-step-names mt-2">{names.map((name, i) => <li key={name} aria-current={i === index ? 'step' : undefined}>{name}</li>)}</ol></div>
    {index < 0 ? <div className="group mt-4 p-4"><p>This step is not available.</p><Button asChild className="mt-3 w-full"><Link to={id ? `${base}/label` : '/sell'}>Back to Sell a part</Link></Button></div> : !id && step === 'photo' ? <SellPhoto /> : part.isPending ? <LoadingRows label="Loading your part" /> : part.isError ? <ErrorBlock error={part.error} retry={() => void part.refetch()} /> : record && <>
      {step === 'photo' && <SellPhoto record={record} />}
      {step === 'label' && <SellLabel key={id} record={record} />}
      {step === 'questions' && <SellQuestions key={id} record={record} />}
      {step === 'draft' && <><DraftPanel record={record} expanded /><p className="group mt-4 p-4">We do not say which cars it fits. Buyers must match the part number.</p><Button asChild variant="outline" className="mt-4 h-auto min-h-11 w-full whitespace-normal"><Link to={`/parts/${encodeURIComponent(id)}/evidence`}>See where each fact came from</Link></Button><Button asChild className="mt-4 w-full"><Link to={`${base}/approve`}>Continue</Link></Button></>}
      {step === 'approve' && (record.seller_approval.approved ? <section className="group mt-5 p-4" aria-label="Approved"><p className="text-title-2 font-semibold">Approved. It is ready for the mock export. Nothing is published.</p><Button asChild className="mt-4 w-full"><Link to="/export">Export</Link></Button><Button asChild variant="outline" className="mt-3 w-full"><Link to="/">My parts</Link></Button></section> : <section className="group mt-5 p-4" aria-label="Approval confirmation">
        {reasons.length > 0 && <><h2 className="text-title-2 font-semibold">What is left to confirm</h2><ul className="mt-3 space-y-3">{reasons.map((reason, i) => <li key={i}><RecordedText text={reason} /><Link to={`${base}/questions`} className="pressable flex min-h-11 items-center text-accent">Back to Questions</Link></li>)}</ul></>}
        <ApprovalAction record={record} inline />
      </section>)}
    </>}
  </PhoneScreen>
}
