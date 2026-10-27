import { useState } from 'react'
import type { PartRecord } from '@/api/types'
import { fileName, photoUrl, qualityFor } from '@/domain/photos'
import { cn } from '@/lib/utils'
import { sourceFor } from '@/domain/fieldSource'

export function PhotoTile({ path, record, compact = false }: { path: string; record: PartRecord; compact?: boolean }) {
  const url = photoUrl(path)
  const [failed, setFailed] = useState(false)
  const quality = qualityFor(record, path)
  return <figure className={cn('photo-frame', compact ? 'h-16 w-16 shrink-0' : 'min-w-0')}>
    {failed || !url ? <div role="img" aria-label={`Missing recorded photo: ${fileName(path)}`} className={cn('flex flex-col justify-center bg-muted p-3', compact ? 'h-full' : 'min-h-40')}>
      <p className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>File not in demo pack</p>
      <p className={cn('break-all text-muted-foreground', compact ? 'sr-only' : 'mt-1 text-footnote')}>{fileName(path)}</p>
    </div> : <img src={url} alt={`Recorded photo for ${record.item_id}: ${fileName(path)}`} onError={() => setFailed(true)} className={cn('w-full object-contain', compact ? 'h-full' : 'h-40 bg-background')} />}
    {!compact && <figcaption className="border-t p-3 text-footnote text-muted-foreground">
      {!failed && url && <p className="break-all">{fileName(path)}</p>}
      <p className="mt-1">Source: {sourceFor(record, 'photos') ?? 'No source recorded'}</p>
      {quality ? <p className="mt-1">Sharpness {quality.sharpness.toLocaleString('en-GB', { maximumFractionDigits: 2 })}{quality.blurry ? '. Blurry, retake' : '. Not marked blurry'}</p> : <p className="mt-1">Quality not recorded</p>}
    </figcaption>}
  </figure>
}
