import { parse } from 'csv-parse/sync'
import {
  findPart,
  getAtPath,
  setAtPath,
  isEmptyValue,
  appendHistory,
  setFieldSource,
  nextItemId,
  newRecord,
} from './records.js'

// CSV column (case-insensitive) to record field path. Extra columns are
// ignored and reported as warnings.
const COLUMN_MAP = {
  sku: 'item_id',
  item_id: 'item_id',
  make: 'donor_vehicle.make',
  model: 'donor_vehicle.model',
  year: 'donor_vehicle.year',
  side: 'part_details.placement',
  colour: 'part_details.colour_code',
  part_number: 'part_details.part_number.extracted_value',
  testing_status: 'condition.testing_status',
  notes_ar: 'notes_ar',
  notes_en: 'original_title_en',
  weight_kg: 'weight_kg',
}

function parseValue(fieldPath, raw) {
  const text = typeof raw === 'string' ? raw.trim() : raw
  if (text === null || text === undefined || text === '') return null
  if (fieldPath === 'donor_vehicle.year') {
    const year = Number.parseInt(text, 10)
    return Number.isNaN(year) ? text : year
  }
  if (fieldPath === 'weight_kg') {
    const weight = Number.parseFloat(text)
    return Number.isNaN(weight) ? text : weight
  }
  return text
}

// Imports a CSV buffer. Rows with an existing item_id update that record
// using the candidate rule: an existing value is never overwritten, the CSV
// value is stored in candidates for Developer C's checks. Other rows create
// new parts. Returns { created, updated, warnings, affected } where affected
// holds the full records that changed.
export function importCsv(parts, csvBuffer, filename) {
  const warnings = []
  const created = []
  const updated = []
  const affected = []

  let records
  try {
    records = parse(csvBuffer.toString('utf8'), {
      columns: (header) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    })
  } catch (err) {
    throw Object.assign(new Error(`could not parse CSV: ${err.message}`), { status: 400 })
  }

  const headerKeys = records.length > 0 ? Object.keys(records[0]) : []
  const extraColumns = headerKeys.filter((key) => !(key in COLUMN_MAP))
  if (extraColumns.length > 0) {
    warnings.push(`ignored unexpected column(s): ${extraColumns.join(', ')}`)
  }
  const missingColumns = Object.keys(COLUMN_MAP).filter(
    (key) => !headerKeys.includes(key) && key !== 'item_id'
  )
  if (missingColumns.length > 0) {
    warnings.push(`missing column(s) defaulted to null: ${missingColumns.join(', ')}`)
  }

  records.forEach((row, index) => {
    const rowNumber = index + 1
    const source = `spreadsheet row ${rowNumber} (${filename})`

    const rowId = parseValue('item_id', row.item_id) || parseValue('item_id', row.sku)
    let part = rowId ? findPart(parts, rowId) : null
    let isNew = false
    if (!part) {
      const id = rowId || nextItemId(parts)
      part = newRecord(id)
      parts.push(part)
      isNew = true
      setFieldSource(part, 'item_id', source)
    }

    const changes = []
    for (const [column, fieldPath] of Object.entries(COLUMN_MAP)) {
      if (column === 'sku' && parseValue('item_id', row.item_id)) continue
      if (!(column in row)) continue
      const value = parseValue(fieldPath, row[column])
      if (isEmptyValue(value)) continue

      const current = getAtPath(part, fieldPath)
      if (isEmptyValue(current)) {
        setAtPath(part, fieldPath, value)
        setFieldSource(part, fieldPath, source)
        changes.push({ field: fieldPath, old: null, new: value })
      } else if (String(current) !== String(value)) {
        // Candidate rule: keep the existing value, store the CSV value as a
        // candidate so Developer C's checks can raise a conflict.
        part.candidates = part.candidates || {}
        part.candidates[fieldPath] = { value, source }
        changes.push({
          field: `candidates.${fieldPath}`,
          old: null,
          new: { value, source },
        })
        warnings.push(
          `row ${rowNumber}: ${fieldPath} value "${value}" differs from record value "${current}", kept as candidate`
        )
      }
    }

    if (changes.length > 0 || isNew) {
      appendHistory(part, changes, 'csv import')
      if (isNew) {
        created.push(part.item_id)
      } else {
        updated.push(part.item_id)
      }
      if (!affected.includes(part)) {
        affected.push(part)
      }
    } else {
      warnings.push(`row ${rowNumber}: no changes for ${part.item_id}`)
    }
  })

  return { created, updated, warnings, affected }
}
