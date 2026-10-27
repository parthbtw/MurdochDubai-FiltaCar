import { Link, useSearchParams } from 'react-router-dom'
import type { PartRecord } from '@/api/types'
import { LabelScreen } from '@/screens/LabelScreen'
import { LabelPhoto } from '@/components/LabelPhoto'
import { SourceLine } from '@/components/workspace/SourceLine'
import { RecordedText } from '@/components/ArabicText'
import { Button } from '@/components/ui/button'
import { confirmedPartNumber } from '@/domain/workspace'
import { newestOcrFor } from '@/domain/photos'

export function SellLabel({ record }: { record: PartRecord }) {
  const [search, setSearch] = useSearchParams()
  const fixing = search.get('edit') === 'number'
  const number = confirmedPartNumber(record)
  const photo = record.photos.at(-1)
  const ocr = photo ? newestOcrFor(record, photo) : null
  const questionsUrl = `/sell/${encodeURIComponent(record.item_id)}/questions`
  if (ocr?.quality.blurry && search.get('quality') !== 'accepted') return <section className="group mt-5 p-4" aria-label="Photo quality">
    <LabelPhoto photo={photo!} /><p className="mt-3 text-footnote">Sharpness {ocr.quality.sharpness}</p><p className="mt-3 text-title-3 font-semibold">This photo is blurry. Retake it for a better reading.</p>
    <Button asChild className="mt-4 w-full"><Link to={`/sell/${encodeURIComponent(record.item_id)}/photo`}>Retake</Link></Button>
    <Button variant="outline" className="mt-3 w-full" onClick={() => { const next = new URLSearchParams(search); next.set('quality', 'accepted'); setSearch(next, { replace: true }) }}>Continue anyway</Button>
  </section>
  return <>
    {number && !fixing ? <section className="group mt-5 p-4" aria-label="Check the number"><h2 className="text-title-2 font-semibold">Does this match your label?</h2>
      {photo && <div className="mt-4"><LabelPhoto photo={photo} /></div>}
      {ocr && <p className="mt-3 text-footnote">Sharpness {ocr.quality.sharpness}. {ocr.quality.blurry ? 'Blurry' : 'Not blurry'}.</p>}
      <RecordedText text={number} className="mt-4 break-words font-mono text-title font-semibold" /><SourceLine record={record} path="part_details.part_number.extracted_value" />
      <Button asChild className="mt-4 w-full"><Link to={questionsUrl}>This matches my label</Link></Button><Button variant="outline" className="mt-3 w-full" onClick={() => { const next = new URLSearchParams(search); next.set('edit', 'number'); setSearch(next, { replace: true }) }}>Fix it</Button>
    </section> : <><LabelScreen embedded /><div className="mt-4">{record.part_details.part_number.extracted_value ? <Button asChild className="w-full"><Link to={questionsUrl}>Continue</Link></Button> : <Button className="w-full" disabled>Continue</Button>}</div></>}
    <Button asChild variant="ghost" className="mt-3 w-full"><Link to={questionsUrl}>Skip for now</Link></Button>
  </>
}
