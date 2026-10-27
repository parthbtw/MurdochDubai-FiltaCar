import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-ai-test-'))
const seedParts = JSON.parse(fs.readFileSync(path.resolve(here, '../../data/parts.json'), 'utf8'))
const photo = '/demo/labels/read.png'
const otherPhoto = '/demo/labels/other.png'
const key = 'dummy-codebuddy-key-for-redaction-test'
const config = { apiKey: key, liveEnabled: true }
let fixtureNumber = 0
process.env.FILTA_DATA_DIR = tmpDir

const { createApp } = await import('../src/index.js')
const { newRecord } = await import('../src/records.js')
const { applyAgreement } = await import('../src/ai/agreement.js')

function result(partNumber = 'SBM-7941-NP16') {
  return {
    part_number: partNumber,
    visible_text: partNumber || '',
    damage_notes: [],
    readable: Boolean(partNumber),
  }
}

function ocr(candidate = 'SBM-7941-NP16', entryPhoto = photo, unclear = false) {
  return {
    engine: 'tesseract.js (local)',
    photo: entryPhoto,
    text: candidate || '',
    confidence: unclear ? 30 : 90,
    unclear,
    quality: { sharpness: unclear ? 1 : 1000, blurry: unclear },
    part_number_candidate: candidate,
    read_at: '2026-10-27T12:00:00.000Z',
  }
}

function blankPart() {
  const part = newRecord('MIR-0004')
  part.photos = [photo, otherPhoto]
  part.ocr = [ocr()]
  return part
}

function readData() {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8'))
}

function savePart(part) {
  const parts = readData()
  parts[parts.findIndex((p) => p.item_id === part.item_id)] = part
  fs.writeFileSync(path.join(tmpDir, 'parts.json'), JSON.stringify(parts, null, 2) + '\n')
}

function appWith(reader = async () => result(), extra = {}) {
  return createApp({ ai: { reader, config, cliPath: '/fake/codebuddy', ...extra } })
}

beforeEach(() => {
  fixtureNumber++
  fs.mkdirSync(path.join(tmpDir, 'demo', 'labels'), { recursive: true })
  const bytes = Buffer.from(`synthetic image bytes for fake reader ${fixtureNumber}`)
  fs.writeFileSync(path.join(tmpDir, 'demo', 'labels', 'read.png'), bytes)
  fs.writeFileSync(path.join(tmpDir, 'demo', 'labels', 'other.png'), bytes)
  fs.writeFileSync(path.join(tmpDir, 'parts.json'), JSON.stringify(seedParts, null, 2) + '\n')
  fs.copyFileSync(path.resolve(here, '../../data/compatibility_map.json'), path.join(tmpDir, 'compatibility_map.json'))
  fs.rmSync(path.join(tmpDir, 'ai_read_cache.json'), { force: true })
  savePart(blankPart())
})

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

test('agreement normalizes the same-photo candidates and records combined provenance', () => {
  const part = blankPart()
  part.ocr = [ocr(' sbm-7941- np16 '), ocr('OTHER-123', otherPhoto)]
  const entry = applyAgreement(part, { photo, result: result(), mode: 'live', readAt: '2026-10-27T12:01:00.000Z' })
  const source = 'OCR + CodeBuddy AI agree (photo 1)'
  assert.equal(entry.agreement, 'agree')
  assert.equal(part.part_details.part_number.extracted_value, 'SBM-7941-NP16')
  assert.equal(part.part_details.part_number.extraction_method, source)
  assert.equal(part.part_details.part_number.requires_manual_verification, false)
  for (const field of ['extracted_value', 'extraction_method', 'requires_manual_verification']) {
    assert.equal(part.field_sources[`part_details.part_number.${field}`], source)
  }
  assert.ok(part.history.some((h) => h.field === 'part_details.part_number.extracted_value' && h.by === 'CodeBuddy AI + OCR'))
  assert.deepEqual(part.ai_reads, [entry])
  assert.equal(entry.engine, 'CodeBuddy AI')
  assert.equal(entry.mode, 'live')
  assert.equal(entry.photo, photo)
  assert.equal(entry.read_at, '2026-10-27T12:01:00.000Z')
  assert.ok(part.field_sources.ai_reads)
})

test('agreement uses the newest reading for the exact photo', () => {
  const part = blankPart()
  part.ocr = [ocr('OLD-123'), ocr(), ocr('UNRELATED-456', otherPhoto)]
  assert.equal(applyAgreement(part, { photo, result: result(), mode: 'build-time' }).agreement, 'agree')
})

test('agreement never overwrites a different existing number or its provenance', () => {
  const part = blankPart()
  part.part_details.part_number = { extracted_value: 'EXISTING-123', extraction_method: 'spreadsheet', requires_manual_verification: false }
  part.field_sources['part_details.part_number.extracted_value'] = 'spreadsheet row 1'
  const before = structuredClone(part.part_details)
  assert.equal(applyAgreement(part, { photo, result: result(), mode: 'live' }).agreement, 'agree')
  assert.deepEqual(part.part_details, before)
  assert.equal(part.field_sources['part_details.part_number.extracted_value'], 'spreadsheet row 1')
})

test('disagreement and AI-only reads remain evidence and set no facts', () => {
  for (const candidate of ['OTHER-123', null]) {
    const part = blankPart()
    part.ocr = [ocr(candidate)]
    const before = structuredClone({ details: part.part_details, condition: part.condition, donor: part.donor_vehicle })
    const entry = applyAgreement(part, { photo, result: result(), mode: 'live' })
    assert.equal(entry.agreement, candidate ? 'disagree' : 'ai_only')
    assert.deepEqual({ details: part.part_details, condition: part.condition, donor: part.donor_vehicle }, before)
  }
})

test('Tesseract-only fallback keeps B2 confidence and no-overwrite rules', () => {
  const clear = blankPart()
  assert.equal(applyAgreement(clear, { photo, result: result(null), mode: 'live' }).agreement, 'tesseract_only')
  assert.equal(clear.part_details.part_number.extracted_value, 'SBM-7941-NP16')
  assert.equal(clear.part_details.part_number.extraction_method, 'OCR photo 1')
  const unclear = blankPart()
  unclear.ocr = [ocr('SBM-7941-NP16', photo, true)]
  applyAgreement(unclear, { photo, result: result(null), mode: 'live' })
  assert.equal(unclear.part_details.part_number.extracted_value, null)
  assert.equal(unclear.part_details.part_number.requires_manual_verification, true)
  const existing = blankPart()
  existing.part_details.part_number.extracted_value = 'EXISTING-123'
  applyAgreement(existing, { photo, result: result(null), mode: 'live' })
  assert.equal(existing.part_details.part_number.extracted_value, 'EXISTING-123')
})

test('neither records null readings, keeps the number empty and requires manual verification', () => {
  const part = blankPart()
  part.ocr = [ocr(null, photo, true)]
  part.part_details.part_number.requires_manual_verification = false
  const entry = applyAgreement(part, { photo, result: result(null), mode: 'live' })
  assert.equal(entry.agreement, 'neither')
  assert.equal(part.part_details.part_number.extracted_value, null)
  assert.equal(part.part_details.part_number.requires_manual_verification, true)
  assert.equal(part.ai_reads.at(-1).agreement, 'neither')
  const existing = blankPart()
  existing.ocr = [ocr(null, photo, true)]
  existing.part_details.part_number.extracted_value = 'EXISTING-123'
  applyAgreement(existing, { photo, result: result(null), mode: 'live' })
  assert.equal(existing.part_details.part_number.extracted_value, 'EXISTING-123')
})

test('ai-read failure returns manual fallback, keeps record bytes and redacts the key from responses and logs', async () => {
  const logged = []
  const original = { log: console.log, warn: console.warn, error: console.error }
  for (const name of Object.keys(original)) console[name] = (...args) => logged.push(args.join(' '))
  try {
    const app = appWith(async () => { throw new Error(`offline; credential ${key}`) })
    const before = fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8')
    const res = await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo })
    assert.equal(res.status, 503)
    assert.equal(res.body.fallback, 'manual')
    assert.ok(res.body.error)
    assert.equal(res.text.includes(key), false)
    assert.equal(logged.join('\n').includes(key), false)
    assert.equal(fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8'), before)
  } finally {
    Object.assign(console, original)
  }
})

test('SHA-256 cache avoids repeated calls across photos and app recreation', async () => {
  let calls = 0
  const reader = async () => { calls++; return result() }
  const firstApp = appWith(reader)
  const first = await request(firstApp).post('/api/parts/MIR-0004/ai-read').send({ photo })
  assert.equal(first.status, 200)
  const again = await request(firstApp).post('/api/parts/MIR-0004/ai-read').send({ photo })
  assert.equal(again.status, 200)
  assert.equal(again.body.ai_reads.length, first.body.ai_reads.length)
  const secondApp = appWith(reader)
  const other = await request(secondApp).post('/api/parts/MIR-0004/ai-read').send({ photo: otherPhoto })
  assert.equal(other.status, 200)
  assert.equal(calls, 1)
  assert.equal(other.body.ai_reads.at(-1).photo, otherPhoto)
})

test('failed attempts briefly suppress repeat clicks across app instances without being written to disk', async () => {
  let calls = 0
  const reader = async () => { calls++; throw new Error(`offline ${key}`) }
  const before = fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8')
  for (const requestedPhoto of [photo, otherPhoto]) {
    const response = await request(appWith(reader)).post('/api/parts/MIR-0004/ai-read').send({ photo: requestedPhoto })
    assert.equal(response.status, 503)
    assert.equal(response.body.fallback, 'manual')
    assert.equal(response.text.includes(key), false)
  }
  assert.equal(calls, 1)
  assert.equal(fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8'), before)
  assert.equal(fs.existsSync(path.join(tmpDir, 'ai_read_cache.json')), false)
})

test('sensitive successful reader output is rejected before cache or record persistence', async () => {
  const app = appWith(async () => ({ ...result(), visible_text: key }))
  const before = fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8')
  const response = await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo })
  assert.equal(response.status, 503)
  assert.equal(response.body.fallback, 'manual')
  assert.equal(response.text.includes(key), false)
  assert.equal(fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8'), before)
  assert.equal(fs.existsSync(path.join(tmpDir, 'ai_read_cache.json')), false)
})

test('a cache lock held by another process returns 429 without calling the reader', async () => {
  let calls = 0
  const lock = path.join(tmpDir, 'ai_read_cache.lock')
  fs.writeFileSync(lock, '')
  const app = appWith(async () => { calls++; return result() })
  try {
    const response = await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo })
    assert.equal(response.status, 429)
    assert.equal(calls, 0)
  } finally {
    fs.rmSync(lock, { force: true })
  }
  assert.equal((await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo })).status, 200)
  assert.equal(calls, 1)
  assert.equal(fs.existsSync(lock), false)
})

test('reader and checks errors carrying HTTP statuses still use 503 and manual fallback', async () => {
  for (const extra of [
    { reader: async () => { throw Object.assign(new Error(`upstream ${key}`), { status: 400 }) } },
    { reader: async () => result(), checks: () => { throw Object.assign(new Error(`checks ${key}`), { status: 409 }) } },
  ]) {
    fs.writeFileSync(path.join(tmpDir, 'demo', 'labels', 'read.png'), `independent status test ${fixtureNumber++}`)
    fs.rmSync(path.join(tmpDir, 'ai_read_cache.json'), { force: true })
    const app = appWith(extra.reader, extra)
    const before = fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8')
    const response = await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo })
    assert.equal(response.status, 503)
    assert.equal(response.body.fallback, 'manual')
    assert.equal(response.text.includes(key), false)
    assert.equal(fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8'), before)
  }
})

test('checks cannot expose or persist a credential in a successful response', async () => {
  const app = appWith(async () => result(), { checks: () => ({ draft: { text: key } }) })
  const before = fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8')
  const response = await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo })
  assert.equal(response.status, 503)
  assert.equal(response.body.fallback, 'manual')
  assert.equal(response.text.includes(key), false)
  assert.equal(fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8'), before)
})

test('a cached image cannot bypass supported image extensions', async () => {
  let calls = 0
  const app = appWith(async () => { calls++; return result() })
  assert.equal((await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo })).status, 200)
  const invalidPhoto = '/demo/labels/read.txt'
  fs.copyFileSync(path.join(tmpDir, 'demo', 'labels', 'read.png'), path.join(tmpDir, 'demo', 'labels', 'read.txt'))
  const part = readData().find((entry) => entry.item_id === 'MIR-0004')
  part.photos.push(invalidPhoto)
  savePart(part)
  const response = await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo: invalidPhoto })
  assert.equal(response.status, 400)
  assert.equal(calls, 1)
})

test('cached evidence remains usable offline without another reader call', async () => {
  let calls = 0
  const reader = async () => { calls++; return result() }
  assert.equal((await request(appWith(reader)).post('/api/parts/MIR-0004/ai-read').send({ photo })).status, 200)
  const offlineApp = appWith(reader, { config: { apiKey: '', liveEnabled: false }, cliPath: null })
  const res = await request(offlineApp).post('/api/parts/MIR-0004/ai-read').send({ photo: otherPhoto })
  assert.equal(res.status, 200)
  assert.equal(calls, 1)
})

test('one live reader call at a time returns 429 while busy', async () => {
  let release
  let started
  const reading = new Promise((resolve) => { started = resolve })
  const deferred = new Promise((resolve) => { release = resolve })
  const app = appWith(async () => { started(); return deferred })
  const first = request(app).post('/api/parts/MIR-0004/ai-read').send({ photo }).then((res) => res)
  await reading
  try {
    const busy = await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo: otherPhoto })
    assert.equal(busy.status, 429)
  } finally {
    release(result())
  }
  assert.equal((await first).status, 200)
})

test('ai-read persists every returned checks key and preserves intervening seller edits', async () => {
  let release
  let started
  const reading = new Promise((resolve) => { started = resolve })
  const deferred = new Promise((resolve) => { release = resolve })
  const app = appWith(async () => { started(); return deferred }, {
    checks: () => ({ readiness_status: 'information_missing', draft: { text: 'checked' }, extra_check_key: ['retained'] }),
  })
  const first = request(app).post('/api/parts/MIR-0004/ai-read').send({ photo }).then((res) => res)
  await reading
  const edit = await request(app).put('/api/parts/MIR-0004').send({ donor_vehicle: { year: 2020 } })
  assert.equal(edit.status, 200)
  release(result())
  const res = await first
  assert.equal(res.status, 200)
  assert.equal(res.body.donor_vehicle.year, 2020)
  assert.deepEqual(res.body.extra_check_key, ['retained'])
  assert.deepEqual(res.body.draft, { text: 'checked' })
  assert.ok(res.body.field_sources.extra_check_key)
  assert.deepEqual(readData().find((p) => p.item_id === 'MIR-0004').extra_check_key, ['retained'])
})

test('checks failure returns 503 and leaves the record unchanged', async () => {
  const app = appWith(async () => result(), { checks: () => { throw new Error(`failed ${key}`) } })
  const before = fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8')
  const res = await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo })
  assert.equal(res.status, 503)
  assert.equal(res.body.fallback, 'manual')
  assert.equal(res.text.includes(key), false)
  assert.equal(fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8'), before)
})

test('ai-accept only accepts an ai_only reading with seller provenance', async () => {
  const part = blankPart()
  part.ocr = [ocr(null)]
  applyAgreement(part, { photo, result: result(), mode: 'live' })
  savePart(part)
  const app = appWith()
  const res = await request(app).post('/api/parts/MIR-0004/ai-accept').send({ read_index: 0 })
  assert.equal(res.status, 200)
  const source = 'CodeBuddy AI, confirmed by seller'
  assert.equal(res.body.part_details.part_number.extracted_value, 'SBM-7941-NP16')
  assert.equal(res.body.part_details.part_number.extraction_method, source)
  assert.equal(res.body.part_details.part_number.requires_manual_verification, false)
  for (const field of ['extracted_value', 'extraction_method', 'requires_manual_verification']) {
    assert.equal(res.body.field_sources[`part_details.part_number.${field}`], source)
  }
  assert.ok(res.body.history.some((h) => h.field === 'part_details.part_number.extracted_value' && h.by === 'seller'))
})

test('ai-accept rejects other agreements, invalid indices and an existing different number', async () => {
  const part = blankPart()
  applyAgreement(part, { photo, result: result('OTHER-123'), mode: 'live' })
  savePart(part)
  const app = appWith()
  for (const read_index of [0, -1, 99, '0', 0.5, null]) {
    const res = await request(app).post('/api/parts/MIR-0004/ai-accept').send({ read_index })
    assert.equal(res.status, 400)
  }
  part.ocr = [ocr(null)]
  applyAgreement(part, { photo, result: result(), mode: 'live' })
  part.part_details.part_number.extracted_value = 'EXISTING-123'
  savePart(part)
  const before = fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8')
  const res = await request(app).post('/api/parts/MIR-0004/ai-accept').send({ read_index: 1 })
  assert.equal(res.status, 409)
  assert.equal(fs.readFileSync(path.join(tmpDir, 'parts.json'), 'utf8'), before)
})

test('status is unavailable without a key, when disabled, or when CLI is absent', async () => {
  for (const extra of [
    { config: { apiKey: '', liveEnabled: true } },
    { config: { apiKey: key, liveEnabled: false } },
    { cliPath: null },
  ]) {
    const app = appWith(async () => { throw new Error('reader must not run') }, extra)
    const status = await request(app).get('/api/ai/status')
    assert.equal(status.status, 200)
    assert.equal(status.body.available, false)
    assert.equal(typeof status.body.reason, 'string')
    assert.ok(status.body.reason)
    assert.equal(status.text.includes(key), false)
    const res = await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo })
    assert.equal(res.status, 503)
    assert.equal(res.body.fallback, 'manual')
  }
  const available = await request(appWith()).get('/api/ai/status')
  assert.equal(available.body.available, true)
  assert.equal(available.text.includes(key), false)
})

test('PUT rejects ai_reads as a protected field', async () => {
  const res = await request(appWith()).put('/api/parts/MIR-0004').send({ ai_reads: [] })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /ai_reads/)
})

test('ai-read validates part and attached photo before calling the reader', async () => {
  let calls = 0
  const app = appWith(async () => { calls++; return result() })
  assert.equal((await request(app).post('/api/parts/MIR-9999/ai-read').send({ photo })).status, 404)
  for (const body of [{}, { photo: otherPhoto + 'missing' }, { photo: 42 }]) {
    assert.equal((await request(app).post('/api/parts/MIR-0004/ai-read').send(body)).status, 400)
  }
  assert.equal(calls, 0)
})

test('ai-read rejects attached paths escaping public photo directories', async () => {
  let calls = 0
  const app = appWith(async () => { calls++; return result() })
  const part = blankPart()
  part.photos.push('/demo/../../parts.json')
  savePart(part)
  const res = await request(app).post('/api/parts/MIR-0004/ai-read').send({ photo: '/demo/../../parts.json' })
  assert.ok([400, 503].includes(res.status))
  assert.equal(calls, 0)
})

test('/demo serves attached demo label files', async () => {
  const res = await request(appWith()).get(photo)
  assert.equal(res.status, 200)
  assert.match(res.headers['content-type'], /image\/png/)
})
