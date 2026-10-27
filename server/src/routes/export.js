import { Router } from 'express'
import { readParts } from '../store.js'
import { getAtPath, isEmptyValue } from '../records.js'
import { applyClaimGuard } from '../checks/claimGuard.js'
import { isAiOnlySource } from '../checks/evidence.js'

const router = Router()
const MOCK_STATUS = 'MOCK, NOT PUBLISHED'
router.use((req, res, next) => {
  res.set('X-Export-Status', MOCK_STATUS)
  next()
})
const HEADERS = [
  'Status', 'Custom label', 'Title', 'Description', 'Condition', 'Category',
  'Placement on Vehicle', 'Manufacturer Part Number', 'Colour', 'Price', 'Approved at', 'Sources',
]

function exclusionReason(part) {
  if (part.seller_approval?.approved !== true) return 'not approved by seller'
  if (typeof part.draft?.title !== 'string' || !part.draft.title.trim()) return 'no draft'
  return null
}

const titleFor = (part) => Array.from(part.draft.title).slice(0, 80).join('')

// Project existing provenance onto fields represented in the stored draft.
// Unrelated audit, photo and seller-register sources do not describe its facts.
function draftSources(part) {
  const draft = part.draft
  const specifics = draft.item_specifics || {}
  const title = titleFor(part)
  const description = draft.description || ''
  const used = new Set(['draft.title'])
  if (description) used.add('draft.description')
  for (const [name, value] of Object.entries(specifics)) {
    if (!isEmptyValue(value)) used.add(`draft.item_specifics.${name}`)
  }
  const sources = Object.entries(part.field_sources || {})
  const blocked = (field) => (part.gaps_and_conflicts || []).some((gap) =>
    ['missing', 'conflict'].includes(gap.type) &&
    (gap.field === field || field.startsWith(`${gap.field}.`) || gap.field.startsWith(`${field}.`))
  ) || sources.some(([key, source]) =>
    (key === field || field.startsWith(`${key}.`)) && isAiOnlySource(source)
  )
  const include = (field, rendered) => {
    const value = getAtPath(part, field)
    if (isEmptyValue(value) || blocked(field)) return
    const text = applyClaimGuard(Array.isArray(value) ? value.join(', ') : String(value), part).text
    if (text && String(rendered).includes(text)) used.add(field)
  }
  for (const field of ['make', 'model', 'year', 'colour']) include(`part_details.${field}`, title)
  include('part_details.part_number.extracted_value', `${title}\n${specifics['Manufacturer Part Number'] || ''}`)
  include('part_details.colour', specifics.Colour || '')
  include('part_details.features', specifics.Features || '')
  for (const field of ['state', 'cosmetic_damage', 'testing_status']) include(`condition.${field}`, description)
  for (const field of ['make', 'model', 'year']) include(`donor_vehicle.${field}`, description)

  const corridor = part.corridor || {}
  const side = specifics['Placement on Vehicle'] || corridor.uk_side_wording?.value
  if (side && !isEmptyValue(part.part_details?.placement) && !blocked('part_details.placement') &&
    (specifics['Placement on Vehicle'] || description.includes(side))) used.add('part_details.placement')
  if (corridor.drive_side_warning?.value && description.includes(corridor.drive_side_warning.value)) {
    used.add('donor_vehicle.drive_side')
  }
  if (corridor.shipping?.estimated === false && corridor.shipping.tier && description.includes(corridor.shipping.tier)) {
    used.add('weight_kg')
  }
  return [...new Set(sources.filter(([field, source]) =>
    typeof source === 'string' && source.trim() &&
    [...used].some((usedField) => field === usedField || usedField.startsWith(`${field}.`))
  ).map(([, source]) => source))].join('; ')
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

router.get('/preview', (req, res) => {
  const included = []
  const excluded = []
  for (const part of readParts()) {
    const reason = exclusionReason(part)
    if (reason) excluded.push({ item_id: part.item_id, reason })
    else included.push(part.item_id)
  }
  res.json({ included, excluded })
})

router.get('/ebay.csv', (req, res) => {
  const rows = [HEADERS]
  for (const part of readParts()) {
    if (exclusionReason(part)) continue
    const specifics = part.draft.item_specifics || {}
    rows.push([
      MOCK_STATUS, part.item_id, titleFor(part), part.draft.description,
      'Used', 'Car Mirrors', specifics['Placement on Vehicle'],
      specifics['Manufacturer Part Number'], specifics.Colour, 'seller to set',
      part.seller_approval.approved_at, draftSources(part),
    ])
  }
  const date = new Date().toISOString().slice(0, 10)
  res.attachment(`filtacar_mock_ebay_export_${date}.csv`)
  res.type('text/csv; charset=utf-8')
  res.send('\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n')
})

export default router
