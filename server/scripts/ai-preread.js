import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, readJson, writeJson } from '../src/store.js'
import { runChecks } from '../src/checks/index.js'
import { checkPhotoQuality } from '../src/photoQuality.js'
import { ocrImage, extractPartNumber, terminateOcrWorker } from '../src/ocr.js'
import { OCR_ENGINE, OCR_MIN_CONFIDENCE } from '../src/config.js'
import { appendHistory, setFieldSource } from '../src/records.js'
import { readLabel, loadAiConfig, sanitizeAiError } from '../src/ai/codebuddyReader.js'
import { createReadCache } from '../src/ai/readCache.js'
import { applyAgreement, applyChecks, applyTesseractFallback } from '../src/ai/agreement.js'

const AGREEMENTS = ['agree', 'disagree', 'ai_only', 'tesseract_only']

export async function runPreread({
  reader = readLabel,
  dataDir = DATA_DIR,
  checks = runChecks,
  force = false,
  logger = console,
  qualityCheck = checkPhotoQuality,
  ocr = ocrImage,
  apiKey = '',
  cache = createReadCache({ dataDir, reader, key: apiKey }),
} = {}) {
  const partsFile = path.join(dataDir, 'parts.json')
  const reportFile = path.join(dataDir, 'ai_preread.json')
  const report = fs.existsSync(reportFile) ? readJson(reportFile) : []
  const counts = Object.fromEntries(AGREEMENTS.map((name) => [name, 0]))
  let processed = 0
  let skipped = 0
  let failed = 0

  for (let number = 1; number <= 10; number++) {
    const id = `MIR-${String(number).padStart(4, '0')}`
    const photo = `/demo/labels/${id}.png`
    const imagePath = path.join(dataDir, 'demo', 'labels', `${id}.png`)
    let parts = readJson(partsFile)
    const initial = parts.find((part) => part.item_id === id)
    if (!initial) throw new Error(`missing demo part ${id}`)
    const previous = (initial.ai_reads || []).findLast(
      (entry) => entry.mode === 'build-time' && entry.photo === photo && entry.result
    )
    if (previous && !force) {
      skipped++
      logger.log(`${id}: skipped (already read)`)
      continue
    }

    const messages = []
    let quality = { sharpness: null, blurry: false }
    let qualityFailed = false
    try {
      quality = await qualityCheck(imagePath)
    } catch (error) {
      qualityFailed = true
      messages.push(`quality check failed: ${sanitizeAiError(error, apiKey)}`)
    }
    const tesseract = {
      engine: OCR_ENGINE,
      photo,
      text: null,
      confidence: null,
      unclear: true,
      quality,
      part_number_candidate: null,
      read_at: new Date().toISOString(),
    }
    try {
      const { text, confidence } = await ocr(imagePath)
      tesseract.text = text
      tesseract.confidence = confidence
      tesseract.part_number_candidate = extractPartNumber(text)
      tesseract.unclear = qualityFailed || quality.blurry ||
        confidence < OCR_MIN_CONFIDENCE || !tesseract.part_number_candidate
    } catch (error) {
      messages.push(`Tesseract failed: ${sanitizeAiError(error, apiKey)}`)
    }

    let ai = null
    let readAt = new Date().toISOString()
    let aiError = null
    try {
      const reading = await cache.read(imagePath)
      ai = reading.result
      readAt = reading.read_at
    } catch (error) {
      aiError = sanitizeAiError(error, apiKey)
      failed++
      messages.push(`AI failed: ${aiError}`)
    }

    // Reload after awaits so an intervening seller edit is preserved.
    parts = readJson(partsFile)
    const index = parts.findIndex((part) => part.item_id === id)
    if (index < 0) throw new Error(`missing demo part ${id}`)
    const part = structuredClone(parts[index])
    if (!part.photos.includes(photo)) {
      part.photos.push(photo)
      setFieldSource(part, 'photos', 'synthetic demo label')
      appendHistory(part, [{ field: 'photos', old: null, new: photo }], 'demo label')
      setFieldSource(part, 'history', 'demo label')
    }
    part.ocr = part.ocr || []
    part.ocr.push(tesseract)
    setFieldSource(part, 'ocr', 'build-time Tesseract')

    let agreement = 'tesseract_only'
    if (ai) {
      const entry = applyAgreement(part, { photo, result: ai, mode: 'build-time', readAt })
      agreement = entry.agreement
    } else {
      applyTesseractFallback(part, photo)
    }
    applyChecks(part, checks)
    parts[index] = part
    writeJson(partsFile, parts)

    const item = {
      item_id: id,
      photo,
      tesseract,
      ai,
      agreement,
      read_at: readAt,
      label: ai ? 'read by CodeBuddy AI' : 'Tesseract fallback; CodeBuddy AI unavailable',
      ...(aiError ? { error: aiError } : {}),
    }
    const reportIndex = report.findIndex((entry) => entry.item_id === id && entry.photo === photo)
    if (reportIndex < 0) report.push(item)
    else report[reportIndex] = item
    writeJson(reportFile, report)
    processed++
    counts[agreement]++
    logger.log(`${id}: ${agreement}${messages.length ? `; ${messages.join('; ')}` : ''}`)
  }

  logger.log(`agreements: ${AGREEMENTS.map((name) => `${name}=${counts[name]}`).join(', ')}; skipped=${skipped}; failed=${failed}`)
  return { processed, skipped, failed, counts }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadAiConfig()
  try {
    await runPreread({ force: process.argv.includes('--force'), apiKey: config.apiKey })
  } catch (error) {
    console.error(`preread failed: ${sanitizeAiError(error, config.apiKey)}`)
    process.exitCode = 1
  } finally {
    await terminateOcrWorker()
  }
}
