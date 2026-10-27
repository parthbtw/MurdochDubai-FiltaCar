import { readParts, writeParts } from './store.js'
import { runChecks } from './checks/index.js'

// Runs Developer C's checks on every record on server start, saves the
// returned keys and writes parts.json once. Each record is wrapped in
// try/catch: on error it is logged and the record is kept unchanged.
export async function runChecksOnStartup({ checks = runChecks } = {}) {
  const parts = readParts()
  const errors = []
  let processed = 0

  for (const part of parts) {
    try {
      const checked = checks(structuredClone(part))
      for (const key of Object.keys(checked)) {
        part[key] = checked[key]
      }
      processed++
    } catch (err) {
      errors.push(`${part.item_id}: ${err.message}`)
      console.error(`startup checks failed for ${part.item_id}: ${err.message}`)
    }
  }

  writeParts(parts)
  return { processed, errors, total: parts.length }
}
