import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWorker } from 'tesseract.js'
import { OCR_LANGS, OCR_TIMEOUT_MS } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Committed language data so OCR never needs the internet at runtime.
export const TESSDATA_DIR = path.resolve(__dirname, '../tessdata')

// One worker is reused for all requests. If a recognition times out the
// worker is discarded so the next request gets a fresh one.
let workerPromise = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker(OCR_LANGS, 1, {
      langPath: TESSDATA_DIR,
      cachePath: TESSDATA_DIR,
      gzip: false,
    })
  }
  return workerPromise
}

function resetWorker() {
  const stale = workerPromise
  workerPromise = null
  if (stale) {
    stale.then((worker) => worker.terminate()).catch(() => {})
  }
}

// Stops the shared worker so the process can exit cleanly (tests).
export async function terminateOcrWorker() {
  if (!workerPromise) return
  const worker = await workerPromise
  workerPromise = null
  await worker.terminate()
}

// Runs OCR on an image file with a 30 second timeout. Resolves with
// { text, confidence } or rejects on timeout or engine failure.
export async function ocrImage(filePath) {
  let timer
  try {
    const worker = await getWorker()
    const result = await Promise.race([
      worker.recognize(filePath),
      new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`OCR timed out after ${OCR_TIMEOUT_MS} ms`)),
          OCR_TIMEOUT_MS
        )
      }),
    ])
    return {
      text: result.data.text || '',
      confidence: typeof result.data.confidence === 'number' ? result.data.confidence : 0,
    }
  } catch (err) {
    resetWorker()
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// Part number patterns: the seed SKU format like SBM-7941-NP16, plus a
// general pattern of letter/digit groups joined by hyphens.
const PART_NUMBER_PATTERNS = [
  /\bSBM-\d{4}-[A-Z0-9]+\b/gi,
  /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)+\b/gi,
]

// Extracts the best part number candidate from OCR text, or null.
export function extractPartNumber(text) {
  if (!text) return null
  let best = null
  for (const pattern of PART_NUMBER_PATTERNS) {
    for (const match of text.match(pattern) || []) {
      if (!best || match.length > best.length) {
        best = match.toUpperCase()
      }
    }
  }
  return best
}
