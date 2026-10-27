import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { readParts, writeParts, DATA_DIR } from '../store.js'
import { runChecks } from '../checks/index.js'
import { checkPhotoQuality } from '../photoQuality.js'
import { ocrImage, extractPartNumber } from '../ocr.js'
import { importCsv } from '../csvImport.js'
import {
  findPart,
  nextItemId,
  newRecord,
  isEmptyValue,
  appendHistory,
  setFieldSource,
} from '../records.js'
import {
  MAX_PHOTOS,
  PHOTO_TYPES,
  SHEET_TYPES,
  OCR_ENGINE,
  OCR_MIN_CONFIDENCE,
} from '../config.js'

const router = Router()

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 })
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_PHOTOS + 1, fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'photos') {
      if (!PHOTO_TYPES.includes(file.mimetype)) {
        return cb(badRequest(`photo "${file.originalname}" must be a jpg, png or webp image`))
      }
      return cb(null, true)
    }
    if (file.fieldname === 'sheet') {
      const isCsvType =
        SHEET_TYPES.includes(file.mimetype) ||
        (file.mimetype === 'application/octet-stream' && /\.csv$/i.test(file.originalname))
      if (!isCsvType) {
        return cb(badRequest('sheet must be a CSV file'))
      }
      return cb(null, true)
    }
    return cb(badRequest(`unexpected file field "${file.fieldname}"`))
  },
})

function sanitizeFilename(name) {
  const base = path.basename(name || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-60)
  return base || 'photo'
}

function savePhoto(item_id, file, counter) {
  const dir = path.join(DATA_DIR, 'uploads', item_id)
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${Date.now()}-${counter}-${sanitizeFilename(file.originalname)}`
  const absolutePath = path.join(dir, filename)
  fs.writeFileSync(absolutePath, file.buffer)
  return { absolutePath, photoPath: `uploads/${item_id}/${filename}` }
}

// Processes one photo: quality check, OCR, part number candidate logic.
// Returns warnings produced while processing.
async function processPhoto(part, file, counter, photoNumber) {
  const warnings = []
  const { absolutePath, photoPath } = savePhoto(part.item_id, file, counter)

  part.photos.push(photoPath)
  setFieldSource(part, 'photos', 'upload')
  appendHistory(part, [
    { field: 'photos', old: null, new: photoPath },
  ], 'upload')

  let quality
  try {
    quality = await checkPhotoQuality(absolutePath)
  } catch (err) {
    quality = { sharpness: null, blurry: false }
    warnings.push(`quality check failed for ${photoPath}: ${err.message}`)
  }
  if (quality.blurry) {
    warnings.push('photo blurry, retake')
  }

  const ocrEntry = {
    engine: OCR_ENGINE,
    photo: photoPath,
    text: null,
    confidence: null,
    unclear: true,
    quality,
    part_number_candidate: null,
    read_at: new Date().toISOString(),
  }

  try {
    const { text, confidence } = await ocrImage(absolutePath)
    ocrEntry.text = text
    ocrEntry.confidence = confidence
    ocrEntry.part_number_candidate = extractPartNumber(text)
    ocrEntry.unclear =
      quality.blurry || confidence < OCR_MIN_CONFIDENCE || !ocrEntry.part_number_candidate
  } catch (err) {
    warnings.push(`OCR failed for ${photoPath}: ${err.message}`)
  }

  part.ocr = part.ocr || []
  part.ocr.push(ocrEntry)
  setFieldSource(part, 'ocr', 'upload OCR')

  const candidate = ocrEntry.part_number_candidate
  const existing = part.part_details.part_number.extracted_value
  const changes = []

  if (candidate && !ocrEntry.unclear) {
    if (isEmptyValue(existing)) {
      part.part_details.part_number.extracted_value = candidate
      part.part_details.part_number.extraction_method = `OCR photo ${photoNumber}`
      part.part_details.part_number.requires_manual_verification = false
      for (const fieldPath of [
        'part_details.part_number.extracted_value',
        'part_details.part_number.extraction_method',
        'part_details.part_number.requires_manual_verification',
      ]) {
        setFieldSource(part, fieldPath, `OCR photo ${photoNumber}`)
      }
      changes.push(
        { field: 'part_details.part_number.extracted_value', old: null, new: candidate },
        {
          field: 'part_details.part_number.extraction_method',
          old: part.part_details.part_number.extraction_method,
          new: `OCR photo ${photoNumber}`,
        }
      )
    }
    // If the record already has a different part number we do not change
    // it; the candidate stays in the ocr entry for Developer C's checks.
  } else if (ocrEntry.unclear && isEmptyValue(existing)) {
    // Unclear OCR never sets the part number. Leave it null and flag for
    // manual verification so the frontend shows the OCR Unclear screen.
    part.part_details.part_number.requires_manual_verification = true
    setFieldSource(part, 'part_details.part_number.requires_manual_verification', 'upload OCR')
  }

  appendHistory(part, changes, 'upload OCR')
  return warnings
}

// POST /api/upload: multipart/form-data with photos (0 to 6 images), sheet
// (0 or 1 CSV) and an optional item_id text field.
router.post('/', upload.fields([
  { name: 'photos', maxCount: MAX_PHOTOS },
  { name: 'sheet', maxCount: 1 },
]), async (req, res) => {
  const photos = (req.files && req.files.photos) || []
  const sheets = (req.files && req.files.sheet) || []

  if (photos.length === 0 && sheets.length === 0) {
    return res.status(400).json({ error: 'no photos or sheet provided' })
  }
  for (const sheet of sheets) {
    if (sheet.size > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'sheet must be at most 2 MB' })
    }
  }

  const parts = readParts()
  const warnings = []
  const created = []
  const updated = []
  const affected = []

  let item_id = typeof req.body.item_id === 'string' ? req.body.item_id.trim() : ''
  if (item_id === '') item_id = null

  if (photos.length > 0) {
    let part
    if (item_id) {
      part = findPart(parts, item_id)
      if (!part) {
        return res.status(404).json({ error: `part ${item_id} not found` })
      }
    } else {
      part = newRecord(nextItemId(parts))
      parts.push(part)
      setFieldSource(part, 'item_id', 'upload')
      created.push(part.item_id)
    }

    for (let i = 0; i < photos.length; i++) {
      const photoNumber = part.photos.length + 1
      warnings.push(...(await processPhoto(part, photos[i], i + 1, photoNumber)))
    }

    if (item_id) {
      updated.push(part.item_id)
    }
    affected.push(part)
  }

  if (sheets.length > 0) {
    const sheet = sheets[0]
    const result = importCsv(parts, sheet.buffer, sheet.originalname)
    warnings.push(...result.warnings)
    created.push(...result.created)
    updated.push(...result.updated)
    for (const part of result.affected) {
      if (!affected.includes(part)) {
        affected.push(part)
      }
    }
  }

  // Run Developer C's checks on every affected record and save the keys
  // they return. A throwing check never blocks the upload.
  for (const part of affected) {
    try {
      const checked = runChecks(part)
      for (const key of Object.keys(checked)) {
        part[key] = checked[key]
        part.field_sources = part.field_sources || {}
        part.field_sources[key] = 'runChecks'
      }
    } catch (err) {
      warnings.push(`checks failed for ${part.item_id}: ${err.message}`)
    }
  }

  writeParts(parts)
  res.json({ created, updated, warnings, parts: affected })
})

export default router
