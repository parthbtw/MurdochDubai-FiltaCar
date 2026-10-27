import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { DATA_DIR, writeJson } from '../store.js'
import { sanitizeAiError, validateLabelResult } from './codebuddyReader.js'

// Shared across app instances so only one uncached read runs at a time.
let busy = false
const failures = new Map()
const FAILURE_WINDOW_MS = 60000

function forgetFailure(cacheKey) {
  const failure = failures.get(cacheKey)
  if (failure) clearTimeout(failure.timer)
  failures.delete(cacheKey)
}

function rememberFailure(cacheKey, message, now) {
  forgetFailure(cacheKey)
  const timer = setTimeout(() => failures.delete(cacheKey), FAILURE_WINDOW_MS)
  timer.unref()
  failures.set(cacheKey, { message, expiresAt: now() + FAILURE_WINDOW_MS, timer })
}

function busyError() {
  return Object.assign(new Error('CodeBuddy AI is busy; try again later'), { status: 429, code: 'AI_BUSY' })
}

function hashImage(imagePath) {
  return createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex')
}

export function createReadCache({ dataDir = DATA_DIR, reader, key = '', now = Date.now } = {}) {
  const cachePath = path.resolve(dataDir, 'ai_read_cache.json')
  const lockPath = path.join(dataDir, 'ai_read_cache.lock')
  function load() {
    if (!fs.existsSync(cachePath)) return { version: 1, reads: {} }
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
      if (data.version !== 1 || !data.reads || typeof data.reads !== 'object' || Array.isArray(data.reads)) throw new Error()
      // Legacy failures never block a retry and are dropped on the next save.
      data.reads = Object.fromEntries(Object.entries(data.reads).filter(([, entry]) => !entry || !Object.hasOwn(entry, 'error')))
      return data
    } catch {
      // Do not spend credits again when an existing cache cannot be read.
      throw new Error('CodeBuddy AI cache is unreadable; manual review required')
    }
  }
  function validate(entry) {
    if (typeof entry.read_at !== 'string' || Number.isNaN(Date.parse(entry.read_at))) throw new Error('CodeBuddy AI cache has an invalid read timestamp')
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
    async read(imagePath, { force = false } = {}) {
      const hash = hashImage(imagePath)
      const cacheKey = `${cachePath}:${hash}`
      const existing = load().reads[hash]
      if (existing) {
        return validate(existing)
      }
      const failure = failures.get(cacheKey)
      if (failure) {
        if (!force && now() < failure.expiresAt) throw new Error(sanitizeAiError(failure.message, key))
        forgetFailure(cacheKey)
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
          return validate(completed)
        }
        let result
        try {
          result = validateLabelResult(await reader(imagePath))
          if (key && JSON.stringify(result).includes(key)) throw new Error('CodeBuddy AI returned sensitive output')
        } catch (error) {
          // Briefly suppress repeat clicks without persisting a failed read.
          const message = sanitizeAiError(error, key)
          rememberFailure(cacheKey, message, now)
          throw new Error(message)
        }
        if (hashImage(imagePath) !== hash) throw new Error('photo changed during the CodeBuddy AI read')
        const entry = { result, read_at: new Date().toISOString() }
        const cache = load()
        cache.reads[hash] = entry
        writeJson(cachePath, cache)
        forgetFailure(cacheKey)
        return structuredClone(entry)
      } finally {
        busy = false
        fs.closeSync(lock)
        fs.unlinkSync(lockPath)
      }
    },
  }
}
