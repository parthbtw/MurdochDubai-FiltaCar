import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { uploadFiles } from '@/api/endpoints'
import { queryKeys, useParts } from '@/api/queries'
import type { UploadResult } from '@/api/types'
import { PhoneScreen } from '@/components/PhoneScreen'
import { ErrorBlock } from '@/components/BlockState'
import { RecordedText } from '@/components/ArabicText'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { fileName } from '@/domain/photos'

const photoTypes = ['image/jpeg', 'image/png', 'image/webp']
const mb = 1024 * 1024
import { intakeColumns } from '@/domain/exchange'
function PhotoSelection({ file }: { file: File }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return <li className="flex items-center gap-3 py-3"><img src={url || undefined} alt={`Selected photo: ${file.name}`} className="h-16 w-16 shrink-0 rounded-md object-cover" /><div className="min-w-0"><RecordedText text={file.name} className="break-words" /><p className="text-footnote text-muted-foreground">{file.size.toLocaleString()} bytes</p></div></li>
}
interface UploadOutcome { result: UploadResult; processedPhotos: Set<string> }
export function AddScreen() {
  const parts = useParts()
  const client = useQueryClient()
  const [photos, setPhotos] = useState<File[]>([])
  const [sheet, setSheet] = useState<File | null>(null)
  const [itemId, setItemId] = useState('')
  const [photoErrors, setPhotoErrors] = useState<string[]>([])
  const [sheetError, setSheetError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null)
  async function upload(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || photoErrors.length || sheetError || (!photos.length && !sheet)) return
    inFlight.current = true; setBusy(true); setError(''); setOutcome(null)
    const knownPhotos = new Set(parts.data?.parts.flatMap(record => record.photos) ?? [])
    const form = new FormData()
    photos.forEach(file => form.append('photos', file))
    if (sheet) form.append('sheet', sheet)
    if (itemId) form.append('item_id', itemId)
    try {
      const result = await uploadFiles(form)
      const processedPhotos = new Set(photos.length ? result.parts.flatMap(record => record.photos.filter(photo => !knownPhotos.has(photo))) : [])
      setOutcome({ result, processedPhotos })
      setPhotos([]); setSheet(null); formRef.current?.reset()
      for (const record of result.parts) client.setQueryData(queryKeys.part(record.item_id), record)
      void client.invalidateQueries({ queryKey: ['parts'] })
      for (const id of new Set([...result.created, ...result.updated, ...result.parts.map(record => record.item_id)])) void client.invalidateQueries({ queryKey: queryKeys.part(id) })
      void client.invalidateQueries({ queryKey: ['metrics'] })
      void client.invalidateQueries({ queryKey: ['export-preview'] })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The upload could not be completed.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <PhoneScreen title="Add parts">
    <p className="mt-2 text-muted-foreground">Add photos and a spreadsheet, then confirm the returned facts.</p>
    <form ref={formRef} onSubmit={event => void upload(event)} className="mt-5" aria-busy={busy}>
      <section className="group p-4" aria-labelledby="photos-heading"><h2 id="photos-heading" className="text-title-3 font-semibold">Photos</h2>
        <Label htmlFor="intake-photos" className="mt-3 block">Choose photos</Label>
        <Input id="intake-photos" className="mt-2" type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" disabled={busy} aria-describedby="photos-help" onChange={event => {
          const selected = Array.from(event.target.files ?? [])
          const problems = selected.flatMap(file => !photoTypes.includes(file.type) ? [`${file.name}: choose a JPEG, PNG or WebP image.`] : file.size > 8 * mb ? [`${file.name}: exceeds the 8 MB photo limit.`] : [])
          if (selected.length > 6) problems.unshift('Choose up to 6 photos at a time.')
          setPhotoErrors(problems); setPhotos(problems.length ? [] : selected); setError('')
          if (problems.length) event.target.value = ''
        }} />
        <p id="photos-help" className="mt-2 text-footnote text-muted-foreground">Up to 6 photos. JPEG, PNG or WebP, up to 8 MB each.</p>
        {photoErrors.length > 0 && <ul role="alert" className="mt-2 space-y-2 text-danger">{photoErrors.map((message, index) => <li key={index}><RecordedText text={message} /></li>)}</ul>}
        {photos.length > 0 && <ul aria-label="Selected photos">{photos.map((file, index) => <PhotoSelection key={`${index}-${file.name}`} file={file} />)}</ul>}
        <Label htmlFor="attach-to" className="mt-4 block">Attach to</Label><select id="attach-to" className="field-select mt-2" value={itemId} disabled={busy} onChange={event => setItemId(event.target.value)}><option value="">New part</option>{parts.data?.parts.map(record => <option key={record.item_id} value={record.item_id}>{record.item_id}</option>)}</select>
        {parts.isPending && <p className="mt-2 text-footnote" role="status">Loading existing item IDs...</p>}
        {parts.isError && <div className="mt-2"><ErrorBlock error={parts.error} retry={() => void parts.refetch()} /></div>}
      </section>
      <section className="group p-4" aria-labelledby="sheet-heading"><h2 id="sheet-heading" className="text-title-3 font-semibold">Spreadsheet</h2>
        <Label htmlFor="intake-sheet" className="mt-3 block">Choose CSV</Label><Input id="intake-sheet" type="file" accept=".csv,text/csv" className="mt-2" disabled={busy} aria-describedby="sheet-help" onChange={event => {
          const file = event.target.files?.[0] ?? null
          const problem = file && !/\.csv$/i.test(file.name) ? 'Choose a CSV file.' : file && file.size > 2 * mb ? 'The CSV exceeds the 2 MB spreadsheet limit.' : ''
          setSheetError(problem); setSheet(problem ? null : file); setError('')
          if (problem) event.target.value = ''
        }} /><p id="sheet-help" className="mt-2 text-footnote text-muted-foreground">One CSV, up to 2 MB.</p>
        {sheetError && <p role="alert" className="mt-2 text-danger">{sheetError}</p>}
        {sheet && <RecordedText text={`${sheet.name}, ${sheet.size.toLocaleString()} bytes`} className="mt-2 break-words text-footnote" />}
        <details className="mt-3"><summary className="pressable flex min-h-11 items-center font-semibold">Columns FiltaCar reads</summary><ol className="space-y-1 text-sm">{intakeColumns.map(column => <li key={column}>{column}</li>)}</ol></details>
      </section>
      {error && <div role="alert" className="group mt-4 p-4 text-danger"><RecordedText text={error} /></div>}
      {busy && <div role="status" className="mt-4" aria-live="polite"><p>Uploading and reading files...</p><Progress aria-label="Upload in progress" className="upload-progress mt-2" /><p className="mt-2 text-footnote text-muted-foreground">Waiting for the server response.</p></div>}
      <Button type="submit" className="mt-4 w-full" disabled={busy || Boolean(photoErrors.length || sheetError) || (!photos.length && !sheet)}>{busy ? 'Uploading...' : 'Upload'}</Button>
    </form>
    {outcome && <section className="mt-5" aria-label="Upload results" aria-live="polite">
      {(['created', 'updated'] as const).map(kind => <div key={kind} className="group mt-4 p-4"><h2 className="text-title-3 font-semibold">{kind === 'created' ? 'Created parts' : 'Updated parts'}</h2>{outcome.result[kind].length ? <ul>{outcome.result[kind].map(id => <li key={id}><Link className="pressable flex min-h-11 items-center break-all font-mono text-accent" to={`/parts/${encodeURIComponent(id)}`}>{id}</Link></li>)}</ul> : <p className="mt-2 text-muted-foreground">None returned.</p>}</div>)}
      <div className="group mt-4 p-4"><h2 className="text-title-3 font-semibold">Warnings</h2>{outcome.result.warnings.length ? <ul className="mt-2 space-y-2">{outcome.result.warnings.map((warning, index) => <li key={index}><RecordedText text={warning} /></li>)}</ul> : <p className="mt-2 text-muted-foreground">None returned.</p>}</div>
      {outcome.result.parts.flatMap(record => record.ocr?.filter(read => outcome.processedPhotos.has(read.photo)).map((read, index) => <div key={`${record.item_id}-${read.photo}-${index}`} className="group mt-4 p-4"><h3 className="break-all font-semibold">{fileName(read.photo)}</h3><p className="mt-2">Sharpness {read.quality.sharpness}</p>{read.quality.blurry && <p className="status-tag tone-warning mt-2">Blurry, retake</p>}{read.unclear ? <><p className="mt-2">The label could not be read</p><Link className="pressable flex min-h-11 items-center text-accent" to={`/parts/${encodeURIComponent(record.item_id)}/label?${new URLSearchParams({ photo: read.photo })}`}>Check label</Link></> : <><p className="mt-2 text-footnote text-muted-foreground">Part number candidate</p><p className="font-mono">{read.part_number_candidate ?? 'No candidate returned'}</p></>}</div>) ?? [])}
      <p className="mt-4 text-footnote text-muted-foreground">New parts start as Information missing until each fact is confirmed.</p>
    </section>}
  </PhoneScreen>
}
