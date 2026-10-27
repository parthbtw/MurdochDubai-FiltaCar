import { formatTime } from '@/domain/time'
import { historyValue } from '@/domain/workspace'
import { sourceTitle } from '@/domain/sources'
import { useState } from 'react'
import type { PartRecord } from '@/api/types'
import { ArabicText, RecordedText } from '@/components/ArabicText'
import { PhotoTile } from '@/components/PhotoTile'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { classifySource } from '@/domain/sources'
import { sourceFor } from '@/domain/fieldSource'
import { gapsFor } from '@/domain/gaps'
import { newestOcrFor } from '@/domain/photos'

export interface TraceField { path: string; label: string; trigger: HTMLButtonElement }
export function SourceSheet({ record, field, onClose }: { record: PartRecord; field: TraceField | null; onClose: () => void }) {
  const [snap, setSnap] = useState<string | number | null>(0.55)
  const source = field ? sourceFor(record, field.path) : null
  const classified = source ? classifySource(source) : null
  const photo = classified?.photoNumber ? record.photos[classified.photoNumber - 1] : classified?.kind === 'ocr' ? record.ocr?.at(-1)?.photo : undefined
  const ocr = photo ? newestOcrFor(record, photo) : null
  const history = field ? [...record.history].reverse().find(entry => entry.field === field.path || field.path.startsWith(`${entry.field}.`)) : undefined
  const questions = field ? record.questions.filter(question => question.field === field.path || field.path.startsWith(`${question.field}.`)) : []
  return <Drawer open={Boolean(field)} onOpenChange={open => { if (!open) onClose(); else setSnap(0.55) }} snapPoints={[0.55, 0.92]} activeSnapPoint={snap} setActiveSnapPoint={setSnap} fadeFromIndex={0} handleOnly autoFocus>
    <DrawerContent className="h-dvh" onCloseAutoFocus={event => { event.preventDefault(); field?.trigger.focus() }}>
      <div className="flex min-h-0 flex-col" style={{ height: `calc(${typeof snap === 'number' ? snap * 100 : 55}dvh - 44px)` }}>
      <DrawerHeader className="shrink-0 border-b pb-3 pt-0">
        <div className="flex items-center justify-between gap-3"><DrawerTitle className="text-title-3">Where this came from</DrawerTitle><DrawerClose asChild><Button variant="ghost" size="sm">Done</Button></DrawerClose></div>
        <DrawerDescription>{field?.label ?? 'Recorded evidence'}</DrawerDescription>
      </DrawerHeader>
      <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
        <RecordedText text={source ?? 'No source recorded'} className="font-semibold" />
        {classified && <p className="mt-2 text-sm">{classified.explanation}</p>}
        {photo && <div className="mt-4"><PhotoTile path={photo} record={record} />{ocr && <div className="mt-3"><h3 className="text-sm font-semibold">Recorded label reading</h3><RecordedText text={ocr.text || 'No text recorded'} className="mt-1 whitespace-pre-wrap text-sm" /></div>}</div>}
        {classified?.kind === 'seller_edit' && (history ? <section className="mt-4"><h3 className="text-sm font-semibold">Seller change</h3><p className="mt-1 text-footnote">{formatTime(history.at)}</p><RecordedText text={`Old: ${historyValue(history.old)}`} className="mt-2 text-sm" /><RecordedText text={`New: ${historyValue(history.new)}`} className="mt-1 text-sm" /></section> : <p className="mt-3 text-sm">No matching history entry recorded.</p>)}
        {(classified?.kind === 'arabic_note' || classified?.kind === 'translation') && <section className="mt-4"><h3 className="text-sm font-semibold">Original Arabic evidence</h3><ArabicText className="mt-2">{(classified.kind === 'translation' || field?.path === 'original_title_ar' ? record.original_title_ar : record.notes_ar) || 'Not recorded'}</ArabicText></section>}
        {field && gapsFor(record, field.path).map((gap, index) => <section key={index} className="mt-4"><h3 className="text-sm font-semibold">{gap.type === 'conflict' ? 'Sources disagree' : gap.type === 'missing' ? 'Needs confirmation' : 'Cannot claim'}</h3><RecordedText text={gap.detail} className="mt-1 text-sm" /><p className="mt-2 text-footnote">Sources: {gap.sources.map(sourceTitle).join('; ') || 'No source recorded'}</p>{gap.sources.some(label => classifySource(label).kind === 'arabic_note') && classified?.kind !== 'arabic_note' && <ArabicText className="mt-2">{record.notes_ar || 'Not recorded'}</ArabicText>}</section>)}
        {questions.map((question, index) => <section key={index} className="mt-4"><h3 className="text-sm font-semibold">Question to confirm</h3><p className="mt-1 text-sm">{question.question_en}</p><ArabicText className="mt-2">{question.question_ar}</ArabicText></section>)}
      </div>
      </div>
    </DrawerContent>
  </Drawer>
}
