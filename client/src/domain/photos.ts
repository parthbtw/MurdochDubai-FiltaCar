import type { PartRecord } from '@/api/types'
export function photoUrl(path: string): string {
  if (/^(?:https?:|\/\/|data:|blob:)/i.test(path)) return ''
  return path.startsWith('/') ? path : `/${path}`
}
export function newestOcrFor(record: Pick<PartRecord, 'ocr'>, photo: string) {
  return [...(record.ocr ?? [])].reverse().filter(read => photoUrl(read.photo) === photoUrl(photo))
    .sort((a, b) => Date.parse(b.read_at) - Date.parse(a.read_at))[0] ?? null
}
export function qualityFor(record: Pick<PartRecord, 'ocr'>, photo: string) {
  return newestOcrFor(record, photo)?.quality ?? null
}
export const fileName = (path: string) => path.split('/').at(-1) || path
