import { useRef, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { aiAccept, aiRead, getAiStatus, updatePart, uploadFiles } from '@/api/endpoints'
import { usePart } from '@/api/queries'
import { useRecordUpdate } from '@/api/useRecordUpdate'
import type { PartRecord } from '@/api/types'
import { PhoneScreen } from '@/components/PhoneScreen'
import { ErrorBlock, LoadingRows } from '@/components/BlockState'
import { RecordedText } from '@/components/ArabicText'
import { FilePicker } from '@/components/FilePicker'
import { LabelPhoto } from '@/components/LabelPhoto'
import { ReadersPanel } from '@/components/workspace/ReadersPanel'
import { SourceLine } from '@/components/workspace/SourceLine'
import { RippleBanner } from '@/components/RippleBanner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { editorFor, fieldPatch, validateField } from '@/domain/fields'
import { newestAiFor } from '@/domain/workspace'
import { newestOcrFor } from '@/domain/photos'
import { compareRecords, type Ripple } from '@/domain/ripple'

function newestLabelPhoto(record: PartRecord) {
  return record.photos.filter(photo => newestOcrFor(record, photo) || newestAiFor(record, photo)).sort((a, b) => {
    const timestamp = (photo: string) => Math.max(Date.parse(newestOcrFor(record, photo)?.read_at ?? '') || 0, Date.parse(newestAiFor(record, photo)?.read_at ?? '') || 0)
    return timestamp(b) - timestamp(a)
  })[0] ?? record.photos.at(-1) ?? ''
}
export function LabelScreen({ embedded = false }: { embedded?: boolean }) {
  const { id = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const part = usePart(id)
  const status = useQuery({ queryKey: ['ai-status'], queryFn: getAiStatus, retry: false, staleTime: 60_000 })
  const [manual, setManual] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(''), [note, setNote] = useState('')
  const [ripple, setRipple] = useState<Ripple | null>(null)
  const manualRef = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const applyRecord = useRecordUpdate()
  const record = part.data
  const requested = search.get('photo')
  const photo = record ? record.photos.find(path => path === requested) ?? newestLabelPhoto(record) : ''
  const ocr = record && photo ? newestOcrFor(record, photo) : null
  const ai = record && photo ? newestAiFor(record, photo) : null
  const field = editorFor('part_details.part_number')!
  async function mutate(operation: string, call: () => Promise<PartRecord>, before: PartRecord) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(operation); setError(''); setNote('')
    try {
      const after = await call()
      applyRecord(after); setRipple(compareRecords(before, after))
      if (operation === 'Uploading photo') {
        const added = after.photos.filter(path => !before.photos.includes(path)).at(-1)
        if (added) setSearch({ photo: added }, { replace: true })
      }
    } catch (reason) {
      if (operation === 'Reading label' && reason instanceof ApiError && reason.status === 429) setError('Another reading is running. Try again in a moment.')
      else if (operation === 'Reading label' && reason instanceof ApiError && (reason.status === 503 || reason.body.fallback === 'manual')) { setError('CodeBuddy AI is unavailable. Type the number from the photo instead.'); manualRef.current?.focus() }
      else setError(reason instanceof Error ? reason.message : 'The request could not be completed.')
    } finally { setBusy(''); inFlight.current = false }
  }
  function saveNumber(event: FormEvent) {
    event.preventDefault()
    const invalid = validateField(field, manual)
    if (invalid) { setError(invalid); manualRef.current?.focus(); return }
    if (record) void mutate('Saving number', () => updatePart(id, fieldPatch(field, manual)), record)
  }
  const content = <>
    {part.isPending ? <LoadingRows label="Loading label" /> : part.isError ? <ErrorBlock error={part.error} retry={() => void part.refetch()} /> : record && <>
      <p className="mt-2 font-mono">{id}</p>
      {photo ? <section className="group mt-4 p-4" aria-label="Recorded label photo"><LabelPhoto key={photo} photo={photo} /><p className="mt-3 text-footnote">{ocr ? `Sharpness ${ocr.quality.sharpness}` : 'Quality not recorded'}</p>{ocr?.quality.blurry && <p className="status-tag tone-warning mt-2">Blurry, retake</p>}{ocr?.unclear && <p className="mt-2">OCR unclear</p>}<SourceLine record={record} path="photos" />
        {record.photos.length > 1 && <><Label htmlFor="label-photo" className="mt-3 block">Recorded photo</Label><select id="label-photo" value={photo} disabled={Boolean(busy)} className="field-select mt-2" onChange={event => setSearch({ photo: event.target.value }, { replace: true })}>{record.photos.map(path => <option key={path} value={path}>{path.split('/').at(-1)}</option>)}</select></>}
      </section> : <p className="group mt-4 p-4">No photos recorded. Retake a photo to check a label.</p>}
      <ReadersPanel record={record} expanded selectedPhoto={photo} hideNavigation />
      {photo && record.photos.includes(photo) && <div className="group mt-4 p-4"><Button className="w-full" disabled={Boolean(busy)} onClick={() => void mutate('Reading label', () => aiRead(id, photo), record)}>Ask CodeBuddy AI</Button><p className="mt-2 text-footnote">Reading can take up to 45 seconds.</p>{status.data?.available === false && <p className="mt-2 text-footnote">Live reading is off. Saved readings still work.</p>}
        {ai?.agreement === 'ai_only' && ai.result.part_number && <div className="mt-4"><RecordedText text={`CodeBuddy AI suggestion: ${ai.result.part_number}`} /><Button variant="outline" className="mt-2 w-full" disabled={Boolean(busy)} onClick={() => void mutate('Accepting reading', () => aiAccept(id, record.ai_reads!.indexOf(ai)), record)}>Use this value</Button></div>}
        {ai?.agreement === 'disagree' && <div className="mt-4"><p>The readers found different numbers. Choose the number you can confirm from the photo.</p>{[{ label: 'Offline reader', value: ocr?.part_number_candidate }, { label: 'CodeBuddy AI', value: ai.result.part_number }].map(candidate => candidate.value && <Button key={candidate.label} variant="outline" className="mt-2 h-auto w-full whitespace-normal" disabled={Boolean(busy)} onClick={() => void mutate('Saving number', () => updatePart(id, fieldPatch(field, candidate.value!)), record)}>Use {candidate.label}: {candidate.value}</Button>)}</div>}
      </div>}
      {busy && <div role="status" className="group mt-4 p-4" aria-live="polite"><p>{busy}...</p><Progress className="mt-2" aria-label={busy} /></div>}
      {error && <div role="alert" id="number-error" className="group mt-4 p-4 text-danger"><RecordedText text={error} /></div>}
      {note && <div role="status" className="group mt-4 p-4"><RecordedText text={note} /></div>}
      <form onSubmit={saveNumber} noValidate className="group mt-4 p-4"><Label htmlFor="manual-number">Part number from the photo</Label><Input ref={manualRef} className="mt-2 font-mono" id="manual-number" value={manual} onChange={event => { setManual(event.target.value); setError('') }} readOnly={Boolean(busy)} aria-describedby={`number-help${error ? ' number-error' : ''}`} aria-invalid={Boolean(error)} /><p id="number-help" className="mt-2 text-footnote text-muted-foreground">{field.help}</p>{record.seller_approval.approved && <p className="mt-3">Saving withdraws your approval.</p>}<Button className="mt-4 w-full" type="submit" disabled={Boolean(busy)}>Use this number</Button></form>
      <div className="group mt-4 p-4"><FilePicker label="Retake photo" inputLabel="Retake photo" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={Boolean(busy)} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
        const form = new FormData(); form.append('item_id', id); form.append('photos', file)
        void mutate('Uploading photo', async () => { const uploaded = await uploadFiles(form); const after = uploaded.parts.find(candidate => candidate.item_id === id); if (!after) throw new Error('The upload response did not include this part.'); if (uploaded.warnings.length) setNote(uploaded.warnings.join('\n')); return after }, record)
      }} />{record.seller_approval.approved && <p className="mt-3">Saving withdraws your approval.</p>}</div>
      {ripple && <RippleBanner ripple={ripple} onClose={() => setRipple(null)} />}
    </>}
  </>
  return embedded ? content : <PhoneScreen title="Check label" detail monoTitle={false} backTo={`/parts/${encodeURIComponent(id)}`} backLabel={id}>{content}</PhoneScreen>
}
