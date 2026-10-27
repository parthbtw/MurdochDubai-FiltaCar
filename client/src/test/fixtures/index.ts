import type { AiStatus, ExportPreview, Metrics, PartRecord, PartsResponse, QuestionPack } from '@/api/types'
import partsJson from './parts.json'
import metricsJson from './metrics.json'
import partJson from './part-MIR-0007.json'
import specialistJson from './part-MIR-0010.json'
import questionPackJson from './question-pack-MIR-0007.json'
import exportPreviewJson from './export-preview.json'
import aiStatusJson from './ai-status.json'

export const partsResponse = partsJson as unknown as PartsResponse
export const parts = partsResponse.parts
export const metrics = metricsJson as unknown as Metrics
export const part = partJson as unknown as PartRecord
export const specialist = specialistJson as unknown as PartRecord
export const questionPack = questionPackJson as unknown as QuestionPack
export const exportPreview = exportPreviewJson as unknown as ExportPreview
export const aiStatus = aiStatusJson as unknown as AiStatus
