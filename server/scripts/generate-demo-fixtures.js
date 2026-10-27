// Generates the offline demo fixtures in data/demo/ with sharp from SVG.
// Run with: npm run fixtures -w server
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const demoDir = path.resolve(__dirname, '../../data/demo')
fs.mkdirSync(demoDir, { recursive: true })

const LABEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400">
  <rect width="1200" height="400" fill="white"/>
  <text x="60" y="220" font-family="Helvetica, Arial, sans-serif" font-size="130"
    font-weight="bold" fill="black">SBM-7941-NP16</text>
  <text x="60" y="320" font-family="Helvetica, Arial, sans-serif" font-size="52"
    fill="black">MADE IN JAPAN</text>
</svg>`

// Clear label: white background, large black part number, small second line.
await sharp(Buffer.from(LABEL_SVG)).png().toFile(path.join(demoDir, 'clear_label.png'))

// Blurry label: the same label heavily blurred.
await sharp(Buffer.from(LABEL_SVG)).blur(22).png().toFile(path.join(demoDir, 'blurry_label.png'))

// Inventory sheet with 3 rows: one clean mirror, one whose year conflicts
// with its notes_ar, and one with an empty part_number.
const inventoryCsv = [
  'sku,item_id,make,model,year,side,colour,part_number,testing_status,notes_ar,notes_en,weight_kg',
  'MIR-0021,MIR-0021,Toyota,Land Cruiser,2019,Right,White,SBM-7950-LC19,Visual inspection only,"مرآة يمين من لاند كروزر 2019، خدش خفيف على الإطار","Right mirror from Land Cruiser 2019, light scuff on housing",2.4',
  'MIR-0022,MIR-0022,GMC,Acadia,2018,Left,Silver,SBM-7951-AC15,Visual inspection only,"مرآة يسار من أكاديمي 2015، الجسم سليم","Left mirror from Acadia, housing intact",2.1',
  'MIR-0023,MIR-0023,Hyundai,Tucson,2016,Right,Black,,Untested,"مرآة يمين من توسان 2016، بدون رقم قطعة","Right mirror from Tucson 2016, no part number",1.9',
].join('\n')

fs.writeFileSync(path.join(demoDir, 'inventory.csv'), inventoryCsv + '\n', 'utf8')

console.log(`fixtures written to ${demoDir}`)
