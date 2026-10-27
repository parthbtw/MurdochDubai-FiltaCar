export type SourceKind = 'spreadsheet' | 'arabic_note' | 'translation' | 'seller_record' | 'document_photo' | 'ocr' | 'ai' | 'readers_agree' | 'ai_confirmed' | 'seller_edit' | 'computed' | 'reference' | 'demo' | 'other'
export interface ClassifiedSource { kind: SourceKind; title: string; explanation: string; photoNumber?: number; row?: number; file?: string }
export function classifySource(label: string): ClassifiedSource {
  const lower = label.toLowerCase()
  const photoNumber = /photo\s+(\d+)/i.exec(label)?.[1]
  const photo = photoNumber ? { photoNumber: Number(photoNumber) } : {}
  const result = (kind: SourceKind, explanation: string): ClassifiedSource => ({ kind, title: label, explanation, ...photo })
  if (lower.includes('confirmed by seller')) return result('ai_confirmed', 'Read by the second reader and confirmed by the seller')
  if (/\bagree\b/.test(lower)) return result('readers_agree', 'Two independent readers returned the same number')
  const sheet = /^spreadsheet row (\d+)(?: \((.+)\))?$/i.exec(label)
  if (sheet) return { ...result('spreadsheet', `From row ${sheet[1]} of the seller's inventory spreadsheet${sheet[2] ? ` (${sheet[2]})` : ''}`), row: Number(sheet[1]), ...(sheet[2] ? { file: sheet[2] } : {}) }
  if (lower === 'arabic yard note') return result('arabic_note', "From the seller's original Arabic yard note")
  if (lower.includes('translation')) return result('translation', "Translated from the seller's original Arabic title")
  if (lower === 'seller sku label' || lower === 'seller register') return result('seller_record', lower.includes('sku') ? "From the seller's item label" : "From the seller's register")
  if (lower === 'seller edit') return result('seller_edit', 'Changed by the seller')
  if (lower.includes('registration photo')) return result('document_photo', 'From a photo of the donor vehicle registration')
  if (lower.includes('codebuddy') || /\bai\b/.test(lower)) return result('ai', 'Read from a recorded image by the second reader. Reading evidence, not a verified fact')
  if (lower.includes('ocr') || lower.includes('tesseract') || lower === 'photo label') return result('ocr', photoNumber ? `Read from photo ${photoNumber} by the offline label reader` : 'Read from a recorded image by the offline label reader')
  if (lower === 'runchecks' || lower === 'import validation' || lower === "worked out by filtacar's checks") return { ...result('computed', "Worked out by FiltaCar's checks"), title: "Worked out by FiltaCar's checks" }
  if (lower.includes('reference catalogue')) return result('reference', 'Synthetic reference catalogue, test data, not verified')
  if (lower.includes('demo')) return result('demo', 'From the synthetic demo pack, test data only')
  return result('other', label)
}

export const sourceTitle = (source: string | null | undefined) => source ? classifySource(source).title : 'No source recorded'
