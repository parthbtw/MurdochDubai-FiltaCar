import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { exportCsvUrl, getExportPreview } from '@/api/endpoints'
import { retryApi, usePart, useParts } from '@/api/queries'
import { PhoneScreen } from '@/components/PhoneScreen'
import { ErrorBlock, LoadingRows } from '@/components/BlockState'
import { RecordedText } from '@/components/ArabicText'
import { Button } from '@/components/ui/button'

import { exportColumns } from '@/domain/exchange'
const exclusionReasons: Record<string, string> = { 'not approved by seller': 'Not approved by the seller', 'no draft': 'No draft yet' }
function ExportRow({ id }: { id: string }) {
  const part = usePart(id)
  if (part.isPending) return <LoadingRows label={`Loading export row for ${id}`} />
  if (part.isError) return <ErrorBlock error={part.error} retry={() => void part.refetch()} />
  const record = part.data
  const specifics = record.draft?.item_specifics
  // Condition and category are fixed mock CSV template values in the contract.
  const values = [
    ['Title', record.draft?.title.slice(0, 80)], ['Condition', 'Used'], ['Category', 'Car Mirrors'],
    ['Placement', specifics?.['Placement on Vehicle']], ['Manufacturer part number', specifics?.['Manufacturer Part Number']],
    ['Colour', specifics?.Colour], ['Price', 'seller to set'], ['Approved at', record.seller_approval.approved_at],
  ]
  return <dl className="export-row mt-2">{values.map(([label, value]) => <div key={label}><dt className="text-footnote text-muted-foreground">{label}</dt><dd className={label === 'Manufacturer part number' ? 'font-mono' : undefined}><RecordedText text={value || 'Not recorded'} className="break-words" /></dd></div>)}</dl>
}
export function ExportScreen() {
  const preview = useQuery({ queryKey: ['export-preview'], queryFn: getExportPreview, retry: retryApi })
  const parts = useParts()
  const included = preview.data?.included ?? []
  return <PhoneScreen title="Export">
    <p className="group mt-4 p-4 font-semibold" role="note">MOCK, NOT PUBLISHED. Nothing is sent to eBay.</p>
    <section className="mt-5" aria-labelledby="included-heading"><h2 id="included-heading" className="group-heading">Included parts</h2>
      {preview.isPending ? <LoadingRows label="Loading export preview" /> : preview.isError ? <ErrorBlock error={preview.error} retry={() => void preview.refetch()} /> : included.length ? <ul className="group">{included.map(id => <li key={id} className="divided-row p-4"><Link className="pressable block min-h-11 text-accent" to={`/parts/${encodeURIComponent(id)}`}><span className="font-mono">{id}</span>{parts.data?.parts.find(record => record.item_id === id)?.draft?.title && <RecordedText className="mt-1 text-foreground" text={parts.data.parts.find(record => record.item_id === id)!.draft!.title} />}</Link><ExportRow id={id} /></li>)}</ul> : <p className="group p-4">No parts included.</p>}
      {parts.isError && <div className="mt-4"><ErrorBlock error={parts.error} retry={() => void parts.refetch()} /></div>}
    </section>
    <div className="mt-4">{preview.isSuccess && included.length > 0 ? <Button asChild className="h-auto min-h-11 w-full whitespace-normal text-center"><a href={exportCsvUrl} download>Download mock eBay CSV</a></Button> : <><Button className="h-auto min-h-11 w-full whitespace-normal" disabled>Download mock eBay CSV</Button>{preview.isSuccess && <p className="mt-2 text-footnote">Approve at least one part to export it.</p>}</>}
      <div className="mt-4"><h2 className="group-heading">CSV columns, in order</h2><ol className="group p-4 text-sm">{exportColumns.map(column => <li key={column} className="py-1">{column}</li>)}</ol></div>
      <p className="mt-2 text-footnote text-muted-foreground">Price: seller to set. FiltaCar never guesses a price.</p>
    </div>
    {preview.data && <section className="mt-5" aria-labelledby="excluded-heading"><h2 id="excluded-heading" className="group-heading">Excluded parts</h2>{preview.data.excluded.length ? <ul className="group">{preview.data.excluded.map(excluded => <li key={excluded.item_id} className="divided-row p-4"><Link className="pressable flex min-h-11 items-center font-mono text-accent" to={`/parts/${encodeURIComponent(excluded.item_id)}`}>{excluded.item_id}</Link><RecordedText text={exclusionReasons[excluded.reason] ?? excluded.reason} className="text-sm text-muted-foreground" /></li>)}</ul> : <p className="group p-4">No parts excluded.</p>}</section>}
  </PhoneScreen>
}
