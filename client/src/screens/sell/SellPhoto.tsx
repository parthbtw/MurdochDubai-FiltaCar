import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadFiles } from '@/api/endpoints'
import { assignUpload } from '@/api/assignUpload'
import { useRecordUpdate } from '@/api/useRecordUpdate'
import type { PartRecord } from '@/api/types'
import { FilePicker } from '@/components/FilePicker'
import { RecordedText } from '@/components/ArabicText'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useSeller } from '@/domain/seller'

export function SellPhoto({ record }: { record?: PartRecord }) {
  const { sellerId } = useSeller()
  const navigate = useNavigate()
  const applyRecord = useRecordUpdate()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    if (!selected) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 8 * 1024 * 1024) {
      setError('Choose a JPEG, PNG or WebP photo, up to 8 MB.'); setFile(null); event.target.value = ''; return
    }
    setFile(selected); setError('')
  }
  async function upload() {
    if (!file || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    const form = new FormData(); form.append('photos', file)
    if (record) form.append('item_id', record.item_id)
    try {
      const result = await assignUpload(await uploadFiles(form), sellerId)
      const after = result.parts.find(part => record ? part.item_id === record.item_id : result.created.includes(part.item_id))
      if (!after) throw new Error('The upload response did not include the part. Try again.')
      applyRecord(after)
      navigate(`/sell/${encodeURIComponent(after.item_id)}/label`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The photo could not be uploaded.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <section className="group mt-5 p-4" aria-label="Photo">
    <h2 className="text-title-2 font-semibold">Take a photo of the label</h2><p className="mt-2 text-muted-foreground">Keep the label close and in focus so you can check the number.</p>
    <FilePicker label="Take photo" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={choose} />
    <FilePicker label="Choose from library" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={choose} />
    {file && <div className="mt-4">{preview && <img src={preview} alt="Selected label photo" className="max-h-64 w-full rounded-md object-contain" />}<RecordedText text={file.name} className="mt-2 break-words text-footnote" /></div>}
    {error && <div role="alert" className="mt-4 text-danger"><RecordedText text={error} /></div>}
    {busy && <div role="status" className="mt-4"><p>Uploading and reading the label...</p><Progress className="upload-progress mt-2" aria-label="Uploading label" /></div>}
    <Button className="mt-4 w-full" disabled={!file || busy} onClick={() => void upload()}>{busy ? 'Uploading...' : 'Upload'}</Button>
  </section>
}
