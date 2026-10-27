import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, readParts, writeParts } from '../store.js'
import {
  createCodebuddyReader,
  findCodebuddy,
  loadAiConfig,
  sanitizeAiError,
  validateLabelResult,
} from '../ai/codebuddyReader.js'
import { createReadCache } from '../ai/readCache.js'
import { acceptAiRead, applyAgreement, applyChecks } from '../ai/agreement.js'
import { runChecks } from '../checks/index.js'

class AiRequestError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function requestError(message, status = 400) {
  return new AiRequestError(message, status)
}

function resolvePhoto(photo) {
  const relative = photo.startsWith('/') ? photo.slice(1) : photo
  if (!/\.(png|jpe?g|webp)$/i.test(relative)) {
    throw requestError('photo must be a png, jpeg or webp image')
  }
  const folder = relative.split('/')[0]
  if (!['demo', 'uploads'].includes(folder)) {
    throw requestError('photo must reference an uploaded or demo image')
  }
  const dataRoot = fs.realpathSync(DATA_DIR)
  const expectedRoot = path.join(dataRoot, folder)
  const root = fs.realpathSync(expectedRoot)
  const absolute = fs.realpathSync(path.resolve(DATA_DIR, relative))
  if (root !== expectedRoot || !absolute.startsWith(`${root}${path.sep}`) ||
    !fs.statSync(absolute).isFile()) {
    throw requestError('photo path is outside the image directory')
  }
  return absolute
}

export function createAiRouter({
  reader,
  config = loadAiConfig(),
  cliPath = findCodebuddy(),
  checks = runChecks,
  cache,
} = {}) {
  const router = Router()
  const labelReader = reader || createCodebuddyReader({ config, command: cliPath })
  const reads = cache || createReadCache({ reader: labelReader, key: config.apiKey })

  function status() {
    if (!config.liveEnabled) return { available: false, reason: 'live AI reading is disabled' }
    if (!config.apiKey) return { available: false, reason: 'CodeBuddy API key is not configured' }
    if (!cliPath) return { available: false, reason: 'CodeBuddy CLI was not found at startup' }
    return { available: true, reason: null }
  }

  function fail(res, error, fallback = false) {
    const code = error instanceof AiRequestError ? error.status : error.code === 'AI_BUSY' ? 429 : 503
    const body = { error: sanitizeAiError(error, config.apiKey) }
    if (fallback && code === 503) body.fallback = 'manual'
    return res.status(code).json(body)
  }

  function ensureSafeRecord(part) {
    if (config.apiKey && JSON.stringify(part).includes(config.apiKey)) {
      throw new Error('record output contained a credential and was discarded')
    }
  }

  router.get('/ai/status', (req, res) => {
    res.json(status())
  })

  router.post('/parts/:id/ai-read', async (req, res) => {
    try {
      const original = readParts().find((part) => part.item_id === req.params.id)
      if (!original) throw requestError(`part ${req.params.id} not found`, 404)
      const photo = req.body?.photo
      if (typeof photo !== 'string' || !original.photos?.includes(photo)) {
        throw requestError('photo must be in the part photos')
      }
      const imagePath = resolvePhoto(photo)
      const availability = status()
      if (!reads.has(imagePath) && !availability.available) {
        throw new Error(availability.reason)
      }
      const reading = await reads.read(imagePath)
      validateLabelResult(reading.result)
      if (config.apiKey && JSON.stringify(reading.result).includes(config.apiKey)) {
        throw new Error('CodeBuddy output contained a credential and was discarded')
      }

      // Reload after the slow reader so an intervening seller edit is preserved.
      const parts = readParts()
      const index = parts.findIndex((part) => part.item_id === req.params.id)
      if (index === -1) throw requestError(`part ${req.params.id} not found`, 404)
      const part = structuredClone(parts[index])
      if (!part.photos?.includes(photo)) {
        throw requestError('photo is no longer in the part photos')
      }
      const alreadyApplied = part.ai_reads?.some((entry) =>
        entry.mode === 'live' && entry.photo === photo && entry.read_at === reading.read_at
      )
      if (alreadyApplied) {
        ensureSafeRecord(part)
        return res.json(part)
      }

      applyAgreement(part, {
        photo,
        result: reading.result,
        mode: 'live',
        readAt: reading.read_at,
      })
      applyChecks(part, checks)
      ensureSafeRecord(part)
      parts[index] = part
      writeParts(parts)
      return res.json(part)
    } catch (error) {
      return fail(res, error, true)
    }
  })

  router.post('/parts/:id/ai-accept', (req, res) => {
    try {
      const parts = readParts()
      const index = parts.findIndex((part) => part.item_id === req.params.id)
      if (index === -1) throw requestError(`part ${req.params.id} not found`, 404)
      const readIndex = req.body?.read_index
      if (!Number.isInteger(readIndex) || readIndex < 0) {
        throw requestError('read_index must be a non-negative integer')
      }
      const part = structuredClone(parts[index])
      try {
        acceptAiRead(part, readIndex)
      } catch (error) {
        if ([400, 409].includes(error.status)) throw requestError(error.message, error.status)
        throw error
      }
      applyChecks(part, checks)
      ensureSafeRecord(part)
      parts[index] = part
      writeParts(parts)
      return res.json(part)
    } catch (error) {
      return fail(res, error, true)
    }
  })

  return router
}
