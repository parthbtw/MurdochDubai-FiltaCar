// Synthetic labels use only part numbers already present in the records.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { DATA_DIR, readJson } from '../src/store.js'

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char])
}

export async function generateAiLabels({ dataDir = DATA_DIR } = {}) {
  const parts = readJson(path.join(dataDir, 'parts.json'))
  const labelsDir = path.join(dataDir, 'demo', 'labels')
  fs.mkdirSync(labelsDir, { recursive: true })
  const generated = []

  for (let number = 1; number <= 10; number++) {
    const id = `MIR-${String(number).padStart(4, '0')}`
    const part = parts.find((record) => record.item_id === id)
    if (!part) throw new Error(`missing demo part ${id}`)

    // A null seed number stays blank; no synthetic fact is invented.
    let text = part.part_details.part_number.extracted_value || ''
    if (id === 'MIR-0010' && text) {
      const last = text.at(-1)
      text = text.slice(0, -1) + (last === 'X' ? 'Y' : 'X')
    }
    const patch = id === 'MIR-0005'
      ? '<rect x="600" y="0" width="600" height="400" fill="#888888"/>'
      : ''
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400">
  <rect width="1200" height="400" fill="white"/>
  <rect x="12" y="12" width="1176" height="376" fill="none" stroke="black" stroke-width="4"/>
  <text x="55" y="100" font-family="Helvetica, Arial, sans-serif" font-size="42" fill="black">PART NUMBER</text>
  <text x="55" y="265" font-family="Helvetica, Arial, sans-serif" font-size="108" font-weight="bold" fill="black">${escapeXml(text)}</text>
  ${patch}
</svg>`
    let image = sharp(Buffer.from(svg))
    if (id === 'MIR-0004') image = image.blur(22)
    const imagePath = path.join(labelsDir, `${id}.png`)
    await image.png().toFile(imagePath)
    generated.push(imagePath)
  }
  return generated
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const generated = await generateAiLabels()
  console.log(`generated ${generated.length} demo labels`)
}
