// Central config for the data pipeline. Tune SHARPNESS_THRESHOLD on the
// fixtures in data/demo/ (clear_label.png must be sharp, blurry_label.png
// must be blurry).
export const SHARPNESS_THRESHOLD = 100

export const OCR_LANGS = 'eng+ara'
export const OCR_ENGINE = 'tesseract.js (local)'
export const OCR_TIMEOUT_MS = 30000
export const OCR_MIN_CONFIDENCE = 70

export const MAX_PHOTOS = 6
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024
export const MAX_SHEET_BYTES = 2 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const SHEET_TYPES = ['text/csv', 'application/csv', 'application/vnd.ms-excel']

// Illustration assumptions, not measured timings.
export const MANUAL_MINUTES_PER_LISTING = 15
export const FILTACAR_MINUTES_PER_LISTING = 3
