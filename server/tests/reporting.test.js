import { test, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { parse } from 'csv-parse/sync'
import { buildQuestionPack } from '../src/checks/index.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-reporting-test-'))
const partsFile = path.join(tmpDir, 'parts.json')
process.env.FILTA_DATA_DIR = tmpDir
const { createApp } = await import('../src/index.js')
const app = createApp({ ai: {
  config: { apiKey: '', liveEnabled: false },
  cliPath: null,
  reader: async () => { throw new Error('reporting must not call the reader') },
} })

const headers = [
  'Status', 'Custom label', 'Title', 'Description', 'Condition', 'Category',
  'Placement on Vehicle', 'Manufacturer Part Number', 'Colour', 'Price', 'Approved at', 'Sources',
]
let expectedBytes

function save(parts) {
  expectedBytes = JSON.stringify(parts, null, 2) + '\n'
  fs.writeFileSync(partsFile, expectedBytes)
}

beforeEach(() => save([]))
afterEach(() => assert.equal(fs.readFileSync(partsFile, 'utf8'), expectedBytes, 'GET routes must not write records'))
after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

function approvedPart(overrides = {}) {
  return {
    item_id: 'TEST-001',
    seller_approval: { approved: true, approved_at: '2026-10-27T12:00:00.000Z' },
    draft: {
      title: 'Left mirror, "silver" مرآة',
      description: 'Used, light scuff\nSecond line: "check glass"\nمرآة مستعملة',
      item_specifics: {
        'Placement on Vehicle': 'N/S (nearside, left)',
        'Manufacturer Part Number': 'SBM-TEST-1',
        Colour: 'silver',
      },
    },
    part_details: {
      placement: 'Left', colour: 'silver',
      part_number: { extracted_value: 'SBM-TEST-1' },
    },
    condition: { state: 'Used', cosmetic_damage: ['light scuff'] },
    field_sources: {
      'part_details.placement': 'spreadsheet row 1',
      'part_details.part_number.extracted_value': 'photo label',
      'part_details.colour': 'seller edit',
      'condition.state': 'Arabic yard note',
      'condition.cosmetic_damage': 'Arabic yard note',
      'draft.title': 'saved title provenance',
      'draft.description': 'saved description provenance',
      history: 'audit only', photos: 'photo upload only', seller_id: 'seller register only',
    },
    ...overrides,
  }
}

function csvDownload() {
  return request(app).get('/api/export/ebay.csv').buffer(true).parse((response, callback) => {
    const chunks = []
    response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    response.on('end', () => callback(null, Buffer.concat(chunks)))
    response.on('error', callback)
  })
}

test('export preview requires strict seller approval and a non-empty stored draft title', async () => {
  save([
    approvedPart(),
    approvedPart({ item_id: 'UNAPPROVED', seller_approval: { approved: false }, draft: null }),
    approvedPart({ item_id: 'NO-DRAFT', draft: null }),
    approvedPart({ item_id: 'BLANK-TITLE', draft: { title: ' \t\n' } }),
    approvedPart({ item_id: 'STRING-APPROVAL', seller_approval: { approved: 'true' } }),
    approvedPart({ item_id: 'NO-APPROVAL', seller_approval: undefined }),
  ])
  const response = await request(app).get('/api/export/preview')
  assert.equal(response.status, 200)
  assert.equal(response.headers['x-export-status'], 'MOCK, NOT PUBLISHED')
  assert.deepEqual(response.body, {
    included: ['TEST-001'],
    excluded: [
      { item_id: 'UNAPPROVED', reason: 'not approved by seller' },
      { item_id: 'NO-DRAFT', reason: 'no draft' },
      { item_id: 'BLANK-TITLE', reason: 'no draft' },
      { item_id: 'STRING-APPROVAL', reason: 'not approved by seller' },
      { item_id: 'NO-APPROVAL', reason: 'not approved by seller' },
    ],
  })
})

test('CSV preserves quoted multilingual values, includes a BOM and only approved drafts, and labels every row mock', async () => {
  const first = approvedPart()
  const longTitle = 'مرآة '.repeat(30)
  save([
    first,
    approvedPart({ item_id: 'LONG-TITLE', draft: { title: longTitle, description: '', item_specifics: {} } }),
    approvedPart({ item_id: 'UNAPPROVED', seller_approval: { approved: false } }),
    approvedPart({ item_id: 'NO-DRAFT', draft: null }),
    approvedPart({ item_id: 'BLANK', draft: { title: '  ' } }),
  ])
  const response = await csvDownload()
  assert.equal(response.status, 200)
  assert.equal(response.headers['x-export-status'], 'MOCK, NOT PUBLISHED')
  assert.match(response.headers['content-type'], /^text\/csv; charset=utf-8$/i)
  assert.match(response.headers['content-disposition'], /^attachment; filename="filtacar_mock_ebay_export_\d{4}-\d{2}-\d{2}\.csv"$/)
  assert.deepEqual([...response.body.subarray(0, 3)], [0xef, 0xbb, 0xbf])
  const rows = parse(response.body, { bom: true })
  assert.deepEqual(rows[0], headers)
  assert.equal(rows.length, 3)
  const records = parse(response.body, { bom: true, columns: true })
  assert.deepEqual(records.map((row) => row['Custom label']), ['TEST-001', 'LONG-TITLE'])
  for (const row of records) {
    assert.equal(row.Status, 'MOCK, NOT PUBLISHED')
    assert.equal(row.Condition, 'Used')
    assert.equal(row.Category, 'Car Mirrors')
    assert.equal(row.Price, 'seller to set')
    assert.equal(row['Approved at'], first.seller_approval.approved_at)
  }
  assert.equal(records[0].Title, first.draft.title)
  assert.equal(records[0].Description, first.draft.description)
  for (const name of ['Placement on Vehicle', 'Manufacturer Part Number', 'Colour']) {
    assert.equal(records[0][name], first.draft.item_specifics[name])
    assert.equal(records[1][name], '', 'absent specifics must not be filled from raw part fields')
  }
  assert.equal(records[1].Title, Array.from(longTitle).slice(0, 80).join(''))
  assert.equal(Array.from(records[1].Title).length, 80)
  const sources = records[0].Sources.split('; ')
  assert.deepEqual(new Set(sources), new Set([
    'spreadsheet row 1', 'photo label', 'seller edit', 'Arabic yard note',
    'saved title provenance', 'saved description provenance',
  ]))
  assert.equal(sources.length, new Set(sources).size)
  assert.doesNotMatch(records[0].Sources, /audit only|photo upload only|seller register only/)
})

test('CSV is header-only with a BOM when no part is approved or the dataset is empty', async () => {
  for (const parts of [[], [approvedPart({ seller_approval: { approved: false } })]]) {
    save(parts)
    const response = await csvDownload()
    assert.equal(response.status, 200)
    assert.deepEqual([...response.body.subarray(0, 3)], [0xef, 0xbb, 0xbf])
    assert.deepEqual(parse(response.body, { bom: true }), [headers])
  }
})

test('export provenance omits suppressed facts and retains stored draft and corridor sources', async () => {
  const part = approvedPart({
    draft: {
      title: 'Used mirror',
      description: 'Used. N/S (nearside, left). Left-hand drive warning. Shipping guidance, verify: under 2 kg.',
      item_specifics: { 'Placement on Vehicle': 'N/S (nearside, left)' },
    },
    donor_vehicle: { drive_side: 'LHD' },
    weight_kg: 1.2,
    corridor: {
      uk_side_wording: { value: 'N/S (nearside, left)' },
      drive_side_warning: { value: 'Left-hand drive warning.' },
      shipping: { tier: 'under 2 kg', estimated: false },
    },
    gaps_and_conflicts: [{ field: 'part_details.part_number.extracted_value', type: 'conflict' }],
    field_sources: {
      draft: 'stored checks output',
      'part_details.placement': 'side source',
      'donor_vehicle.drive_side': 'registration source',
      weight_kg: 'scale source',
      'part_details.part_number.extracted_value': 'omitted number source',
      'part_details.colour': 'omitted colour source',
      'part_details.brand': 'unused brand source',
      'condition.cosmetic_damage': 'omitted damage source',
      history: 'unrelated history source',
    },
  })
  save([part])
  const response = await csvDownload()
  const [row] = parse(response.body, { bom: true, columns: true })
  assert.deepEqual(new Set(row.Sources.split('; ')), new Set([
    'stored checks output', 'side source', 'registration source', 'scale source',
  ]))
})

test('metrics counts each stored value and reading, including all five agreements and explicit null declines', async () => {
  const reading = (agreement, part_number) => ({ agreement, result: { part_number } })
  save([
    {
      item_id: 'A', seller_approval: { approved: true }, readiness_status: 'ready_for_review',
      field_sources: { a: 'sheet', b: 'same source', empty: '', space: '  ', absent: null },
      questions: [], gaps_and_conflicts: [{ type: 'cannot_claim' }],
      ocr: [{ photo: 'same.png' }, { photo: 'same.png' }],
      ai_reads: [reading('agree', 'A-1'), reading('disagree', 'A-2'), reading('ai_only', 'A-3')],
      history: [{ by: 'seller' }, { by: 'seller' }, { by: 'upload' }],
    },
    {
      item_id: 'B', seller_approval: { approved: false }, readiness_status: 'information_missing',
      field_sources: { a: 'sheet' }, questions: [{}, {}],
      gaps_and_conflicts: [{ type: 'missing' }, { type: 'missing' }, { type: 'conflict' }, { type: 'cannot_claim' }],
      ocr: [{}], ai_reads: [reading('tesseract_only', null), reading('neither', null)],
      history: [{ by: 'seller' }],
    },
    {
      item_id: 'C', seller_approval: { approved: 'true' }, readiness_status: 'specialist_review_required',
      field_sources: { a: 'repeated source', b: 'repeated source' }, questions: [{}],
      gaps_and_conflicts: [{ type: 'conflict' }, { type: 'cannot_claim' }, { type: 'cannot_claim' }],
      ocr: null, ai_reads: [reading('agree', 'C-1'), { agreement: 'agree', result: {} }],
      history: [{ by: 'staff' }, { by: 'Seller' }],
      draft: { blocked_claims: Array.from({ length: 20 }, () => ({})) },
    },
  ])
  const response = await request(app).get('/api/metrics')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    parts_total: 3, approved: 1,
    by_status: { ready_for_review: 1, information_missing: 1, specialist_review_required: 1 },
    facts_with_sources: 5, questions_open: 3, missing_open: 2, conflicts_open: 2, claims_blocked: 4,
    readers: {
      ocr_reads: 3, ai_reads: 7,
      by_agreement: { agree: 3, disagree: 1, ai_only: 1, tesseract_only: 1, neither: 1 },
      ai_declined_to_guess: 2,
    },
    seller_edits: 3,
    time_estimate: {
      manual_minutes_per_listing: 15, filtacar_minutes_per_listing: 3,
      basis: 'assumption for illustration, not measured',
    },
  })
})

test('metrics rereads the file on every request and handles absent arrays and an empty dataset', async () => {
  save([{ item_id: 'A', seller_approval: { approved: true }, readiness_status: 'ready_for_review' }])
  const first = (await request(app).get('/api/metrics')).body
  assert.equal(first.parts_total, 1)
  assert.equal(first.approved, 1)
  save([])
  const response = await request(app).get('/api/metrics')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    parts_total: 0, approved: 0,
    by_status: { ready_for_review: 0, information_missing: 0, specialist_review_required: 0 },
    facts_with_sources: 0, questions_open: 0, missing_open: 0, conflicts_open: 0, claims_blocked: 0,
    readers: {
      ocr_reads: 0, ai_reads: 0,
      by_agreement: { agree: 0, disagree: 0, ai_only: 0, tesseract_only: 0, neither: 0 },
      ai_declined_to_guess: 0,
    },
    seller_edits: 0,
    time_estimate: {
      manual_minutes_per_listing: 15, filtacar_minutes_per_listing: 3,
      basis: 'assumption for illustration, not measured',
    },
  })
})

test('question pack returns the stored bilingual questions through the shared builder without changing the record', async () => {
  const part = {
    item_id: 'TEST-001', original_title_en: 'Mirror', original_title_ar: 'مرآة',
    questions: [
      { field: 'part_details.placement', question_en: 'Which side?', question_ar: 'أي جهة؟' },
      { field: 'donor_vehicle.year', question_en: 'Which year?', question_ar: 'أي سنة؟' },
    ],
  }
  save([part])
  const response = await request(app).get('/api/parts/TEST-001/question-pack')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { item_id: 'TEST-001', text: buildQuestionPack(part), questions_count: 2 })
  for (const question of part.questions) {
    assert.ok(response.body.text.includes(question.question_en))
    assert.ok(response.body.text.includes(question.question_ar))
  }
})

test('question pack handles no open questions and returns JSON 404 for an unknown part', async () => {
  save([{ item_id: 'EMPTY', questions: [] }])
  const response = await request(app).get('/api/parts/EMPTY/question-pack')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    item_id: 'EMPTY', text: 'No open questions.\nلا توجد أسئلة مفتوحة.', questions_count: 0,
  })
  const missing = await request(app).get('/api/parts/UNKNOWN/question-pack')
  assert.equal(missing.status, 404)
  assert.deepEqual(missing.body, { error: 'part UNKNOWN not found' })
})
