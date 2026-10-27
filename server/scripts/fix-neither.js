import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, readJson, writeJson } from '../src/store.js'

// Correct only explicit null/null readings. Missing evidence is not a reading.
function shouldRelabel(agreement, ai, tesseract, photo) {
  return agreement === 'tesseract_only' &&
    typeof photo === 'string' && photo.length > 0 &&
    ai?.part_number === null &&
    tesseract?.photo === photo && tesseract.part_number_candidate === null
}

export function fixNeither({ dataDir = DATA_DIR, logger = console } = {}) {
  const partsFile = path.join(dataDir, 'parts.json')
  const reportFile = path.join(dataDir, 'ai_preread.json')
  const parts = readJson(partsFile)
  const report = readJson(reportFile)
  if (!Array.isArray(parts) || !Array.isArray(report)) {
    throw new Error('parts.json and ai_preread.json must contain arrays')
  }
  const counts = { parts: 0, preread: 0, total: 0 }

  for (const part of parts) {
    const ocr = Array.isArray(part.ocr) ? part.ocr : []
    for (const read of Array.isArray(part.ai_reads) ? part.ai_reads : []) {
      const tesseract = ocr.findLast((entry) => entry?.photo === read?.photo)
      if (shouldRelabel(read?.agreement, read?.result, tesseract, read?.photo)) {
        read.agreement = 'neither'
        counts.parts++
      }
    }
  }
  for (const entry of report) {
    if (shouldRelabel(entry?.agreement, entry?.ai, entry?.tesseract, entry?.photo)) {
      entry.agreement = 'neither'
      counts.preread++
    }
  }

  if (counts.parts) writeJson(partsFile, parts)
  if (counts.preread) writeJson(reportFile, report)
  counts.total = counts.parts + counts.preread
  logger.log(`fix-neither: parts.json=${counts.parts}, ai_preread.json=${counts.preread}, total=${counts.total} entries changed`)
  return counts
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    fixNeither()
  } catch (error) {
    console.error(`fix-neither failed: ${error.message}`)
    process.exitCode = 1
  }
}
