import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { fixNeither } from '../scripts/fix-neither.js'

const directories = []
const photo = '/demo/labels/TEST-001.png'
const otherPhoto = '/demo/labels/OTHER.png'
const ai = (part_number) => ({ part_number, visible_text: '', damage_notes: [], readable: part_number !== null })
const ocr = (part_number_candidate, image = photo) => ({ photo: image, part_number_candidate, text: 'preserve this evidence' })
const read = (part_number = null, agreement = 'tesseract_only', image = photo) => ({
  photo: image, result: ai(part_number), agreement, read_at: '2026-10-27T12:00:00.000Z',
})
const reportEntry = (part_number = null, candidate = null, agreement = 'tesseract_only') => ({
  item_id: 'TEST-001', photo, ai: ai(part_number), tesseract: ocr(candidate), agreement,
  read_at: '2026-10-27T12:00:00.000Z', label: 'existing label',
})

function fixture(parts, report) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-fix-neither-test-'))
  directories.push(dataDir)
  for (const [file, value] of [['parts.json', parts], ['ai_preread.json', report]]) {
    fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value, null, 2) + '\n')
  }
  return dataDir
}

const load = (dataDir, file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
after(() => directories.forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })))

test('fix-neither changes only null/null agreements using the latest OCR for the same photo', () => {
  const parts = [
    {
      item_id: 'TEST-001', untouched: { state: 'preserve', history: [1, 2] },
      ocr: [ocr('OLD-123'), ocr(null), ocr('OTHER-456', otherPhoto)],
      ai_reads: [read(), read('AI-123'), read(null, 'agree'), read(null, 'tesseract_only', otherPhoto)],
    },
    { item_id: 'TEST-002', ocr: [ocr(null), ocr('LATEST-123')], ai_reads: [read()] },
    { item_id: 'TEST-003', ocr: [ocr(null, otherPhoto)], ai_reads: [read()] },
    { item_id: 'TEST-004', ocr: [ocr(undefined)], ai_reads: [read()] },
    { item_id: 'TEST-005', ocr: [ocr(null)], ai_reads: [{ ...read(), result: {} }] },
    { item_id: 'TEST-006', ocr: [ocr(null)], ai_reads: [{ ...read(), result: null }] },
    { item_id: 'TEST-007', ocr: null, ai_reads: [read()] },
    { item_id: 'TEST-008', ocr: [ocr(null)], ai_reads: null },
    { item_id: 'TEST-009', ocr: [ocr(null)], ai_reads: [read('', 'tesseract_only')] },
    { item_id: 'TEST-010', ocr: [ocr(null, undefined)], ai_reads: [{ ...read(), photo: undefined }] },
  ]
  const report = [
    reportEntry(),
    reportEntry('AI-123'),
    reportEntry(null, 'OCR-123'),
    reportEntry(null, null, 'agree'),
    reportEntry(null, null, 'disagree'),
    reportEntry(null, null, 'ai_only'),
    reportEntry(null, null, 'neither'),
    { ...reportEntry(), ai: null },
    { ...reportEntry(), ai: {} },
    { ...reportEntry(), tesseract: null },
    { ...reportEntry(), tesseract: { photo } },
    { ...reportEntry(), tesseract: ocr(null, otherPhoto) },
    reportEntry('', null),
  ]
  const dataDir = fixture(parts, report)
  const expectedParts = load(dataDir, 'parts.json')
  const expectedReport = load(dataDir, 'ai_preread.json')
  expectedParts[0].ai_reads[0].agreement = 'neither'
  expectedReport[0].agreement = 'neither'
  const logs = []
  assert.deepEqual(fixNeither({ dataDir, logger: { log: (line) => logs.push(line) } }), { parts: 1, preread: 1, total: 2 })
  assert.deepEqual(load(dataDir, 'parts.json'), expectedParts)
  assert.deepEqual(load(dataDir, 'ai_preread.json'), expectedReport)
  assert.deepEqual(logs, ['fix-neither: parts.json=1, ai_preread.json=1, total=2 entries changed'])
})

test('fix-neither is idempotent and does not rewrite files with zero changes', () => {
  const dataDir = fixture([{ ocr: [ocr(null)], ai_reads: [read()] }], [reportEntry()])
  const logger = { log() {} }
  assert.equal(fixNeither({ dataDir, logger }).total, 2)
  const before = ['parts.json', 'ai_preread.json'].map((file) => fs.readFileSync(path.join(dataDir, file)))
  assert.deepEqual(fixNeither({ dataDir, logger }), { parts: 0, preread: 0, total: 0 })
  for (const [index, file] of ['parts.json', 'ai_preread.json'].entries()) {
    assert.deepEqual(fs.readFileSync(path.join(dataDir, file)), before[index])
  }
})

test('fix-neither command uses a temporary data directory and prints its counts', () => {
  const dataDir = fixture([{ ocr: [ocr(null)], ai_reads: [read()] }], [reportEntry()])
  const command = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/fix-neither.js', import.meta.url))], {
    env: { FILTA_DATA_DIR: dataDir }, encoding: 'utf8',
  })
  assert.equal(command.status, 0, command.stderr)
  assert.equal(command.stderr, '')
  assert.match(command.stdout, /parts\.json=1, ai_preread\.json=1, total=2 entries changed/)
  assert.equal(load(dataDir, 'parts.json')[0].ai_reads[0].agreement, 'neither')
  assert.equal(load(dataDir, 'ai_preread.json')[0].agreement, 'neither')
})
