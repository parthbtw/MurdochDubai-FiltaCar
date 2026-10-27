// Shared record helpers for the upload, CSV import and API layers.

// Reads a value at a dot-separated field path, or undefined.
export function getAtPath(record, fieldPath) {
  let value = record
  for (const key of fieldPath.split('.')) {
    if (value === null || value === undefined) return undefined
    value = value[key]
  }
  return value
}

// Writes a value at a dot-separated field path, creating parent objects.
export function setAtPath(record, fieldPath, value) {
  const keys = fieldPath.split('.')
  let target = record
  for (const key of keys.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {}
    }
    target = target[key]
  }
  target[keys[keys.length - 1]] = value
}

export function isEmptyValue(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  )
}

// Appends one history entry per change.
export function appendHistory(record, changes, by) {
  record.history = record.history || []
  const at = new Date().toISOString()
  for (const change of changes) {
    record.history.push({ at, ...change, by })
  }
}

export function setFieldSource(record, fieldPath, source) {
  record.field_sources = record.field_sources || {}
  record.field_sources[fieldPath] = source
}

// Next free item_id: MIR-0011 and up, never reusing a numeric slot that a
// record already holds.
export function nextItemId(parts) {
  let max = 10
  for (const part of parts) {
    const match = /^MIR-(\d{4})$/.exec(part.item_id || '')
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10))
    }
  }
  return `MIR-${String(max + 1).padStart(4, '0')}`
}

// A new record with the same shape as the seed data, holding only the
// fields we actually know. Unknown fields stay null.
export function newRecord(item_id) {
  return {
    item_id,
    created_at: new Date().toISOString(),
    storage_location: null,
    weight_kg: null,
    packaged_dimensions_cm: null,
    included_components: null,
    seller_id: null,
    original_title_ar: null,
    original_title_en: null,
    part_details: {
      category: null,
      subcategory: null,
      brand: null,
      part_number: {
        extracted_value: null,
        extraction_method: 'none',
        requires_manual_verification: true,
      },
      placement: null,
    },
    condition: {
      state: null,
      cosmetic_damage: [],
      testing_status: null,
    },
    readiness_status: 'information_missing',
    actions_required: [],
    donor_vehicle: {
      make: null,
      model: null,
      year: null,
      drive_side: null,
    },
    field_sources: { created_at: 'server record creation' },
    questions: [],
    gaps_and_conflicts: [],
    photos: [],
    notes_ar: null,
    ocr: null,
    draft: null,
    corridor: null,
    seller_approval: {
      approved: false,
      approved_at: null,
    },
    history: [],
  }
}

export function findPart(parts, id) {
  return parts.find((p) => p.item_id === id)
}

// Approval is the last step and must be repeated after a record changes.
export function withdrawApproval(record) {
  if (record.seller_approval?.approved !== true) return
  const previous = record.seller_approval
  record.seller_approval = { approved: false, approved_at: null }
  appendHistory(record, [{
    field: 'seller_approval',
    old: previous,
    new: record.seller_approval,
  }], 'system: changed after approval')
  setFieldSource(record, 'seller_approval.approved', 'withdrawn after change')
}
