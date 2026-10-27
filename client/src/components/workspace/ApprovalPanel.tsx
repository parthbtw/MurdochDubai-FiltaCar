import { LockKeyhole } from 'lucide-react'
import { ApprovalAction } from '@/components/ApprovalAction'
import { fieldLabel, formatTime } from '@/domain/fields'
import type { PartRecord } from '@/api/types'
import { RecordedText } from '@/components/ArabicText'
import { approvalText } from '@/domain/readiness'
import { historyValue } from '@/domain/workspace'
import { SourceLine } from './SourceLine'
import { WorkspaceSection } from './WorkspaceSection'

export function ApprovalPanel({ record, expanded = false, actionable = false }: { record: PartRecord; expanded?: boolean; actionable?: boolean }) {
  const history = [...record.history].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return <WorkspaceSection title="Approval and history" summary={approvalText(record)} expanded={expanded}>
    <div className="p-4"><p className="font-semibold">{record.seller_approval.approved && <LockKeyhole aria-hidden="true" className="me-2 inline h-5 w-5" />}{approvalText(record)}</p><p className="mt-2 text-sm">Seller approval is always the last step.</p>{actionable && <ApprovalAction record={record} />}<SourceLine record={record} path="seller_approval" /></div>
    {history.length ? <ol className="divided-list border-t">{history.map((entry, index) => <li key={index} className="p-4">
      <p className="text-footnote text-muted-foreground"><time dateTime={entry.at}>{formatTime(entry.at)}</time></p><p className="mt-2">{entry.by === 'system: changed after approval' ? 'Approval withdrawn because the record changed.' : `${entry.by === 'seller' ? 'Seller' : entry.by} changed ${fieldLabel(entry.field).toLowerCase()}.`}</p>
      <dl className="mt-2 space-y-2"><div><dt className="text-footnote text-muted-foreground">From</dt><dd><RecordedText text={historyValue(entry.old)} className="break-words" /></dd></div><div><dt className="text-footnote text-muted-foreground">To</dt><dd><RecordedText text={historyValue(entry.new)} className="break-words" /></dd></div></dl><SourceLine record={record} path="history" />
    </li>)}</ol> : <p className="p-4 border-t">No history recorded.</p>}
  </WorkspaceSection>
}
