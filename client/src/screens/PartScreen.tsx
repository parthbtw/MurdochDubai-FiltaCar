import { useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { usePart } from '@/api/queries'
import { ArabicText } from '@/components/ArabicText'
import { ErrorBlock, LoadingRows } from '@/components/BlockState'
import { FactCell } from '@/components/FactCell'
import { PhoneScreen } from '@/components/PhoneScreen'
import { PhotoTile } from '@/components/PhotoTile'
import { PartTitle } from '@/components/PartTitle'
import { SourceSheet, type TraceField } from '@/components/SourceSheet'
import { StatusPill } from '@/components/StatusPill'
import { approvalText, firstBlockingAction } from '@/domain/readiness'

function FactSection({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  return <section className="mt-5" aria-label={title}><h2 className="group-heading">{title}</h2><div className="group">{children}</div>{footer && <p className="mt-2 px-4 text-footnote text-muted-foreground">{footer}</p>}</section>
}
export function PartScreen() {
  const { id = '' } = useParams()
  const location = useLocation()
  const part = usePart(id)
  const [field, setField] = useState<TraceField | null>(null)
  const [lastTrigger, setLastTrigger] = useState<HTMLButtonElement | null>(null)
  const returnTo: unknown = location.state?.returnTo
  const backTo = typeof returnTo === 'string' && /^\/(?:\?|$)/.test(returnTo) ? returnTo : '/'
  const record = part.data
  const fact = (path: string, label: string, value: unknown, options: { note?: ReactNode; mono?: boolean; traceLabel?: string } = {}) => record && <FactCell key={path} record={record} path={path} label={label} value={value} {...options} onTrace={next => { setLastTrigger(next.trigger); setField(next) }} />
  const action = record ? firstBlockingAction(record) : null
  return <PhoneScreen title={record?.item_id ?? id} detail backTo={backTo}>
    {part.isPending ? <div className="mt-4"><LoadingRows label="Loading part details" /></div> : part.isError ? <div className="mt-4"><ErrorBlock error={part.error} retry={() => void part.refetch()} /></div> : record && <>
      <div className="mt-3"><StatusPill status={record.readiness_status} /><p className="mt-2 text-footnote text-muted-foreground">{approvalText(record)}</p>{record.draft?.title && <PartTitle text={record.draft.title} partNumber={record.part_details.part_number.extracted_value} className="mt-3 text-title-3 font-semibold" />}</div>
      <section className="mt-5" aria-labelledby="next-step"><h2 id="next-step" className="group-heading">Next step</h2><div className="group p-4">{action ? <><p>{action.action_en}</p><ArabicText className="mt-2">{action.action_ar}</ArabicText></> : <p>No blockers. Ready for your review.</p>}</div></section>
      <section className="mt-5" aria-labelledby="photos-heading"><h2 id="photos-heading" className="group-heading">Photos</h2>{record.photos.length ? <div className="photo-strip" role="region" aria-label="Recorded photos" tabIndex={0}>{record.photos.map(photo => <PhotoTile key={photo} path={photo} record={record} />)}</div> : <p className="group p-4 text-sm">No photos recorded.</p>}</section>
      <FactSection title="Part">
        {fact('part_details.category', 'Category', record.part_details.category)}
        {fact('part_details.subcategory', 'Subcategory', record.part_details.subcategory)}
        {fact('part_details.brand', 'Brand', record.part_details.brand)}
        {fact('part_details.part_number.extracted_value', 'Part number', record.part_details.part_number.extracted_value, { mono: true })}
        {fact('part_details.part_number.extraction_method', 'How the number was obtained', record.part_details.part_number.extraction_method)}
        {fact('part_details.part_number.requires_manual_verification', 'Number verification', record.part_details.part_number.requires_manual_verification ? 'Needs seller verification' : 'Not flagged for manual verification')}
        {fact('part_details.placement', 'Placement', record.part_details.placement)}
        {record.corridor?.uk_side_wording.value && fact('corridor.uk_side_wording.value', 'UK side wording', record.corridor.uk_side_wording.value, { note: record.corridor.uk_side_wording.label })}
        {record.part_details.colour_code != null && fact('part_details.colour_code', 'Colour code', record.part_details.colour_code)}
      </FactSection>
      <FactSection title="Condition">
        {fact('condition.state', 'State', record.condition.state)}
        {fact('condition.cosmetic_damage', 'Cosmetic damage', record.condition.cosmetic_damage)}
        {fact('condition.testing_status', 'Testing status', record.condition.testing_status)}
      </FactSection>
      <FactSection title="Donor vehicle" footer="Donor vehicle is evidence only, not a fitment claim">
        {fact('donor_vehicle.make', 'Make', record.donor_vehicle.make, { traceLabel: 'Donor make' })}
        {fact('donor_vehicle.model', 'Model', record.donor_vehicle.model, { traceLabel: 'Donor model' })}
        {fact('donor_vehicle.year', 'Year', record.donor_vehicle.year, { traceLabel: 'Donor year' })}
        {fact('donor_vehicle.drive_side', 'Drive side', record.donor_vehicle.drive_side, { traceLabel: 'Donor drive side' })}
      </FactSection>
      <FactSection title="Shipping and storage">
        {fact('weight_kg', 'Packaged weight, kg', record.weight_kg)}
        {fact('packaged_dimensions_cm.length', 'Package length, cm', record.packaged_dimensions_cm?.length)}
        {fact('packaged_dimensions_cm.width', 'Package width, cm', record.packaged_dimensions_cm?.width)}
        {fact('packaged_dimensions_cm.height', 'Package height, cm', record.packaged_dimensions_cm?.height)}
        {fact('included_components', 'Included components', record.included_components?.length ? record.included_components : null)}
        {fact('storage_location', 'Storage location', record.storage_location, { note: 'Internal, never shown to buyers' })}
      </FactSection>
      <FactSection title="Seller notes" footer="Original seller evidence, not listing claims. Any blocked wording stays out of the draft.">
        {fact('original_title_en', 'Original English title', record.original_title_en)}
        {fact('original_title_ar', 'Original Arabic title', record.original_title_ar)}
        {fact('notes_ar', 'Arabic yard note', record.notes_ar)}
      </FactSection>
      <SourceSheet record={record} field={field} onClose={() => { setField(null); requestAnimationFrame(() => lastTrigger?.focus()) }} />
    </>}
  </PhoneScreen>
}
