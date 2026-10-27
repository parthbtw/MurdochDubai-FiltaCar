import { useId, useState, type FormEvent } from 'react'
import type { PartRecord } from '@/api/types'
import { updatePart } from '@/api/endpoints'
import { useRecordUpdate } from '@/api/useRecordUpdate'
import { fieldLabel, fieldPatch, validateField, valueAt, type EditableField } from '@/domain/fields'
import { displayValue } from '@/domain/text'
import { sourceFor } from '@/domain/fieldSource'
import { compareRecords, type Ripple } from '@/domain/ripple'
import { ActionSheet } from './ActionSheet'
import { RecordedText } from './ArabicText'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Progress } from './ui/progress'

export function FactEditor({ record, field, onClose, onSaved, inline = false }: { record: PartRecord; field: EditableField; onClose: () => void; onSaved: (ripple: Ripple) => void; inline?: boolean }) {
  const id = useId()
  const current = valueAt(record, field.path)
  const [input, setInput] = useState(() => Array.isArray(current) ? current.join('\n') : current == null ? '' : String(current))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const applyRecord = useRecordUpdate()
  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const invalid = validateField(field, input)
    if (invalid) { setError(invalid); return }
    setSaving(true); setError('')
    try {
      const after = await updatePart(record.item_id, fieldPatch(field, input))
      applyRecord(after); onSaved(compareRecords(record, after)); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The change could not be saved.') }
    finally { setSaving(false) }
  }
  const inputProps = { id, value: input, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setInput(event.target.value); setError('') }, disabled: saving, 'aria-describedby': `${id}-help${error ? ` ${id}-error` : ''}`, 'aria-invalid': Boolean(error) as boolean, autoFocus: !inline }
  const content = <>
    <div className="mb-4"><p className="text-footnote text-muted-foreground">Current value</p><RecordedText text={displayValue(current)} /><p className="mt-1 text-footnote">Source: {sourceFor(record, field.path) ?? 'No source recorded'}</p></div>
    <form onSubmit={event => void save(event)} noValidate>
      <Label htmlFor={id}>{fieldLabel(field.path)}</Label>
      <div className="mt-2">{field.kind === 'list' ? <Textarea {...inputProps} /> : field.kind === 'choice' ? <select {...inputProps} className="field-select"><option value="">Choose a value</option>{field.choices!.map(choice => <option key={choice}>{choice}</option>)}</select> : <Input {...inputProps} inputMode={field.kind === 'year' ? 'numeric' : field.kind === 'number' ? 'decimal' : 'text'} />}</div>
      <p id={`${id}-help`} className="mt-2 text-footnote text-muted-foreground">{field.help}</p>
      {record.seller_approval.approved && <p className="mt-3 font-semibold">Saving withdraws your approval.</p>}
      {error && <div id={`${id}-error`} role="alert" className="mt-3 text-danger"><RecordedText text={error} /></div>}
      {saving && <div className="mt-3" role="status"><p>Saving...</p><Progress aria-label="Saving change" /></div>}
      <Button type="submit" className="mt-4 w-full" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
    </form>
  </>
  return inline ? <div className="mt-4">{content}</div> : <ActionSheet title={`Edit ${fieldLabel(field.path).toLowerCase()}`} description="Save one recorded fact. FiltaCar will check the returned record again." open onClose={onClose} busy={saving}>{content}</ActionSheet>
}
