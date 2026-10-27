import type { PartRecord } from '@/api/types'
import { PhotoTile } from '@/components/PhotoTile'
import { factId } from '@/domain/workspace'

export function PhotoQualityPanel({ record, expanded = false }: { record: PartRecord; expanded?: boolean }) {
  return <section className="mt-5 workspace-section" aria-label="Photo quality" id={factId('photos')} tabIndex={-1}><h2 className="group-heading">Photo quality</h2><div className="group">
    {record.photos.length ? <div className={`photo-strip p-4 ${expanded ? 'evidence-photos' : ''}`} role="region" aria-label="Recorded photos" tabIndex={0}>{record.photos.map(photo => <PhotoTile key={photo} path={photo} record={record} />)}</div> : <p className="p-4">No photos recorded.</p>}
  </div></section>
}
