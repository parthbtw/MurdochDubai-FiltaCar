import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.FILTA_DATA_DIR
  ? path.resolve(process.env.FILTA_DATA_DIR)
  : path.resolve(__dirname, '../../data')

export function partsPath() {
  return path.join(DATA_DIR, 'parts.json')
}

export function compatibilityPath() {
  return path.join(DATA_DIR, 'compatibility_map.json')
}

// Reads a JSON file, returning the parsed contents.
export function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

// Writes JSON atomically: serialize, write to a temp file, then rename over
// the target so a crash mid-write never corrupts the data file.
export function writeJson(filePath, value) {
  const tmpPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2) + '\n', 'utf8')
  fs.renameSync(tmpPath, filePath)
}

export function readParts() {
  return readJson(partsPath())
}

export function writeParts(parts) {
  writeJson(partsPath(), parts)
}

export function readCompatibilityMap() {
  return readJson(compatibilityPath())
}
