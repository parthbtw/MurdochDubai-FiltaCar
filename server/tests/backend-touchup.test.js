import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-touchup-'))
const seedParts = JSON.parse(fs.readFileSync(path.resolve(here, '../../data/parts.json'), 'utf8'))
process.env.FILTA_DATA_DIR = tmpDir
const { createApp } = await import('../src/index.js')
const app = createApp({ ai: { config: { apiKey: '', liveEnabled: false }, cliPath: null } })

beforeEach(() => {
  fs.writeFileSync(path.join(tmpDir, 'parts.json'), JSON.stringify(seedParts))
  fs.copyFileSync(path.resolve(here, '../../data/compatibility_map.json'), path.join(tmpDir, 'compatibility_map.json'))
})
after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

function assertWithdrawn(part, previous) {
  assert.deepEqual(part.seller_approval, { approved: false, approved_at: null })
  assert.equal(part.field_sources['seller_approval.approved'], 'withdrawn after change')
  const withdrawal = part.history.filter(entry => entry.by === 'system: changed after approval')
  assert.equal(withdrawal.length, 1)
  assert.deepEqual(withdrawal[0], {
    at: withdrawal[0].at, field: 'seller_approval', old: previous,
    new: { approved: false, approved_at: null }, by: 'system: changed after approval',
  })
  assert.equal(new Date(withdrawal[0].at).toISOString(), withdrawal[0].at)
  assert.equal(part.corridor.checklist.items.find(item => item.id === 'seller_approval').status, 'unknown')
}

test('changed PUT withdraws approval, while the same PUT after fresh approval keeps it', async () => {
  const approved = await request(app).post('/api/parts/MIR-0001/approve')
  assert.equal(approved.status, 200)
  const changed = await request(app).put('/api/parts/MIR-0001').send({ storage_location: 'BT1 rack' })
  assert.equal(changed.status, 200)
  assertWithdrawn(changed.body, approved.body.seller_approval)
  const fresh = await request(app).post('/api/parts/MIR-0001/approve')
  assert.equal(fresh.status, 200)
  const same = await request(app).put('/api/parts/MIR-0001').send({ storage_location: 'BT1 rack' })
  assert.equal(same.status, 200)
  assert.deepEqual(same.body.seller_approval, fresh.body.seller_approval)
  assert.deepEqual(same.body.history, fresh.body.history)
  assert.equal(same.body.corridor.checklist.items.find(item => item.id === 'seller_approval').status, 'pass')
  const saved = await request(app).get('/api/parts/MIR-0001')
  assert.deepEqual(saved.body.seller_approval, fresh.body.seller_approval)
})

test('CSV upload updating an approved record withdraws approval', async () => {
  const approved = await request(app).post('/api/parts/MIR-0001/approve')
  assert.equal(approved.status, 200)
  const uploaded = await request(app).post('/api/upload')
    .attach('sheet', Buffer.from('item_id,storage_location\nMIR-0001,BT1 new rack\n'), 'update.csv')
  assert.equal(uploaded.status, 200)
  assert.deepEqual(uploaded.body.updated, ['MIR-0001'])
  assertWithdrawn(uploaded.body.parts[0], approved.body.seller_approval)
})

test('CSV upload with no changes preserves approval', async () => {
  const approved = await request(app).post('/api/parts/MIR-0001/approve')
  assert.equal(approved.status, 200)
  const uploaded = await request(app).post('/api/upload')
    .attach('sheet', Buffer.from('item_id\nMIR-0001\n'), 'unchanged.csv')
  assert.equal(uploaded.status, 200)
  assert.deepEqual(uploaded.body.updated, [])
  const saved = await request(app).get('/api/parts/MIR-0001')
  assert.deepEqual(saved.body.seller_approval, approved.body.seller_approval)
})

test('seller part number fills MIR-0004 with verification metadata and clears readiness', async () => {
  const edited = await request(app).put('/api/parts/MIR-0004')
    .send({ part_details: { part_number: { extracted_value: 'SBM-7941-NP16' } } })
  assert.equal(edited.status, 200)
  assert.deepEqual(edited.body.part_details.part_number, {
    extracted_value: 'SBM-7941-NP16', extraction_method: 'seller edit', requires_manual_verification: false,
  })
  assert.equal(edited.body.readiness_status, 'ready_for_review')
  for (const field of ['extracted_value', 'extraction_method', 'requires_manual_verification']) {
    const fieldPath = `part_details.part_number.${field}`
    assert.equal(edited.body.field_sources[fieldPath], 'seller edit')
    assert.ok(edited.body.history.some(entry => entry.field === fieldPath && entry.by === 'seller'))
  }
})

test('explicit seller part number metadata is preserved', async () => {
  for (const override of [{ extraction_method: 'label checked by seller' }, { requires_manual_verification: true }]) {
    const edited = await request(app).put('/api/parts/MIR-0004')
      .send({ part_details: { part_number: { extracted_value: `PN-${Object.keys(override)[0]}`, ...override } } })
    assert.equal(edited.status, 200)
    for (const [field, value] of Object.entries(override)) assert.equal(edited.body.part_details.part_number[field], value)
    assert.notEqual(edited.body.part_details.part_number.extraction_method, 'seller edit')
  }
})

test('clearing a part number to null or empty requires manual verification', async () => {
  for (const value of [null, '', '   ']) {
    await request(app).put('/api/parts/MIR-0004')
      .send({ part_details: { part_number: { extracted_value: 'SELLER-123' } } })
    const cleared = await request(app).put('/api/parts/MIR-0004')
      .send({ part_details: { part_number: { extracted_value: value } } })
    assert.equal(cleared.status, 200)
    assert.equal(cleared.body.part_details.part_number.requires_manual_verification, true)
  }
})

test('draft sentence forms preserve stored damage and honesty wording', async () => {
  const checked = await request(app).put('/api/parts/MIR-0001').send({})
  assert.equal(checked.status, 200)
  const description = checked.body.draft.description
  assert.match(description, /^Used\. Light scuff on housing edge\./)
  assert.ok(description.includes('O/S (offside, right) (guidance, verify).'))
  assert.ok(description.includes('verify against the part number (guidance, verify).'))
  assert.equal(description.includes('. guidance, verify.'), false)
  for (const wording of ['Untested, not described as working.', 'donor vehicle, not a fitment guarantee', 'not verified', 'Buyer must match the part number before purchase.']) {
    assert.ok(description.includes(wording), wording)
  }
  assert.deepEqual(checked.body.condition.cosmetic_damage, ['light scuff on housing edge'])
  const estimated = await request(app).put('/api/parts/MIR-0005').send({})
  assert.equal(estimated.status, 200)
  assert.ok(estimated.body.draft.description.includes('Shipping guidance, verify: 2 to 15 kg (estimated, weight not provided).'))
})

test('seller_field_edits excludes approvals while seller_edits keeps counting them', async () => {
  const before = (await request(app).get('/api/metrics')).body
  assert.equal((await request(app).post('/api/parts/MIR-0001/approve')).status, 200)
  const approved = (await request(app).get('/api/metrics')).body
  assert.equal(approved.seller_edits, before.seller_edits + 1)
  assert.equal(approved.seller_field_edits, before.seller_field_edits)
  assert.equal((await request(app).put('/api/parts/MIR-0001').send({ storage_location: 'BT1 rack' })).status, 200)
  const edited = (await request(app).get('/api/metrics')).body
  assert.equal(edited.seller_edits, before.seller_edits + 2)
  assert.equal(edited.seller_field_edits, before.seller_field_edits + 1)
})

test('seller number changes tag both metadata sources even when verification was already false', async () => {
  const edited = await request(app).put('/api/parts/MIR-0001')
    .send({ part_details: { part_number: { extracted_value: 'SELLER-CHANGED-123' } } })
  assert.equal(edited.status, 200)
  assert.equal(edited.body.part_details.part_number.extraction_method, 'seller edit')
  assert.equal(edited.body.part_details.part_number.requires_manual_verification, false)
  for (const field of ['extraction_method', 'requires_manual_verification']) {
    assert.equal(edited.body.field_sources[`part_details.part_number.${field}`], 'seller edit')
  }
})
