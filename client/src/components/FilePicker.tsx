import { useId, useRef, type ChangeEventHandler } from 'react'
import { Button } from './ui/button'

export function FilePicker({ label, inputLabel = `${label} file`, accept, capture, multiple, disabled, describedBy, onChange }: { label: string; inputLabel?: string; accept: string; capture?: 'environment'; multiple?: boolean; disabled?: boolean; describedBy?: string; onChange: ChangeEventHandler<HTMLInputElement> }) {
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  return <div className="file-picker mt-3 rounded-md focus-within:ring-2 focus-within:ring-ring">
    <Button type="button" variant="outline" className="w-full" disabled={disabled} aria-controls={id} onClick={() => input.current?.click()}>{label}</Button>
    <input ref={input} id={id} className="sr-only" type="file" aria-label={inputLabel} aria-describedby={describedBy} accept={accept} capture={capture} multiple={multiple} disabled={disabled} onChange={onChange} />
  </div>
}
