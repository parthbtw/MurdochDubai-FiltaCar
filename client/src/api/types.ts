export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type Readiness = 'ready_for_review' | 'information_missing' | 'specialist_review_required'
export type Agreement = 'agree' | 'disagree' | 'ai_only' | 'tesseract_only' | 'neither'
export interface PartNumber {
  extracted_value: string | null
  extraction_method: string | null
  requires_manual_verification: boolean
}
export interface PartDetails {
  category: string | null
  subcategory: string | null
  brand: string | null
  part_number: PartNumber
  placement: string | null
  colour_code?: string | null
}
export interface Condition {
  state: string | null
  cosmetic_damage: string[] | null
  testing_status: string | null
  test_record?: JsonValue
}
export interface DonorVehicle {
  make: string | null
  model: string | null
  year: number | null
  drive_side: string | null
}
export interface Gap {
  field: string
  type: 'missing' | 'conflict' | 'cannot_claim'
  detail: string
  sources: string[]
}
export interface Question { field: string; question_en: string; question_ar: string }
export interface ActionRequired { priority: number; field: string; action_en: string; action_ar: string; blocking: boolean }
export interface OcrRead {
  engine: string
  photo: string
  text: string
  confidence: number
  unclear: boolean
  quality: { sharpness: number; blurry: boolean }
  part_number_candidate: string | null
  read_at: string
}
export interface AiRead {
  engine: string
  mode: 'build-time' | 'live'
  photo: string
  result: { part_number: string | null; visible_text: string; damage_notes: string[]; readable: boolean }
  agreement: Agreement
  read_at: string
}
export interface Draft {
  title: string
  description: string
  item_specifics: Record<string, string>
  compatibility: { supported: string[]; unverified: string[]; note: string }
  blocked_claims: { phrase: string; reason: string }[]
}
export interface Dimensions { length: number | null; width: number | null; height: number | null }
export interface Corridor {
  uk_side_wording: { label: string; value: string | null; note?: string | null }
  drive_side_warning: { label: string; value: string | null }
  shipping: { label: string; tier: string; size: string; fragile: boolean; estimated: boolean; packaged_dimensions_cm?: Dimensions }
  packing_alert: { label: string; value: string }
  checklist: {
    id: string; version: string; dated: string; label: string
    items: { id: string; status: 'pass' | 'fail' | 'unknown' | 'reference'; detail: string }[]
  }
}
export interface SellerApproval { approved: boolean; approved_at: string | null }
export interface HistoryEntry { at: string; field: string; old: JsonValue; new: JsonValue; by: string }
export interface PartRecord {
  item_id: string
  seller_id: string
  original_title_ar: string | null
  original_title_en: string | null
  part_details: PartDetails
  condition: Condition
  donor_vehicle: DonorVehicle
  readiness_status: Readiness
  actions_required: ActionRequired[]
  field_sources: Record<string, string>
  questions: Question[]
  gaps_and_conflicts: Gap[]
  photos: string[]
  notes_ar: string | null
  ocr: OcrRead[] | null
  ai_reads?: AiRead[]
  candidates?: Record<string, { value: JsonValue; source: string }>
  created_at?: string
  storage_location?: string | null
  weight_kg?: number | null
  packaged_dimensions_cm?: Dimensions | null
  included_components?: string[] | null
  draft: Draft | null
  corridor: Corridor | null
  seller_approval: SellerApproval
  history: HistoryEntry[]
}
export interface Health { ok: boolean }
export interface PartsResponse { parts: PartRecord[] }
export interface Metrics {
  parts_total: number
  approved: number
  by_status: Record<Readiness, number>
  facts_with_sources: number
  questions_open: number
  missing_open: number
  conflicts_open: number
  claims_blocked: number
  readers: { ocr_reads: number; ai_reads: number; by_agreement: Record<Agreement, number>; ai_declined_to_guess: number }
  seller_edits: number
  measured: { approved_with_timing: number; median_minutes_to_approval: number | null }
  baseline?: { minutes_per_listing: number; measured_on: string; method: string }
  time_estimate: { source: 'assumption' | 'measured'; manual_minutes_per_listing: number; filtacar_minutes_per_listing: number; basis: string }
}
export interface ExportPreview { included: string[]; excluded: { item_id: string; reason: string }[] }
export interface QuestionPack { item_id: string; text: string; questions_count: number }
export interface AiStatus { available: boolean; reason?: string | null }
export interface UploadResult { created: string[]; updated: string[]; warnings: string[]; parts: PartRecord[] }
export interface CompatibilityEntry {
  part_number: string
  source: string
  region_notes: string
  reference_vehicles: { make: string; model: string; years: string; drive_side: string }[]
  field_sources: Record<string, string>
}
export interface ApiErrorBody { error?: string; gaps_and_conflicts?: Gap[]; gaps?: Gap[]; fallback?: string; [key: string]: unknown }
type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T
export type PartPatch = DeepPartial<Pick<PartRecord,
  'seller_id' | 'original_title_ar' | 'original_title_en' | 'part_details' | 'condition' |
  'donor_vehicle' | 'notes_ar' | 'storage_location' | 'weight_kg' | 'packaged_dimensions_cm' | 'included_components'
>>
