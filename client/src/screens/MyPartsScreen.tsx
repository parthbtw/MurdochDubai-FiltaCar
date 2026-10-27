import { Link } from 'react-router-dom'
import { useMetrics, useParts } from '@/api/queries'
import { PhoneScreen } from '@/components/PhoneScreen'
import { ErrorBlock, LoadingRows } from '@/components/BlockState'
import { RecordedText } from '@/components/ArabicText'
import { PhotoTile } from '@/components/PhotoTile'
import { Button } from '@/components/ui/button'
import { approvalText, firstBlockingAction, readiness } from '@/domain/readiness'

export function MyPartsScreen() {
  const parts = useParts()
  const metrics = useMetrics()
  return <PhoneScreen title="My parts">
    <p className="mt-2 text-muted-foreground">Choose a part to see what to do next.</p>
    <div className="mt-4">{parts.isPending ? <LoadingRows label="Loading my parts" /> : parts.isError ? <ErrorBlock error={parts.error} retry={() => void parts.refetch()} /> : parts.data.parts.length ? <ul className="group">{parts.data.parts.map(record => {
      const action = firstBlockingAction(record)
      const next = record.seller_approval.approved ? '/export' : `/sell/${encodeURIComponent(record.item_id)}/${action ? 'questions' : 'draft'}`
      return <li key={record.item_id} className="divided-row p-4">
        {record.photos[0] ? <div className="my-part-photo"><PhotoTile path={record.photos[0]} record={record} compact /></div> : <p className="text-footnote text-muted-foreground">No photo recorded</p>}
        <Link to={next} className="pressable block min-h-11 py-3"><RecordedText text={record.draft?.title || 'New part'} className="text-title-3 font-semibold" /><p className="mt-1 text-footnote text-muted-foreground">{record.seller_approval.approved ? approvalText(record) : readiness[record.readiness_status].label}</p><RecordedText className="mt-2 text-sm" text={action?.action_en ?? (record.seller_approval.approved ? 'Next: download the mock export.' : 'Next: review the draft and approve it.')} /></Link>
      </li>
    })}</ul> : <div className="group p-4"><p>No parts yet. Sell your first part.</p><Button asChild className="mt-4 w-full"><Link to="/sell">Sell a part</Link></Button></div>}</div>
    {metrics.data && <p className="mt-4 text-footnote text-muted-foreground">{metrics.data.parts_total} {metrics.data.parts_total === 1 ? 'part' : 'parts'}. {metrics.data.approved} approved.</p>}
    {metrics.isError && <div className="mt-4"><ErrorBlock error={metrics.error} retry={() => void metrics.refetch()} /></div>}
  </PhoneScreen>
}
