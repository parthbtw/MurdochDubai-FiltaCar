import { runChecks } from '../checks/index.js'
import { isEmptyValue, setFieldSource, appendHistory } from '../records.js'
import { validateLabelResult } from './codebuddyReader.js'

export function normalizePartNumber(value) {
  return typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : ''
}

export function compareReadings(result, ocrEntry) {
  const ai = normalizePartNumber(result?.part_number)
  const tesseract = normalizePartNumber(ocrEntry?.part_number_candidate)
  if (ai && tesseract) return ai === tesseract ? 'agree' : 'disagree'
  if (ai) return 'ai_only'
  // Both empty also uses this outcome, without setting a part number.
  return 'tesseract_only'
}

function latestOcr(record, photo) {
  return [...(record.ocr || [])].reverse().find((entry) => entry.photo === photo)
}

function setNumber(record, value, source, by) {
  const number = record.part_details.part_number
  const changes = []
  for (const [field, next] of Object.entries({
    extracted_value: value,
    extraction_method: source,
    requires_manual_verification: false,
  })) {
    if (number[field] !== next) changes.push({ field: `part_details.part_number.${field}`, old: number[field] ?? null, new: next })
    number[field] = next
    setFieldSource(record, `part_details.part_number.${field}`, source)
  }
  appendHistory(record, changes, by)
  if (changes.length) setFieldSource(record, 'history', by)
}

export function applyTesseractFallback(record, photo) {
  const ocr = latestOcr(record, photo)
  if (!ocr || !isEmptyValue(record.part_details.part_number.extracted_value)) return
  const photoNumber = record.photos.indexOf(photo) + 1
  if (ocr.part_number_candidate && !ocr.unclear) {
    setNumber(record, ocr.part_number_candidate, `OCR photo ${photoNumber}`, 'upload OCR')
  } else if (ocr.unclear) {
    const number = record.part_details.part_number
    if (number.requires_manual_verification !== true) {
      appendHistory(record, [{ field: 'part_details.part_number.requires_manual_verification', old: number.requires_manual_verification ?? null, new: true }], 'upload OCR')
      setFieldSource(record, 'history', 'upload OCR')
    }
    number.requires_manual_verification = true
    setFieldSource(record, 'part_details.part_number.requires_manual_verification', 'upload OCR')
  }
}

export function applyAgreement(record, { photo, result, mode, readAt = new Date().toISOString() }) {
  const validated = validateLabelResult(result)
  if (!['build-time', 'live'].includes(mode)) throw new Error('invalid label read mode')
  const photoNumber = record.photos.indexOf(photo) + 1
  if (photoNumber === 0) throw new Error('photo is not attached to this part')
  const agreement = compareReadings(validated, latestOcr(record, photo))
  if (agreement === 'agree' && isEmptyValue(record.part_details.part_number.extracted_value)) {
    setNumber(record, normalizePartNumber(validated.part_number), `OCR + CodeBuddy AI agree (photo ${photoNumber})`, 'CodeBuddy AI + OCR')
  } else if (agreement === 'tesseract_only') {
    applyTesseractFallback(record, photo)
  }
  const entry = { engine: 'CodeBuddy AI', mode, photo, result: validated, agreement, read_at: readAt }
  record.ai_reads = record.ai_reads || []
  record.ai_reads.push(entry)
  setFieldSource(record, 'ai_reads', `CodeBuddy AI (${mode})`)
  setFieldSource(record, `ai_reads.${record.ai_reads.length - 1}`, `CodeBuddy AI (${mode})`)
  return entry
}

export function acceptAiRead(record, readIndex) {
  if (!Number.isInteger(readIndex) || readIndex < 0) {
    throw Object.assign(new Error('read_index must be a non-negative integer'), { status: 400 })
  }
  const entry = record.ai_reads?.[readIndex]
  if (!entry || entry.agreement !== 'ai_only') {
    throw Object.assign(new Error('only an ai_only reading can be accepted'), { status: 400 })
  }
  const result = validateLabelResult(entry.result)
  const value = normalizePartNumber(result.part_number)
  if (!value) throw Object.assign(new Error('reading has no part number to accept'), { status: 400 })
  const existing = record.part_details.part_number.extracted_value
  if (!isEmptyValue(existing) && normalizePartNumber(existing) !== value) {
    throw Object.assign(new Error('an existing different part number cannot be overwritten'), { status: 409 })
  }
  setNumber(record, isEmptyValue(existing) ? value : existing, 'CodeBuddy AI, confirmed by seller', 'seller')
}

export function applyChecks(record, checks = runChecks) {
  const checked = checks(record)
  for (const [key, value] of Object.entries(checked)) {
    record[key] = value
    setFieldSource(record, key, 'runChecks')
  }
  return record
}
