import { updatePart } from './endpoints'
import type { PartRecord, UploadResult } from './types'

export async function assignUpload(result: UploadResult, sellerId: string): Promise<UploadResult> {
  const assigned = new Map<string, PartRecord>()
  for (const id of result.created) assigned.set(id, await updatePart(id, { seller_id: sellerId }))
  return { ...result, parts: result.parts.map(record => assigned.get(record.item_id) ?? record) }
}
