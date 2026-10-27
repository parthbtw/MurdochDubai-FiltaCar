import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPreread } from '../scripts/ai-preread.js'

const projectData = fileURLToPath(new URL('../../data/', import.meta.url))
const testDirs = []

function makeData() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-preread-test-'))
  testDirs.push(dataDir)
  fs.copyFileSync(path.join(projectData, 'parts.json'), path.join(dataDir, 'parts.json'))
  fs.cpSync(path.join(projectData, 'demo', 'labels'), path.join(dataDir, 'demo', 'labels'), { recursive: true })
  return dataDir
}

function numbers(dataDir) {
  return Object.fromEntries(JSON.parse(fs.readFileSync(path.join(dataDir, 'parts.json'), 'utf8'))
    .map((part) => [part.item_id, part.part_details.part_number.extracted_value]))
}

function imageNumber(file, known) {
  const id = path.basename(file, '.png')
  const value = known[id]
  return id === 'MIR-0010' && value ? value.slice(0, -1) + 'X' : value
}

function fakeResult(partNumber) {
  return {
    part_number: partNumber,
    visible_text: partNumber || '',
    damage_notes: [],
    readable: Boolean(partNumber),
  }
}

after(() => {
  for (const dataDir of testDirs) fs.rmSync(dataDir, { recursive: true, force: true })
})

test('preread uses fake readers, saves checks and sources, skips repeats and reuses cached bytes with force', async () => {
  const dataDir = makeData()
  const known = numbers(dataDir)
  const logs = []
  let readerCalls = 0
  const options = {
    dataDir,
    reader: async (image) => { readerCalls++; return fakeResult(imageNumber(image, known)) },
    ocr: async (image) => ({ text: imageNumber(image, known) || '', confidence: 99 }),
    qualityCheck: async () => ({ sharpness: 500, blurry: false }),
    checks: (record) => ({ readiness_status: record.readiness_status, extra_check_key: 'saved' }),
    logger: { log: (message) => logs.push(message) },
  }

  const first = await runPreread(options)
  assert.equal(first.processed, 10)
  assert.equal(first.failed, 0)
  assert.equal(first.counts.agree, 8)
  assert.equal(first.counts.tesseract_only, 2)
  // MIR-0003 and MIR-0006 carry identical label bytes.
  assert.equal(readerCalls, 9)
  const records = JSON.parse(fs.readFileSync(path.join(dataDir, 'parts.json'), 'utf8'))
  for (const part of records) {
    const photo = `/demo/labels/${part.item_id}.png`
    assert.equal(part.photos.filter((value) => value === photo).length, 1)
    assert.equal(part.ocr.at(-1).photo, photo)
    assert.equal(part.ai_reads.at(-1).mode, 'build-time')
    assert.equal(part.ai_reads.at(-1).photo, photo)
    assert.equal(part.extra_check_key, 'saved')
    assert.ok(part.field_sources.extra_check_key)
    assert.ok(part.field_sources.photos)
    assert.ok(part.field_sources.ocr)
  }
  assert.equal(records.find((part) => part.item_id === 'MIR-0010').part_details.part_number.extracted_value, known['MIR-0010'])
  const report = JSON.parse(fs.readFileSync(path.join(dataDir, 'ai_preread.json'), 'utf8'))
  assert.equal(report.length, 10)
  assert.ok(report.every((entry) => entry.label === 'read by CodeBuddy AI'))
  assert.equal(logs.length, 11)

  const before = fs.readFileSync(path.join(dataDir, 'parts.json'), 'utf8')
  const second = await runPreread(options)
  assert.equal(second.skipped, 10)
  assert.equal(second.processed, 0)
  assert.equal(readerCalls, 9)
  assert.equal(fs.readFileSync(path.join(dataDir, 'parts.json'), 'utf8'), before)

  const forced = await runPreread({ ...options, force: true })
  assert.equal(forced.processed, 10)
  assert.equal(readerCalls, 9)
  const again = JSON.parse(fs.readFileSync(path.join(dataDir, 'parts.json'), 'utf8'))
  assert.ok(again.every((part) => part.photos.filter((photo) => photo === `/demo/labels/${part.item_id}.png`).length === 1))
})

test('preread keeps Tesseract fallback on AI failure, continues, and redacts errors', async () => {
  const dataDir = makeData()
  const known = numbers(dataDir)
  const partsFile = path.join(dataDir, 'parts.json')
  const parts = JSON.parse(fs.readFileSync(partsFile, 'utf8'))
  parts.find((part) => part.item_id === 'MIR-0002').part_details.part_number.extracted_value = null
  fs.writeFileSync(partsFile, JSON.stringify(parts))
  const dummyKey = 'preread-test-secret-value'
  const logs = []
  const outcome = await runPreread({
    dataDir,
    apiKey: dummyKey,
    reader: async (image) => {
      if (path.basename(image) === 'MIR-0002.png') throw new Error(`offline ${dummyKey}`)
      return fakeResult(imageNumber(image, known))
    },
    ocr: async (image) => ({ text: imageNumber(image, known) || '', confidence: 99 }),
    qualityCheck: async () => ({ sharpness: 500, blurry: false }),
    checks: (record) => ({ readiness_status: record.readiness_status, continued: true }),
    logger: { log: (message) => logs.push(message) },
  })
  assert.equal(outcome.processed, 10)
  assert.equal(outcome.failed, 1)
  const saved = JSON.parse(fs.readFileSync(partsFile, 'utf8'))
  const fallback = saved.find((part) => part.item_id === 'MIR-0002')
  assert.equal(fallback.part_details.part_number.extracted_value, known['MIR-0002'])
  assert.match(fallback.part_details.part_number.extraction_method, /^OCR photo /)
  assert.equal(fallback.ai_reads?.length || 0, 0)
  assert.equal(saved.find((part) => part.item_id === 'MIR-0010').continued, true)
  const reportText = fs.readFileSync(path.join(dataDir, 'ai_preread.json'), 'utf8')
  const failedEntry = JSON.parse(reportText).find((entry) => entry.item_id === 'MIR-0002')
  assert.equal(failedEntry.ai, null)
  assert.equal(failedEntry.agreement, 'tesseract_only')
  assert.match(failedEntry.label, /fallback/)
  assert.ok(failedEntry.error)
  assert.ok(!reportText.includes(dummyKey))
  assert.ok(!logs.join('\n').includes(dummyKey))
  assert.ok(!fs.readFileSync(partsFile, 'utf8').includes(dummyKey))
})
