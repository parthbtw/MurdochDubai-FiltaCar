import type { ApiErrorBody, AiStatus, CompatibilityEntry, ExportPreview, Metrics, PartRecord, PartsResponse, QuestionPack, UploadResult } from '@/api/types'
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

import putYearJson from './put-MIR-0007-year.json'
export const putYear = putYearJson as unknown as PartRecord

import putNumberJson from './put-MIR-0004-part-number.json'
export const putNumber = putNumberJson as unknown as PartRecord

import approvedPartJson from './approve-MIR-0001.json'
export const approvedPart = approvedPartJson as unknown as PartRecord

import afterApprovalEditJson from './put-MIR-0001-after-approval.json'
export const afterApprovalEdit = afterApprovalEditJson as unknown as PartRecord

import approveMissingErrorJson from './approve-MIR-0005-409.json'
export const approveMissingError = approveMissingErrorJson as unknown as ApiErrorBody

import approveSpecialistErrorJson from './approve-MIR-0009-409.json'
export const approveSpecialistError = approveSpecialistErrorJson as unknown as ApiErrorBody

import aiReadPartJson from './ai-read-MIR-0005.json'
export const aiReadPart = aiReadPartJson as unknown as PartRecord

import aiStatusNowJson from './ai-status-now.json'
export const aiStatusNow = aiStatusNowJson as unknown as AiStatus

import uploadBlurryJson from './upload-blurry-MIR-0004.json'
import uploadNewPartJson from './upload-new-part.json'
import uploadInventoryJson from './upload-inventory-csv.json'
import uploadBadTypeJson from './upload-bad-type-400.json'
import exportPreviewOneJson from './export-preview-one.json'
import metricsAfterJson from './metrics-after.json'
import exportOneText from './export-one.csv?raw'
import uploadUnknownItemJson from './upload-unknown-item-404.json'

export const uploadBlurry = uploadBlurryJson as unknown as UploadResult
export const uploadNewPart = uploadNewPartJson as unknown as UploadResult
export const uploadInventory = uploadInventoryJson as unknown as UploadResult
export const uploadBadType = uploadBadTypeJson as ApiErrorBody
export const exportPreviewOne = exportPreviewOneJson as ExportPreview
export const metricsAfter = metricsAfterJson as Metrics
export const exportOneCsv: string = exportOneText
// Documented unknown-item response from docs/CONTRACT.md.
export const uploadUnknownItem = uploadUnknownItemJson as ApiErrorBody
