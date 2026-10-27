import { request } from './client'
import type { AiStatus, CompatibilityEntry, ExportPreview, Health, Metrics, PartPatch, PartRecord, PartsResponse, QuestionPack, Readiness, UploadResult } from './types'

export interface PartsParams { status?: Readiness; seller_id?: string }
export interface MetricsParams { seller_id?: string }
function query(params?: PartsParams): string {
  const search = new URLSearchParams()
  if (params?.status) search.set('status', params.status)
  if (params?.seller_id) search.set('seller_id', params.seller_id)
  return search.size ? `?${search}` : ''
}
const partUrl = (id: string) => `/api/parts/${encodeURIComponent(id)}`
export const getHealth = () => request<Health>('/api/health')
export const getParts = (params?: PartsParams) => request<PartsResponse>(`/api/parts${query(params)}`)
export const getPart = (id: string) => request<PartRecord>(partUrl(id))
export const updatePart = (id: string, patch: PartPatch) => request<PartRecord>(partUrl(id), { method: 'PUT', body: JSON.stringify(patch) })
export const approvePart = (id: string) => request<PartRecord>(`${partUrl(id)}/approve`, { method: 'POST' })
export const uploadFiles = (formData: FormData) => request<UploadResult>('/api/upload', { method: 'POST', body: formData })
export const getCompatibility = (partNumber: string) => request<CompatibilityEntry>(`/api/compatibility/${encodeURIComponent(partNumber)}`)
export const getAiStatus = () => request<AiStatus>('/api/ai/status')
export const aiRead = (id: string, photo: string) => request<PartRecord>(`${partUrl(id)}/ai-read`, { method: 'POST', body: JSON.stringify({ photo }) })
export const aiAccept = (id: string, readIndex: number) => request<PartRecord>(`${partUrl(id)}/ai-accept`, { method: 'POST', body: JSON.stringify({ read_index: readIndex }) })
export const getExportPreview = () => request<ExportPreview>('/api/export/preview')
export const exportCsvUrl = '/api/export/ebay.csv'
export const getMetrics = (params?: MetricsParams) => request<Metrics>(`/api/metrics${query(params)}`)
export const getQuestionPack = (id: string) => request<QuestionPack>(`${partUrl(id)}/question-pack`)
