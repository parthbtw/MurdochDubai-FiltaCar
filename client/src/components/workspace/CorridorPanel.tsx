import type { PartRecord } from '@/api/types'
import definition from '../../../../data/checklists/uae-uk-mirrors-test-v1.json'
import { ArabicText, RecordedText } from '@/components/ArabicText'
import { LabelTag } from '@/components/LabelTag'
import { displayValue } from '@/domain/text'
import { SourceLine } from './SourceLine'
import { WorkspaceSection } from './WorkspaceSection'

export function CorridorPanel({ record, expanded = false }: { record: PartRecord; expanded?: boolean }) {
  const corridor = record.corridor
  if (!corridor) return <WorkspaceSection title="UAE to UK corridor" summary="No corridor checks recorded" expanded={expanded}><p className="p-4">No corridor checks recorded.</p></WorkspaceSection>
  const { shipping, checklist } = corridor
  const matchingDefinition = checklist.id === definition.id && checklist.version === definition.version
  return <WorkspaceSection title="UAE to UK corridor" summary={`Test checklist dated ${checklist.dated}`} expanded={expanded}>
    {[{ title: 'UK side wording', key: 'uk_side_wording', item: corridor.uk_side_wording, note: corridor.uk_side_wording.note }, { title: 'Drive side warning', key: 'drive_side_warning', item: corridor.drive_side_warning, note: null }].map(({ title, key, item, note }) => <div className="p-4 divided-row" key={key}><h3 className="text-footnote text-muted-foreground">{title}</h3><RecordedText text={displayValue(item.value)} className="mt-1" /><LabelTag label={item.label} />{note && <p className="mt-2 text-sm">{note}</p>}<SourceLine record={record} path={`corridor.${key}`} /></div>)}
    <div className="p-4 border-t"><h3 className="font-semibold">Shipping</h3><LabelTag label={shipping.label} />
      <dl className="mt-3 specifics-list"><div><dt>Tier</dt><dd>{shipping.tier}</dd></div><div><dt>Size</dt><dd>{shipping.size}</dd></div><div><dt>Fragile</dt><dd>{shipping.fragile ? 'Yes' : 'No'}</dd></div>
        <div><dt>Dimensions, cm</dt><dd>{shipping.packaged_dimensions_cm ? `Length ${displayValue(shipping.packaged_dimensions_cm.length)}, width ${displayValue(shipping.packaged_dimensions_cm.width)}, height ${displayValue(shipping.packaged_dimensions_cm.height)}` : 'Not recorded'}</dd></div>
      </dl>{shipping.estimated && <p className="mt-3"><span className="status-tag tone-warning">Estimated, weight not provided</span></p>}<SourceLine record={record} path="corridor.shipping" />
    </div>
    <div className="p-4 border-t"><h3 className="text-footnote text-muted-foreground">Packing alert</h3><RecordedText text={corridor.packing_alert.value} className="mt-1" /><LabelTag label={corridor.packing_alert.label} /><SourceLine record={record} path="corridor.packing_alert" /></div>
    <div className="p-4 border-t"><h3 className="font-semibold">Dated checklist</h3><p className="mt-2 break-words text-footnote">{checklist.id}</p><p className="mt-1 text-footnote">Version {checklist.version}. Dated {checklist.dated}.</p><p className="mt-2 text-sm">{checklist.label}</p><SourceLine record={record} path="corridor.checklist" /></div>
    <ul className="divided-list border-t">{checklist.items.map(item => {
      const requirement = matchingDefinition ? definition.items.find(candidate => candidate.id === item.id) : undefined
      return <li className="p-4" key={item.id}><div className="flex flex-wrap items-center gap-2"><span className={`status-tag tone-${item.status === 'pass' ? 'ready' : item.status === 'fail' ? 'danger' : item.status === 'unknown' ? 'warning' : 'neutral'}`}>{item.status}</span>{requirement?.blocking && <span className="text-footnote font-semibold">Blocks approval</span>}</div>
        <h4 className="mt-2 font-semibold">{requirement?.requirement_en ?? item.id}</h4>{requirement && <ArabicText className="mt-2">{requirement.requirement_ar}</ArabicText>}
        {!requirement && <p className="mt-2 text-footnote">No definition recorded for this checklist item and version.</p>}
        <RecordedText text={item.detail} className="mt-3 text-sm" />
        {item.status === 'reference' && requirement && 'verify_with' in requirement && <p className="mt-2 text-sm">Verify with {requirement.verify_with}</p>}
        {requirement && <p className="mt-2 text-footnote text-muted-foreground">Requirement source: {definition.field_sources.items}</p>}
      </li>
    })}</ul>
  </WorkspaceSection>
}
