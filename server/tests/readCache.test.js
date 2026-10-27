import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createReadCache } from '../src/ai/readCache.js'

const testDirs = []
const result = { part_number: 'SBM-7941-NP16', visible_text: 'SBM-7941-NP16', damage_notes: [], readable: true }

function fixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-retry-test-'))
  testDirs.push(dataDir)
  const imagePath = path.join(dataDir, 'label.png')
  fs.copyFileSync(new URL('../../data/demo/clear_label.png', import.meta.url), imagePath)
  return { dataDir, imagePath, cacheFile: path.join(dataDir, 'ai_read_cache.json') }
}

after(() => {
  for (const directory of testDirs) fs.rmSync(directory, { recursive: true, force: true })
})

test('a failure is retried after 60 seconds and only its successful result reaches disk', async () => {
  const { dataDir, imagePath, cacheFile } = fixture()
  let time = 0
  let calls = 0
  const reader = async () => {
    calls++
    if (calls === 1) throw new Error('offline')
    return result
  }
  const options = { dataDir, reader, now: () => time }
  const cache = createReadCache(options)
  await assert.rejects(cache.read(imagePath), /offline/)
  assert.equal(cache.has(imagePath), false)
  assert.equal(fs.existsSync(cacheFile), false)
  time = 59999
  await assert.rejects(createReadCache(options).read(imagePath), /offline/)
  assert.equal(calls, 1)
  time = 60000
  assert.deepEqual((await cache.read(imagePath)).result, result)
  assert.equal(calls, 2)
  assert.equal(cache.has(imagePath), true)
  const stored = Object.values(JSON.parse(fs.readFileSync(cacheFile, 'utf8')).reads)
  assert.equal(stored.length, 1)
  assert.deepEqual(stored[0].result, result)
  assert.equal(Object.hasOwn(stored[0], 'error'), false)
  await createReadCache({ ...options, reader: async () => { throw new Error('must use success cache') } }).read(imagePath)
})

test('force bypasses a recent failure while still retaining successful cached results', async () => {
  const { dataDir, imagePath } = fixture()
  let calls = 0
  const cache = createReadCache({ dataDir, reader: async () => {
    if (++calls === 1) throw new Error('temporary failure')
    return result
  } })
  await assert.rejects(cache.read(imagePath), /temporary failure/)
  await assert.rejects(cache.read(imagePath), /temporary failure/)
  assert.equal(calls, 1)
  assert.deepEqual((await cache.read(imagePath, { force: true })).result, result)
  await cache.read(imagePath, { force: true })
  assert.equal(calls, 2)
})

test('legacy disk error entries are absent even with invalid timestamps and are dropped on success', async () => {
  const { dataDir, imagePath, cacheFile } = fixture()
  const hash = createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex')
  fs.writeFileSync(cacheFile, JSON.stringify({ version: 1, reads: {
    [hash]: { error: 'legacy failure', read_at: 'invalid timestamp' },
    old_error: { error: 'another old failure' },
  } }))
  let calls = 0
  const cache = createReadCache({ dataDir, reader: async () => { calls++; return result } })
  assert.equal(cache.has(imagePath), false)
  assert.deepEqual((await cache.read(imagePath)).result, result)
  assert.equal(calls, 1)
  const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  assert.deepEqual(Object.keys(saved.reads), [hash])
  assert.equal(Object.hasOwn(saved.reads[hash], 'error'), false)
})

test('a new failed read leaves an existing successful cache file unchanged', async () => {
  const { dataDir, imagePath, cacheFile } = fixture()
  const cache = createReadCache({ dataDir, reader: async (image) => {
    if (image !== imagePath) throw new Error('offline')
    return result
  } })
  await cache.read(imagePath)
  const before = fs.readFileSync(cacheFile, 'utf8')
  const secondImage = path.join(dataDir, 'other.png')
  fs.writeFileSync(secondImage, 'different image bytes for fake reader')
  await assert.rejects(cache.read(secondImage), /offline/)
  assert.equal(fs.readFileSync(cacheFile, 'utf8'), before)
})
