import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Tests run against a temporary copy of the data files, never the real ones.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-test-'))
fs.copyFileSync(
  path.resolve('../data/parts.json'),
  path.join(tmpDir, 'parts.json')
)
fs.copyFileSync(
  path.resolve('../data/compatibility_map.json'),
  path.join(tmpDir, 'compatibility_map.json')
)
process.env.FILTA_DATA_DIR = tmpDir

const { createApp } = await import('../src/index.js')
const app = createApp({ ai: { config: { apiKey: '', liveEnabled: false }, cliPath: null } })

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('GET /api/health returns ok', async () => {
  const res = await request(app).get('/api/health')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { ok: true })
})

test('GET /api/parts returns all 10 records', async () => {
  const res = await request(app).get('/api/parts')
  assert.equal(res.status, 200)
  assert.equal(res.body.parts.length, 10)
  for (const part of res.body.parts) {
    assert.ok(part.item_id.startsWith('MIR-'))
    assert.ok(part.field_sources)
    assert.ok(Array.isArray(part.history))
  }
})

test('GET /api/parts?status= filters by readiness_status', async () => {
  const res = await request(app).get('/api/parts?status=ready_for_review')
  assert.equal(res.status, 200)
  assert.equal(res.body.parts.length, 3)
  for (const part of res.body.parts) {
    assert.equal(part.readiness_status, 'ready_for_review')
  }

  const missing = await request(app).get('/api/parts?status=information_missing')
  assert.equal(missing.body.parts.length, 5)

  const specialist = await request(app).get('/api/parts?status=specialist_review_required')
  assert.equal(specialist.body.parts.length, 2)
})

test('GET /api/parts?status= with an invalid value returns 400', async () => {
  const res = await request(app).get('/api/parts?status=nonsense')
  assert.equal(res.status, 400)
  assert.ok(res.body.error)
})

test('GET /api/parts/:id returns one record', async () => {
  const res = await request(app).get('/api/parts/MIR-0001')
  assert.equal(res.status, 200)
  assert.equal(res.body.item_id, 'MIR-0001')
  assert.equal(res.body.donor_vehicle.make, 'Toyota')
})

test('GET /api/parts/:id returns 404 for unknown id', async () => {
  const res = await request(app).get('/api/parts/MIR-9999')
  assert.equal(res.status, 404)
  assert.ok(res.body.error.includes('not found'))
})

test('PUT /api/parts/:id writes field_sources and history', async () => {
  const before = (await request(app).get('/api/parts/MIR-0007')).body
  const res = await request(app)
    .put('/api/parts/MIR-0007')
    .send({ donor_vehicle: { year: 2015 } })
  assert.equal(res.status, 200)
  assert.equal(res.body.donor_vehicle.year, 2015)
  assert.equal(res.body.field_sources['donor_vehicle.year'], 'seller edit')
  assert.equal(res.body.history.length, before.history.length + 1)
  assert.deepEqual(res.body.history.slice(0, -1), before.history)
  assert.equal(res.body.history.at(-1).field, 'donor_vehicle.year')
  assert.equal(res.body.history.at(-1).old, 2018)
  assert.equal(res.body.history.at(-1).new, 2015)
  assert.equal(res.body.history.at(-1).by, 'seller')

  // Persisted: a second read sees the same record.
  const again = await request(app).get('/api/parts/MIR-0007')
  assert.equal(again.body.donor_vehicle.year, 2015)
  assert.deepEqual(again.body.history, res.body.history)
})

test('PUT /api/parts/:id cannot change item_id', async () => {
  const res = await request(app)
    .put('/api/parts/MIR-0001')
    .send({ item_id: 'MIR-9999' })
  assert.equal(res.status, 400)
  assert.ok(res.body.error.includes('item_id'))

  const unchanged = await request(app).get('/api/parts/MIR-0001')
  assert.equal(unchanged.body.item_id, 'MIR-0001')
})

test('PUT /api/parts/:id cannot set seller_approval', async () => {
  const res = await request(app)
    .put('/api/parts/MIR-0001')
    .send({ seller_approval: { approved: true, approved_at: '2026-10-27T00:00:00Z' } })
  assert.equal(res.status, 400)
  assert.ok(res.body.error.includes('seller_approval'))
})

test('PUT /api/parts/:id returns 404 for unknown id', async () => {
  const res = await request(app)
    .put('/api/parts/MIR-9999')
    .send({ part_details: { placement: 'Left' } })
  assert.equal(res.status, 404)
})

test('PUT /api/parts/:id rejects gaps_and_conflicts as computed field', async () => {
  const res = await request(app)
    .put('/api/parts/MIR-0001')
    .send({ gaps_and_conflicts: [] })
  assert.equal(res.status, 400)
  assert.ok(res.body.error.includes('gaps_and_conflicts'))
})

test('PUT /api/parts/:id rejects readiness_status as computed field', async () => {
  const res = await request(app)
    .put('/api/parts/MIR-0001')
    .send({ readiness_status: 'ready_for_review' })
  assert.equal(res.status, 400)
  assert.ok(res.body.error.includes('readiness_status'))
})

test('POST /api/parts/:id/approve blocked when specialist review required', async () => {
  const res = await request(app).post('/api/parts/MIR-0009/approve')
  assert.equal(res.status, 409)
  assert.ok(res.body.error.includes('specialist review required'))
})

test('POST /api/parts/:id/approve is blocked when gaps exist', async () => {
  const res = await request(app).post('/api/parts/MIR-0004/approve')
  assert.equal(res.status, 409)
  assert.ok(res.body.error.includes('cannot approve'))

  const record = await request(app).get('/api/parts/MIR-0004')
  assert.equal(record.body.seller_approval.approved, false)
})

test('POST /api/parts/:id/approve succeeds when clean', async () => {
  const res = await request(app).post('/api/parts/MIR-0002/approve')
  assert.equal(res.status, 200)
  assert.equal(res.body.seller_approval.approved, true)
  assert.ok(res.body.seller_approval.approved_at)
})

test('POST /api/parts/:id/approve returns 404 for unknown id', async () => {
  const res = await request(app).post('/api/parts/MIR-9999/approve')
  assert.equal(res.status, 404)
})

test('GET /api/compatibility/:partNumber returns the entry', async () => {
  const res = await request(app).get('/api/compatibility/SBM-7940-LC17')
  assert.equal(res.status, 200)
  assert.equal(res.body.source, 'synthetic reference catalogue (test data, not verified)')
  assert.ok(res.body.region_notes)
})

test('GET /api/compatibility/:partNumber returns 404 for unknown number', async () => {
  const res = await request(app).get('/api/compatibility/SBM-0000')
  assert.equal(res.status, 404)
  assert.ok(res.body.error)
})

test('unknown API route returns JSON 404', async () => {
  const res = await request(app).get('/api/nope')
  assert.equal(res.status, 404)
  assert.ok(res.body.error)
})
