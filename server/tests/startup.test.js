import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Tests run against a temporary copy of the data files, never the real ones.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-startup-test-'))

function resetData() {
  fs.copyFileSync(
    path.resolve(__dirname, '../../data/parts.json'),
    path.join(tmpDir, 'parts.json')
  )
  fs.copyFileSync(
    path.resolve(__dirname, '../../data/compatibility_map.json'),
    path.join(tmpDir, 'compatibility_map.json')
  )
}

resetData()
process.env.FILTA_DATA_DIR = tmpDir

const { runChecksOnStartup } = await import('../src/startup.js')
const { readParts } = await import('../src/store.js')

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('startup runs checks on every record and saves the returned keys', async () => {
  const checks = (record) => ({
    gaps_and_conflicts: record.gaps_and_conflicts,
    questions: record.questions,
    readiness_status: 'ready_for_review',
    draft: null,
    corridor: null,
  })
  const result = await runChecksOnStartup({ checks })
  assert.equal(result.total, 10)
  assert.equal(result.processed, 10)
  assert.equal(result.errors.length, 0)

  const parts = readParts()
  assert.equal(parts.length, 10)
  for (const part of parts) {
    assert.equal(part.readiness_status, 'ready_for_review')
    assert.equal(part.draft, null)
  }
})

test('a record whose checks throw is logged and kept unchanged', async () => {
  resetData()
  const checks = (record) => {
    if (record.item_id === 'MIR-0007') {
      throw new Error('check exploded')
    }
    return {
      gaps_and_conflicts: record.gaps_and_conflicts,
      questions: record.questions,
      readiness_status: 'ready_for_review',
      draft: null,
      corridor: null,
    }
  }
  const result = await runChecksOnStartup({ checks })
  assert.equal(result.processed, 9)
  assert.equal(result.errors.length, 1)
  assert.ok(result.errors[0].includes('MIR-0007'))

  const parts = readParts()
  const failed = parts.find((p) => p.item_id === 'MIR-0007')
  assert.equal(failed.readiness_status, 'information_missing')
  assert.deepEqual(failed.gaps_and_conflicts[0].field, 'donor_vehicle.year')

  const others = parts.filter((p) => p.item_id !== 'MIR-0007')
  for (const part of others) {
    assert.equal(part.readiness_status, 'ready_for_review')
  }
})
