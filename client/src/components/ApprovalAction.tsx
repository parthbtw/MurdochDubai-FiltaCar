import { createPortal } from 'react-dom'
import { useDevicePortalContainer } from '@/lib/deviceFrame'
import { formatGap } from '@/domain/gaps'
import { Link } from 'react-router-dom'
import { useLayoutEffect, useRef, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import type { PartRecord } from '@/api/types'
import { ApiError } from '@/api/client'
import { approvePart } from '@/api/endpoints'
import { useRecordUpdate } from '@/api/useRecordUpdate'
import { approvalReasons } from '@/domain/approval'
import { approvalText } from '@/domain/readiness'
import { ActionSheet } from './ActionSheet'
import { RecordedText } from './ArabicText'
import { Button } from './ui/button'
import { Progress } from './ui/progress'

export function ApprovalAction({ record, sticky = false, inline = false }: { record: PartRecord; sticky?: boolean; inline?: boolean }) {
  const container = useDevicePortalContainer()
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [barHeight, setBarHeight] = useState(100)
  useLayoutEffect(() => {
    if (!sticky || !bar.current) return
    const element = bar.current
    const measure = () => setBarHeight(element.offsetHeight || 100)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [sticky, container])
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
  const confirmation = <>
    {error && <div role="alert"><RecordedText text={error.message} />{gaps.map((gap, index) => <div key={index} className="mt-2"><RecordedText text={formatGap(gap)} /></div>)}</div>}
    {inline && gaps.length > 0 && <Link className="pressable flex min-h-11 items-center text-accent" to={`/sell/${encodeURIComponent(record.item_id)}/questions`}>Back to Questions</Link>}
    {busy && <div role="status" className="mt-3"><p>Approving...</p><Progress aria-label="Saving approval" /></div>}
    <Button className="mt-4 w-full" disabled={busy || Boolean(reasons.length)} onClick={() => void approve()}>Approve</Button>
  </>
  if (inline) return <div className="mt-4"><h2 className="text-title-3 font-semibold">Approve this listing draft?</h2><p className="mt-2">You confirm the facts and the wording. FiltaCar does not publish anything.</p>{confirmation}</div>
  const action = <div ref={bar} className={sticky ? 'approval-sticky no-print' : 'mt-3 no-print'} role={sticky ? 'region' : undefined} aria-label={sticky ? 'Listing approval' : undefined}>
    {record.seller_approval.approved ? <p className="flex items-center gap-2 font-semibold"><LockKeyhole aria-hidden="true" className="h-5 w-5 shrink-0" />{approvalText(record)}</p> : <>
      <Button className="w-full" disabled={Boolean(reasons.length)} aria-describedby={reasons.length ? `approval-reasons-${sticky ? 'sticky' : 'panel'}` : undefined} onClick={() => { setError(null); setOpen(true) }}>Approve listing</Button>
      {reasons.length > 0 && <details open={!sticky} id={`approval-reasons-${sticky ? 'sticky' : 'panel'}`} className="mt-2"><summary className="pressable min-h-11 text-footnote">Cannot approve yet: {reasons.length} {reasons.length === 1 ? 'reason' : 'reasons'}</summary><ul className="space-y-2 text-footnote">{reasons.map((reason, index) => <li key={index}><RecordedText text={reason} /></li>)}</ul></details>}
    </>}
    <ActionSheet title="Approve this listing draft?" description="You confirm the facts and the wording. FiltaCar does not publish anything." open={open} onClose={() => setOpen(false)} busy={busy} showDone={false}>
      {confirmation}<Button variant="outline" className="mt-3 w-full" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
    </ActionSheet>
  </div>
  return <>{sticky && <div className="approval-space no-print" style={{ blockSize: barHeight }} aria-hidden="true" />}{sticky && container ? createPortal(action, container) : action}</>
}
