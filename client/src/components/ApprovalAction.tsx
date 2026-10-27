import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import type { PartRecord } from '@/api/types'
import { ApiError } from '@/api/client'
import { approvePart } from '@/api/endpoints'
import { useRecordUpdate } from '@/api/useRecordUpdate'
import { approvalReasons } from '@/domain/approval'
import { fieldLabel } from '@/domain/fields'
import { approvalText } from '@/domain/readiness'
import { ActionSheet } from './ActionSheet'
import { RecordedText } from './ArabicText'
import { Button } from './ui/button'
import { Progress } from './ui/progress'

export function ApprovalAction({ record, sticky = false }: { record: PartRecord; sticky?: boolean }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const applyRecord = useRecordUpdate()
  const reasons = approvalReasons(record)
  const gaps = error instanceof ApiError ? error.body.gaps_and_conflicts ?? error.body.gaps ?? [] : []
  async function approve() {
    if (busy || reasons.length) return
    setBusy(true); setError(null)
    try { applyRecord(await approvePart(record.item_id)); setOpen(false) }
    catch (reason) { setError(reason instanceof Error ? reason : new Error('Approval could not be saved.')) }
    finally { setBusy(false) }
  }
  return <div className={sticky ? 'approval-sticky no-print' : 'mt-3 no-print'} role={sticky ? 'region' : undefined} aria-label={sticky ? 'Listing approval' : undefined}>
    {record.seller_approval.approved ? <p className="flex items-center gap-2 font-semibold"><LockKeyhole aria-hidden="true" className="h-5 w-5 shrink-0" />{approvalText(record)}</p> : <>
      <Button className="w-full" disabled={Boolean(reasons.length)} aria-describedby={reasons.length ? `approval-reasons-${sticky ? 'sticky' : 'panel'}` : undefined} onClick={() => { setError(null); setOpen(true) }}>Approve listing</Button>
      {reasons.length > 0 && <details open={!sticky} id={`approval-reasons-${sticky ? 'sticky' : 'panel'}`} className="mt-2"><summary className="pressable min-h-11 text-footnote">Cannot approve yet: {reasons.length} {reasons.length === 1 ? 'reason' : 'reasons'}</summary><ul className="space-y-2 text-footnote">{reasons.map((reason, index) => <li key={index}><RecordedText text={reason} /></li>)}</ul></details>}
    </>}
    <ActionSheet title="Approve this listing draft?" description="You confirm the facts and the wording. FiltaCar does not publish anything." open={open} onClose={() => setOpen(false)} busy={busy}>
      {error && <div role="alert"><RecordedText text={error.message} />{gaps.map((gap, index) => <div key={index} className="mt-2"><p>{fieldLabel(gap.field)} ({gap.type.replaceAll('_', ' ')})</p><RecordedText text={gap.detail} /></div>)}</div>}
      {busy && <div role="status" className="mt-3"><p>Approving...</p><Progress aria-label="Saving approval" /></div>}
      <Button className="mt-4 w-full" disabled={busy} onClick={() => void approve()}>Approve</Button><Button variant="outline" className="mt-3 w-full" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
    </ActionSheet>
  </div>
}
