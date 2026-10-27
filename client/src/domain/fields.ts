import type { PartPatch } from '@/api/types'

export const fieldLabels: Record<string, string> = {
  item_id: 'Item ID', seller_id: 'Seller ID', original_title_ar: 'Original Arabic title', original_title_en: 'Original English title', notes_ar: 'Arabic yard note',
  part_details: 'Part', 'part_details.category': 'Category', 'part_details.subcategory': 'Subcategory', 'part_details.brand': 'Brand',
  'part_details.part_number': 'Part number', 'part_details.part_number.extracted_value': 'Part number', 'part_details.part_number.extraction_method': 'How the number was obtained', 'part_details.part_number.requires_manual_verification': 'Number verification',
  'part_details.placement': 'Placement', 'part_details.colour_code': 'Colour code', condition: 'Condition', 'condition.state': 'State', 'condition.cosmetic_damage': 'Cosmetic damage', 'condition.testing_status': 'Testing status', 'condition.test_record': 'Testing evidence',
  donor_vehicle: 'Donor vehicle', 'donor_vehicle.make': 'Donor make', 'donor_vehicle.model': 'Donor model', 'donor_vehicle.year': 'Donor year', 'donor_vehicle.drive_side': 'Donor drive side',
  weight_kg: 'Packaged weight, kg', packaged_dimensions_cm: 'Package measurements, cm', 'packaged_dimensions_cm.length': 'Package length, cm', 'packaged_dimensions_cm.width': 'Package width, cm', 'packaged_dimensions_cm.height': 'Package height, cm',
  included_components: 'Included components', storage_location: 'Storage location', readiness_status: 'Readiness', actions_required: 'Required actions', questions: 'Questions', gaps_and_conflicts: 'Gaps and conflicts', photos: 'Photos', ocr: 'Offline readings', ai_reads: 'CodeBuddy AI readings', candidates: 'Alternative readings', draft: 'Listing draft', corridor: 'UAE to UK corridor', seller_approval: 'Seller approval', history: 'History', created_at: 'Created time',
}
const wordLabels: Record<string, string> = { extracted_value: 'Number', approved_at: 'Approval time', read_at: 'Reading time', at: 'Time', by: 'Changed by', old: 'Previous value', new: 'New value', action_en: 'English action', action_ar: 'Arabic action', question_en: 'English question', question_ar: 'Arabic question', uk_side_wording: 'UK side wording', drive_side_warning: 'Drive side warning', part_number_candidate: 'Number candidate' }
export function fieldLabel(path: string): string {
  if (fieldLabels[path]) return fieldLabels[path]
  const pieces = path.split('.')
  const last = pieces.pop() ?? path
  const label = wordLabels[last] ?? last.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase())
  return pieces.length ? `${fieldLabel(pieces.join('.'))}: ${/^\d+$/.test(last) ? `Entry ${Number(last) + 1}` : label}` : label
}
export type FieldKind = 'text' | 'number' | 'year' | 'partNumber' | 'list' | 'choice'
export interface EditableField { path: string; kind: FieldKind; help: string; choices?: string[] }
const text = (path: string): EditableField => ({ path, kind: 'text', help: 'Enter the value you have recorded. Do not guess.' })
export const editableFields: EditableField[] = [
  { path: 'part_details.part_number.extracted_value', kind: 'partNumber', help: 'Letters and digits in groups joined by hyphens, for example SBM-7943-AC15. Spaces and underscores become hyphens; repeated hyphens collapse and letters are uppercased.' },
  { path: 'part_details.placement', kind: 'choice', choices: ['Left', 'Right'], help: 'Choose Left or Right.' }, text('part_details.colour_code'), text('condition.state'), text('condition.testing_status'),
  { path: 'condition.cosmetic_damage', kind: 'list', help: 'One recorded defect per line. Leave empty if none reported.' },
  text('donor_vehicle.make'), text('donor_vehicle.model'),
  { path: 'donor_vehicle.year', kind: 'year', help: 'Enter a four-digit year from 1950 to next year.' },
  { path: 'donor_vehicle.drive_side', kind: 'choice', choices: ['LHD', 'RHD'], help: 'Choose LHD or RHD.' },
  ...['weight_kg', 'packaged_dimensions_cm.length', 'packaged_dimensions_cm.width', 'packaged_dimensions_cm.height'].map(path => ({ path, kind: 'number' as const, help: 'Enter a positive number. Weight is in kg; measurements are in cm.' })),
  { path: 'included_components', kind: 'list', help: 'One included component per line. Enter only what is supplied.' }, text('storage_location'),
]
export const editorFor = (path: string) => editableFields.find(field => field.path === (path === 'part_details.part_number' ? `${path}.extracted_value` : path === 'packaged_dimensions_cm' ? `${path}.length` : path))
export function valueAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value)
}
export const normalizePartNumber = (value: string) => value.trim().replace(/[\s_-]+/g, '-').toUpperCase()
export function validateField(field: EditableField, input: string, currentYear = new Date().getFullYear()): string | null {
  if (field.kind === 'partNumber' && !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(normalizePartNumber(input))) return 'Enter letters and digits in groups joined by hyphens, for example SBM-7943-AC15.'
  if (field.kind === 'year' && (!/^\d{4}$/.test(input.trim()) || Number(input) < 1950 || Number(input) > currentYear + 1)) return `Enter a four-digit year from 1950 to ${currentYear + 1}.`
  if (field.kind === 'number' && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(input.trim()) || !Number.isFinite(Number(input)) || Number(input) <= 0)) return 'Enter a positive number.'
  if (field.kind === 'choice' && !field.choices?.includes(input)) return field.help
  if (field.kind === 'text' && !input.trim()) return 'Enter a recorded value.'
  if (field.path === 'included_components' && !input.trim()) return 'Enter at least one included component.'
  return null
}
export function fieldPatch(field: EditableField, input: string): PartPatch {
  const value = field.kind === 'partNumber' ? normalizePartNumber(input) : field.kind === 'number' || field.kind === 'year' ? Number(input) : field.kind === 'list' ? input.split('\n').map(line => line.trim()).filter(Boolean) : input.trim()
  return field.path.split('.').reverse().reduce<unknown>((child, key) => ({ [key]: child }), value) as PartPatch
}
