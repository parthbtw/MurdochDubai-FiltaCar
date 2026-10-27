import { useRef, useState } from 'react'
import { photoUrl, fileName } from '@/domain/photos'
import { Button } from './ui/button'

export function LabelPhoto({ photo }: { photo: string }) {
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 }), [failed, setFailed] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const url = photoUrl(photo)
  const move = (x: number, y: number) => { if (zoom > 1) setPan(current => ({ x: current.x + x, y: current.y + y })) }
  return <div>
    <div className="label-viewport" role="region" aria-label="Label photo. Use arrow keys to pan when zoomed." tabIndex={0}
      onKeyDown={event => { const delta: Record<string, [number, number]> = { ArrowLeft: [24, 0], ArrowRight: [-24, 0], ArrowUp: [0, 24], ArrowDown: [0, -24] }; if (delta[event.key]) { event.preventDefault(); move(...delta[event.key]) } }}
      onPointerDown={event => { if (zoom > 1) { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY } } }}
      onPointerMove={event => { if (drag.current?.id === event.pointerId) { move(event.clientX - drag.current.x, event.clientY - drag.current.y); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY } } }}
      onPointerUp={event => { if (drag.current?.id === event.pointerId) { event.currentTarget.releasePointerCapture(event.pointerId); drag.current = null } }} onPointerCancel={() => { drag.current = null }}>
      {failed || !url ? <p className="p-4">File not in demo pack: {fileName(photo)}</p> : <img alt={`Label photo: ${fileName(photo)}`} src={url} draggable={false} onError={() => setFailed(true)} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} />}
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-2"><Button variant="outline" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + 0.5))}>Zoom in</Button><Button variant="outline" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => { setZoom(value => Math.max(1, value - 0.5)); setPan({ x: 0, y: 0 }) }}>Zoom out</Button><Button variant="ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>Reset</Button><output aria-label="Photo zoom">{zoom * 100}%</output></div>
  </div>
}
