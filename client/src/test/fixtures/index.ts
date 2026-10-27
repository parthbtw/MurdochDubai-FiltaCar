import type { AiStatus, CompatibilityEntry, ExportPreview, Metrics, PartRecord, PartsResponse, QuestionPack } from '@/api/types'
import partsJson from './parts.json'
import metricsJson from './metrics.json'
import partJson from './part-MIR-0007.json'
import specialistJson from './part-MIR-0010.json'
import questionPackJson from './question-pack-MIR-0007.json'
import exportPreviewJson from './export-preview.json'
import aiStatusJson from './ai-status.json'
import part0001Json from './part-MIR-0001.json'
import part0004Json from './part-MIR-0004.json'
import part0005Json from './part-MIR-0005.json'
import part0009Json from './part-MIR-0009.json'
import compatibilityJson from './compatibility-SBM-7940-LC17.json'
import questionPack0001Json from './question-pack-MIR-0001.json'

export const partsResponse = partsJson as unknown as PartsResponse
export const parts = partsResponse.parts
export const metrics = metricsJson as unknown as Metrics
export const part = partJson as unknown as PartRecord
export const specialist = specialistJson as unknown as PartRecord
export const questionPack = questionPackJson as unknown as QuestionPack
export const exportPreview = exportPreviewJson as unknown as ExportPreview
export const aiStatus = aiStatusJson as unknown as AiStatus
export const part0001 = part0001Json as unknown as PartRecord
export const part0004 = part0004Json as unknown as PartRecord
export const part0005 = part0005Json as unknown as PartRecord
export const part0009 = part0009Json as unknown as PartRecord
export const compatibility = compatibilityJson as unknown as CompatibilityEntry
export const questionPack0001 = questionPack0001Json as unknown as QuestionPack
