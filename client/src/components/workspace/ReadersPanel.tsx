import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { AiRead, OcrRead, PartRecord } from '@/api/types'
import { RecordedText } from '@/components/ArabicText'
import { newestOcrFor, fileName, photoUrl } from '@/domain/photos'
import { displayValue } from '@/domain/text'
import { agreementText, newestAiFor, readerPhotos } from '@/domain/workspace'
import { SourceLine } from './SourceLine'
import { WorkspaceSection } from './WorkspaceSection'

export function ReadersPanel({ record, expanded = false, selectedPhoto, hideNavigation = false }: { record: PartRecord; expanded?: boolean; selectedPhoto?: string; hideNavigation?: boolean }) {
  const photos = readerPhotos(record).filter(photo => selectedPhoto === undefined || photo === photoUrl(selectedPhoto))
  return <WorkspaceSection title="Label readers" summary={`${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} with saved readings.`} expanded={expanded}>
    {!hideNavigation && <div className="p-4"><Button asChild variant="outline" className="w-full"><Link to={`/parts/${encodeURIComponent(record.item_id)}/label`}>Check label</Link></Button></div>}
    {photos.length ? photos.map(photo => {
      const ocr = newestOcrFor(record, photo)
      const ai = newestAiFor(record, photo)
      return <div className="p-4 divided-row" key={photo}><h3 className="break-all text-sm font-semibold">{fileName(photo)}</h3>
        {ocr?.unclear && <span className="status-tag tone-warning mt-2">OCR unclear</span>}
        <ReaderEvidence record={record} ocr={ocr} ai={ai} />
        {ai ? <p className="mt-4 text-sm font-semibold">{agreementText[ai.agreement]}</p> : <p className="mt-4 text-sm">Reader agreement not recorded.</p>}
        <p className="mt-2 text-footnote text-muted-foreground">Newest saved readings for this photo. Reading evidence does not confirm the part number.</p>
        {expanded && <OlderReadings record={record} photo={photo} newestOcr={ocr} newestAi={ai} />}
      </div>
    }) : <p className="p-4">No label readings recorded.</p>}
  </WorkspaceSection>
}

function ReaderEvidence({ record, ocr, ai, earlier = false }: { record: PartRecord; ocr?: OcrRead | null; ai?: AiRead | null; earlier?: boolean }) {
  return <div className="reader-columns mt-3"><div><h4 className="font-semibold">Offline reader (Tesseract)</h4>{ocr ? <>
          <RecordedText text={ocr.text || 'No text recorded'} className="mt-2 whitespace-pre-wrap" />
          <dl className="reader-values"><div><dt>Confidence</dt><dd>{ocr.confidence}</dd></div><div><dt>Sharpness</dt><dd>{ocr.quality.sharpness}</dd></div><div><dt>Blurry</dt><dd>{ocr.quality.blurry ? 'Yes' : 'No'}</dd></div><div><dt>Candidate</dt><dd className="font-mono">{displayValue(ocr.part_number_candidate)}</dd></div></dl>
          <p className="mt-2 text-footnote">Read at {ocr.read_at}</p><SourceLine record={record} path={`ocr.${record.ocr?.indexOf(ocr)}`} />
        </> : <p className="mt-2 text-sm">No offline reading recorded.</p>}</div>
          <div><h4 className="font-semibold">CodeBuddy AI</h4>{ai ? <><p className="mt-2 text-footnote">Mode: {ai.mode}</p><p className={ai.result.part_number ? "mt-2 font-mono" : "mt-2"}>{ai.result.part_number ?? (earlier ? 'Earlier reading declined to guess' : 'Declined to guess')}</p>
            <h5 className="mt-2 text-footnote text-muted-foreground">Visible text</h5><RecordedText text={ai.result.visible_text || 'No text recorded'} className="mt-1 whitespace-pre-wrap" />
            <h5 className="mt-2 text-footnote text-muted-foreground">Damage notes</h5>{ai.result.damage_notes.length ? ai.result.damage_notes.map((text, index) => <RecordedText key={index} text={text} className="mt-1 text-sm" />) : <p className="mt-1 text-sm">None recorded</p>}
            <p className="mt-2 text-sm">Readable: {ai.result.readable ? 'Yes' : 'No'}</p><p className="mt-2 text-footnote">Read at {ai.read_at}</p><SourceLine record={record} path={`ai_reads.${record.ai_reads?.indexOf(ai)}`} />
          </> : <p className="mt-2 text-sm">No AI reading recorded.</p>}</div>
        </div>
}
function OlderReadings({ record, photo, newestOcr, newestAi }: { record: PartRecord; photo: string; newestOcr: OcrRead | null; newestAi: AiRead | null }) {
  const olderOcr = record.ocr?.filter(read => photoUrl(read.photo) === photo && read !== newestOcr) ?? []
  const olderAi = record.ai_reads?.filter(read => photoUrl(read.photo) === photo && read !== newestAi) ?? []
  if (!olderOcr.length && !olderAi.length) return null
  return <details className="mt-3"><summary className="pressable flex min-h-11 items-center text-sm font-semibold">Earlier saved readings</summary>
    {olderOcr.map((read, index) => <ReaderEvidence key={`ocr-${index}`} record={record} ocr={read} earlier />)}
    {olderAi.map((read, index) => <ReaderEvidence key={`ai-${index}`} record={record} ai={read} earlier />)}
  </details>
}
