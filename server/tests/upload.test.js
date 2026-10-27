import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const demoDir = path.resolve(__dirname, '../../data/demo')

// Tests run against a temporary copy of the data files, never the real ones.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-upload-test-'))
fs.copyFileSync(
  path.resolve(__dirname, '../../data/parts.json'),
  path.join(tmpDir, 'parts.json')
)
fs.copyFileSync(
  path.resolve(__dirname, '../../data/compatibility_map.json'),
  path.join(tmpDir, 'compatibility_map.json')
)
process.env.FILTA_DATA_DIR = tmpDir

const { createApp } = await import('../src/index.js')
const { terminateOcrWorker } = await import('../src/ocr.js')
const app = createApp()

after(async () => {
  // Stop the shared OCR worker so the test process can exit.
  await terminateOcrWorker()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('clear fixture: unclear false, candidate SBM-7941-NP16, part number set', async () => {
  const before = (await request(app).get('/api/parts/MIR-0004')).body
  const photoNumber = before.photos.length + 1
  const res = await request(app)
    .post('/api/upload')
    .field('item_id', 'MIR-0004')
    .attach('photos', path.join(demoDir, 'clear_label.png'), 'clear_label.png')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.updated, ['MIR-0004'])
  assert.equal(res.body.warnings.length, 0)

  const record = res.body.parts[0]
  assert.equal(record.item_id, 'MIR-0004')
  assert.equal(record.part_details.part_number.extracted_value, 'SBM-7941-NP16')
  assert.equal(record.part_details.part_number.extraction_method, `OCR photo ${photoNumber}`)
  assert.equal(record.part_details.part_number.requires_manual_verification, false)
  assert.equal(record.field_sources['part_details.part_number.extracted_value'], `OCR photo ${photoNumber}`)

  assert.ok(Array.isArray(record.ocr))
  const ocr = record.ocr[record.ocr.length - 1]
  assert.equal(ocr.engine, 'tesseract.js (local)')
  assert.equal(ocr.part_number_candidate, 'SBM-7941-NP16')
  assert.equal(ocr.unclear, false)
  assert.equal(ocr.quality.blurry, false)
  assert.ok(ocr.confidence >= 70)
  assert.ok(ocr.photo.startsWith('uploads/MIR-0004/'))
  assert.equal(record.photos.length, photoNumber)
  assert.deepEqual(record.photos.slice(0, -1), before.photos)
  assert.ok(record.history.some((h) => h.field === 'part_details.part_number.extracted_value'))
})

test('blurry fixture: blurry true, unclear true, part number stays null', async () => {
  const res = await request(app)
    .post('/api/upload')
    .field('item_id', 'MIR-0005')
    .attach('photos', path.join(demoDir, 'blurry_label.png'), 'blurry_label.png')
  assert.equal(res.status, 200)
  assert.ok(res.body.warnings.includes('photo blurry, retake'))

  const record = res.body.parts[0]
  assert.equal(record.part_details.part_number.extracted_value, null)
  assert.equal(record.part_details.part_number.requires_manual_verification, true)

  const ocr = record.ocr[record.ocr.length - 1]
  assert.equal(ocr.quality.blurry, true)
  assert.equal(ocr.unclear, true)
  assert.equal(ocr.part_number_candidate, null)
})

test('photos without item_id create MIR-0011', async () => {
  const res = await request(app)
    .post('/api/upload')
    .attach('photos', path.join(demoDir, 'clear_label.png'), 'clear_label.png')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.created, ['MIR-0011'])

  const record = res.body.parts[0]
  assert.equal(record.item_id, 'MIR-0011')
  assert.equal(record.readiness_status, 'information_missing')
  assert.equal(record.seller_id, null)
  assert.equal(record.photos.length, 1)
  assert.ok(record.photos[0].startsWith('uploads/MIR-0011/'))
  assert.ok(Array.isArray(record.ocr) && record.ocr.length === 1)
  // New record had no part number, clear OCR sets it.
  assert.equal(record.part_details.part_number.extracted_value, 'SBM-7941-NP16')
})

test('CSV import creates parts with spreadsheet row sources', async () => {
  const res = await request(app)
    .post('/api/upload')
    .attach('sheet', path.join(demoDir, 'inventory.csv'), 'inventory.csv')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.created, ['MIR-0021', 'MIR-0022', 'MIR-0023'])
  assert.ok(!res.body.warnings.some((w) => w.includes('ignored unexpected column')))

  const byId = Object.fromEntries(res.body.parts.map((p) => [p.item_id, p]))

  const clean = byId['MIR-0021']
  assert.equal(clean.donor_vehicle.make, 'Toyota')
  assert.equal(clean.donor_vehicle.year, 2019)
  assert.equal(clean.part_details.placement, 'Right')
  assert.equal(clean.part_details.colour_code, 'White')
  assert.equal(clean.part_details.part_number.extracted_value, 'SBM-7950-LC19')
  assert.equal(clean.condition.testing_status, 'Visual inspection only')
  assert.ok(clean.notes_ar.includes('مرآة'))
  assert.equal(clean.weight_kg, 2.4)
  assert.equal(clean.field_sources['donor_vehicle.make'], 'spreadsheet row 1 (inventory.csv)')
  assert.equal(clean.field_sources['weight_kg'], 'spreadsheet row 1 (inventory.csv)')

  // Row 2: CSV year 2018 while notes_ar says 2015.
  const conflict = byId['MIR-0022']
  assert.equal(conflict.donor_vehicle.year, 2018)
  assert.ok(conflict.notes_ar.includes('2015'))

  // Row 3: empty part_number stays null, never guessed.
  const noNumber = byId['MIR-0023']
  assert.equal(noNumber.part_details.part_number.extracted_value, null)
  assert.equal(noNumber.part_details.part_number.requires_manual_verification, true)
  assert.equal(noNumber.condition.testing_status, 'Untested')

  // Persisted through GET.
  const list = await request(app).get('/api/parts')
  assert.ok(list.body.parts.some((p) => p.item_id === 'MIR-0021'))
})

test('CSV value differing from an existing value is kept as a candidate', async () => {
  const csv = 'item_id,make,year\nMIR-0001,Toyota,1999\n'
  const res = await request(app)
    .post('/api/upload')
    .attach('sheet', Buffer.from(csv), 'conflict.csv')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.updated, ['MIR-0001'])

  const record = res.body.parts[0]
  // Existing value kept, never overwritten.
  assert.equal(record.donor_vehicle.year, 2017)
  assert.equal(record.donor_vehicle.make, 'Toyota')
  // New value stored as a candidate for Developer C's checks.
  assert.deepEqual(record.candidates, {
    'donor_vehicle.year': { value: 1999, source: 'spreadsheet row 1 (conflict.csv)' },
  })
  assert.ok(res.body.warnings.some((w) => w.includes('kept as candidate')))

  const persisted = await request(app).get('/api/parts/MIR-0001')
  assert.equal(persisted.body.donor_vehicle.year, 2017)
  assert.equal(persisted.body.candidates['donor_vehicle.year'].value, 1999)
})

test('non-image upload returns 400', async () => {
  const res = await request(app)
    .post('/api/upload')
    .field('item_id', 'MIR-0001')
    .attach('photos', Buffer.from('just text'), 'notes.txt')
  assert.equal(res.status, 400)
  assert.ok(res.body.error.includes('jpg, png or webp'))
})

test('non-CSV sheet returns 400', async () => {
  const res = await request(app)
    .post('/api/upload')
    .attach('sheet', Buffer.from('just text'), 'notes.txt')
  assert.equal(res.status, 400)
  assert.ok(res.body.error.includes('CSV'))
})

test('upload with no photos or sheet returns 400', async () => {
  const res = await request(app).post('/api/upload')
  assert.equal(res.status, 400)
  assert.ok(res.body.error.includes('no photos or sheet'))
})

test('upload for unknown item_id returns 404', async () => {
  const res = await request(app)
    .post('/api/upload')
    .field('item_id', 'MIR-9999')
    .attach('photos', path.join(demoDir, 'clear_label.png'), 'clear_label.png')
  assert.equal(res.status, 404)
})

test('uploaded photo is served from /uploads', async () => {
  const uploadRes = await request(app)
    .post('/api/upload')
    .field('item_id', 'MIR-0006')
    .attach('photos', path.join(demoDir, 'clear_label.png'), 'clear_label.png')
  assert.equal(uploadRes.status, 200)
  const photoPath = uploadRes.body.parts[0].photos.at(-1)

  const staticRes = await request(app).get(`/${photoPath}`)
  assert.equal(staticRes.status, 200)
  assert.equal(staticRes.headers['content-type'], 'image/png')
})
