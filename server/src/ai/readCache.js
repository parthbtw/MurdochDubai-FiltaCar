import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { DATA_DIR, writeJson } from '../store.js'
import { sanitizeAiError, validateLabelResult } from './codebuddyReader.js'

// Shared across app instances so only one uncached read runs at a time.
let busy = false

function busyError() {
  return Object.assign(new Error('CodeBuddy AI is busy; try again later'), { status: 429, code: 'AI_BUSY' })
}

function hashImage(imagePath) {
  return createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex')
}

export function createReadCache({ dataDir = DATA_DIR, reader, key = '' } = {}) {
  const cachePath = path.join(dataDir, 'ai_read_cache.json')
  const lockPath = path.join(dataDir, 'ai_read_cache.lock')
  function load() {
    if (!fs.existsSync(cachePath)) return { version: 1, reads: {} }
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
      if (data.version !== 1 || !data.reads || typeof data.reads !== 'object' || Array.isArray(data.reads)) throw new Error()
      return data
    } catch {
      // Do not spend credits again when an existing cache cannot be read.
      throw new Error('CodeBuddy AI cache is unreadable; manual review required')
    }
  }
  function validate(entry) {
    if (typeof entry.read_at !== 'string' || Number.isNaN(Date.parse(entry.read_at))) throw new Error('CodeBuddy AI cache has an invalid read timestamp')
    if (typeof entry.error === 'string') {
      return { error: sanitizeAiError(entry.error, key), read_at: entry.read_at }
    }
    const result = validateLabelResult(entry.result)
    if (key && JSON.stringify(result).includes(key)) throw new Error('CodeBuddy AI returned sensitive output')
    return { result, read_at: entry.read_at }
  }
  return {
    has(imagePath) {
      const entry = load().reads[hashImage(imagePath)]
      if (!entry) return false
      validate(entry)
      return true
    },
    async read(imagePath) {
      const hash = hashImage(imagePath)
      const existing = load().reads[hash]
      if (existing) {
        const entry = validate(existing)
        if (entry.error !== undefined) throw new Error(entry.error)
        return entry
      }
      if (busy) throw busyError()
      let lock
      try {
        lock = fs.openSync(lockPath, 'wx', 0o600)
      } catch (error) {
        if (error.code === 'EEXIST') throw busyError()
        throw error
      }
      busy = true
      try {
        // A different process may have finished between lookup and locking.
        const completed = load().reads[hash]
        if (completed) {
          const entry = validate(completed)
          if (entry.error !== undefined) throw new Error(entry.error)
          return entry
        }
        let result
        try {
          result = validateLabelResult(await reader(imagePath))
          if (key && JSON.stringify(result).includes(key)) throw new Error('CodeBuddy AI returned sensitive output')
        } catch (error) {
          // Failed paid attempts are cached too, so retries do not spend again.
          const message = sanitizeAiError(error, key)
          const cache = load()
          cache.reads[hash] = { error: message, read_at: new Date().toISOString() }
          writeJson(cachePath, cache)
          throw new Error(message)
        }
        if (hashImage(imagePath) !== hash) throw new Error('photo changed during the CodeBuddy AI read')
        const entry = { result, read_at: new Date().toISOString() }
        const cache = load()
        cache.reads[hash] = entry
        writeJson(cachePath, cache)
        return structuredClone(entry)
      } finally {
        busy = false
        fs.closeSync(lock)
        fs.unlinkSync(lockPath)
      }
    },
  }
}
