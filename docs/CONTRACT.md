# FiltaCar API Contract

Developer B owns this contract. The API runs on `http://localhost:3001` (the Vite dev server proxies `/api` to it). All responses are JSON. Errors are always `{ "error": "..." }` with an appropriate HTTP status. CORS is allowed for localhost origins only.

## GET /api/health

Liveness check.

```bash
curl http://localhost:3001/api/health
```

```json
{ "ok": true }
```

## GET /api/parts

Returns all part records. Optional `?status=` filter, one of `ready_for_review`, `information_missing`, `specialist_review_required`. An unknown status value returns 400.

```bash
curl http://localhost:3001/api/parts
curl "http://localhost:3001/api/parts?status=information_missing"
```

```json
{
  "parts": [
    {
      "item_id": "MIR-0001",
      "seller_id": "DXB-SLV-014",
      "original_title_ar": "مرآة جانبية يمين لاند كروزر، مستعملة، حالة جيدة",
      "original_title_en": "Right side door mirror, Land Cruiser, used, good condition",
      "part_details": {
        "category": "Exterior",
        "subcategory": "Side View Mirror",
        "brand": "Unbranded",
        "part_number": {
          "extracted_value": "SBM-7940-LC17",
          "extraction_method": "spreadsheet",
          "requires_manual_verification": false
        },
        "placement": "Right"
      },
      "condition": {
        "state": "Used",
        "cosmetic_damage": ["light scuff on housing edge"],
        "testing_status": "Visual inspection only"
      },
      "readiness_status": "ready_for_review",
      "actions_required": [],
      "donor_vehicle": { "make": "Toyota", "model": "Land Cruiser", "year": 2017, "drive_side": "LHD" },
      "field_sources": { "part_details.brand": "spreadsheet row 3" },
      "questions": [],
      "gaps_and_conflicts": [],
      "photos": ["uploads/mir-0001-01.jpg"],
      "notes_ar": "...",
      "ocr": null,
      "draft": null,
      "corridor": null,
      "seller_approval": { "approved": false, "approved_at": null },
      "history": []
    }
  ]
}
```

`field_sources`, `questions`, `gaps_and_conflicts`, `photos`, `history`, `seller_approval`, `draft` and `corridor` are shown truncated for brevity. The real record contains every field listed in the part record shape.

## GET /api/parts/:id

Returns one record or 404.

```bash
curl http://localhost:3001/api/parts/MIR-0007
```

```json
{
  "item_id": "MIR-0007",
  "readiness_status": "information_missing",
  "gaps_and_conflicts": [
    {
      "field": "donor_vehicle.year",
      "type": "conflict",
      "detail": "spreadsheet lists donor year as 2018, Arabic yard note states 2015",
      "sources": ["spreadsheet row 9", "Arabic yard note"]
    }
  ],
  "...": "all other fields of the record"
}
```

404 response:

```json
{ "error": "part MIR-9999 not found" }
```

## PUT /api/parts/:id

Merges changed fields into the record. Behaviour:

- The following keys are computed or system-owned and will be rejected with 400 if present in the patch: `gaps_and_conflicts`, `questions`, `readiness_status`, `field_sources`, `draft`, `corridor`, `ocr`, `candidates`, `history`, `seller_approval`, `item_id`.
- `item_id` cannot be changed (400).
- For each changed field path, `field_sources[field]` is set to `"seller edit"`.
- Each change appends `{ "at": "<ISO timestamp>", "field": "<dot path>", "old": ..., "new": ..., "by": "seller" }` to `history`.
- After the merge the server calls Developer C's `runChecks(record)` and saves every key it returns (`gaps_and_conflicts`, `questions`, `readiness_status`, `draft`, `corridor`).
- Responds with the full updated record.

```bash
curl -X PUT http://localhost:3001/api/parts/MIR-0007 \
  -H 'Content-Type: application/json' \
  -d '{"donor_vehicle":{"year":2015}}'
```

```json
{
  "item_id": "MIR-0007",
  "donor_vehicle": { "make": "GMC", "model": "Acadia", "year": 2015, "drive_side": "LHD" },
  "field_sources": {
    "donor_vehicle.year": "seller edit",
    "...": "all previous sources"
  },
  "history": [
    {
      "at": "2026-10-27T11:00:00.000Z",
      "field": "donor_vehicle.year",
      "old": 2018,
      "new": 2015,
      "by": "seller"
    }
  ],
  "...": "all other fields, with checks output applied"
}
```

Validation errors (400):

```json
{ "error": "item_id is computed or system-owned and cannot be edited; item_id cannot be changed" }
```

```json
{ "error": "readiness_status is computed or system-owned and cannot be edited" }
```

## POST /api/parts/:id/approve

Sets `seller_approval.approved` to `true` with an ISO timestamp and returns the full record.

Blocked with 409 when:
- `readiness_status` is `"specialist_review_required"`.
- `gaps_and_conflicts` contains any entry with type `"missing"` or `"conflict"`.

Type `"cannot_claim"` alone does not block approval.

```bash
curl -X POST http://localhost:3001/api/parts/MIR-0001/approve
```

```json
{
  "item_id": "MIR-0001",
  "seller_approval": { "approved": true, "approved_at": "2026-10-27T11:05:00.000Z" },
  "...": "all other fields"
}
```

409 response (blocked by unresolved gaps):

```json
{
  "error": "cannot approve: specialist review required"
}
```

```json
{
  "error": "cannot approve: 1 unresolved gap(s) or conflict(s) remain",
  "gaps_and_conflicts": [
    {
      "field": "donor_vehicle.year",
      "type": "conflict",
      "detail": "spreadsheet lists donor year as 2018, Arabic yard note states 2015",
      "sources": ["spreadsheet row 9", "Arabic yard note"]
    }
  ]
}
```

## POST /api/upload

Multipart/form-data upload of yard photos and/or a seller spreadsheet. One shared offline OCR worker (tesseract.js, languages eng+ara, traineddata committed in `server/tessdata/`) and a sharp-based photo quality check serve every request.

Form fields:

- `photos`: 0 to 6 images, jpg, png or webp, max 8 MB each. Other types return 400.
- `sheet`: 0 or 1 CSV, max 2 MB. Other types return 400.
- `item_id`: optional text field. With photos, the item the photos belong to (404 if unknown).

Photo handling:

- With `item_id`: files are saved to `data/uploads/<item_id>/`, paths are appended to `photos[]`, the quality check and OCR run on each photo and the results are stored in the record's `ocr` array.
- Without `item_id`: a new part is created with the next free ID (MIR-0011 and up), the same record shape as the seed data, only the fields we actually know, and `readiness_status` `information_missing`.

Photo quality check (feature 9): greyscale, resize to max 1000 px wide, Laplacian variance as the sharpness score. Below `SHARPNESS_THRESHOLD` (set in `server/src/config.js`, tuned on the demo fixtures) the photo is marked `blurry: true` and the warning `photo blurry, retake` is added.

OCR result (one entry per processed photo in the record's `ocr` array):

```json
{
  "engine": "tesseract.js (local)",
  "photo": "uploads/MIR-0004/1698...-clear_label.png",
  "text": "SBM-7941-NP16\nMADE IN JAPAN\n",
  "confidence": 90,
  "unclear": false,
  "quality": { "sharpness": 1114.26, "blurry": false },
  "part_number_candidate": "SBM-7941-NP16",
  "read_at": "2026-10-27T16:00:00.000Z"
}
```

`unclear` is true if the photo is blurry, if confidence is below 70, or if no part number pattern is found (the seed SKU format like SBM-7941-NP16, plus letter/digit groups joined by hyphens). The frontend shows the OCR Unclear screen from this.

Part number rules:

- If the record has no part number and a candidate was found with `unclear` false: `part_details.part_number.extracted_value` is set, `extraction_method` is `"OCR photo N"` (N is the photo's 1-based position in `photos[]`), `requires_manual_verification` is false and `field_sources` gets `"OCR photo N"`.
- If `unclear` is true: the part number is never set. It stays null and `requires_manual_verification` becomes true.
- If the record already has a different part number: it is not changed; the candidate stays in the OCR entry.

CSV handling (`sheet`): parsed with csv-parse. Expected columns, case-insensitive, extras ignored and listed in warnings: `sku`, `item_id`, `make`, `model`, `year`, `side`, `colour`, `part_number`, `testing_status`, `notes_ar`, `notes_en`, `weight_kg`. Mapping: make/model/year to `donor_vehicle`, side to `part_details.placement`, colour to `part_details.colour_code`, part_number to `part_details.part_number.extracted_value`, testing_status to `condition.testing_status`, notes_ar to `notes_ar`, notes_en to `original_title_en`, weight_kg to `weight_kg`. A row with an existing item_id updates that record, otherwise a new part is created. `field_sources` entries are `"spreadsheet row N (<filename>)"`. Empty cells stay null, never guessed.

Candidate rule: an existing value is never overwritten by OCR or CSV if it differs. The existing value stays and the new value is stored in the record's `candidates` map:

```json
{
  "donor_vehicle.year": { "value": 1999, "source": "spreadsheet row 1 (conflict.csv)" }
}
```

Developer C's checks read `candidates` and raise conflicts. `candidates` is system-owned: PUT rejects it with 400.

After any change, runChecks runs on the affected records and every key it returns is saved. Response:

```bash
curl -X POST http://localhost:3001/api/upload \
  -F 'item_id=MIR-0004' \
  -F 'photos=@data/demo/clear_label.png' \
  -F 'sheet=@data/demo/inventory.csv'
```

```json
{
  "created": ["MIR-0021", "MIR-0022", "MIR-0023"],
  "updated": ["MIR-0004"],
  "warnings": ["row 2: donor_vehicle.year value \"2015\" differs from record value \"2018\", kept as candidate"],
  "parts": ["full records affected, see GET /api/parts/:id for the shape"]
}
```

Errors (400): non-image photos, non-CSV sheet, sheet over 2 MB, more than 6 photos, unknown file fields, or no photos and no sheet provided. Unknown `item_id` returns 404.

## Static photos

`GET /uploads/<item_id>/<filename>` serves files from `data/uploads/` so the frontend can show photos. Uploaded files land in `data/uploads/<item_id>/`.

## GET /api/compatibility/:partNumber

Returns the reference catalogue entry for a part number, or 404. Entries exist only for part numbers present in the seed data. Every entry carries `source: "synthetic reference catalogue (test data, not verified)"` and `region_notes`; they are reference data only and never a fitment claim.

```bash
curl http://localhost:3001/api/compatibility/SBM-7940-LC17
```

```json
{
  "part_number": "SBM-7940-LC17",
  "source": "synthetic reference catalogue (test data, not verified)",
  "region_notes": "Catalogue entry mirrors the LHD Toyota Land Cruiser layout. UK RHD vehicles mirror the part side, so confirm placement before listing."
}
```

404 response:

```json
{ "error": "no compatibility entry for part number SBM-0000" }
```

## Placeholder routes (next milestone, not built yet)

- `GET /api/export/ebay.csv`: exports approved records as an eBay listing CSV for UK buyers.
- `GET /api/metrics`: pipeline quality metrics.

## Server start

On start the server runs Developer C's `runChecks` on every record, saves the returned keys and writes `parts.json` once. A record whose checks throw is logged and kept unchanged.

## Demo fixtures

`data/demo/` holds offline demo fixtures, generated with sharp from SVG (rerun with `npm run fixtures -w server`):

- `clear_label.png`: white label with large black text "SBM-7941-NP16" and a small line "MADE IN JAPAN". OCR reads it with confidence 90 and `unclear` false.
- `blurry_label.png`: the same label heavily blurred. The quality check marks it blurry and OCR stays unclear.
- `inventory.csv`: 3 rows, one clean mirror, one whose year conflicts with its notes_ar, and one with an empty part_number. notes_ar contains Arabic text.

## Part record shape

Field names are team spec and must not change, so Developer A's mock data keeps working.

- `item_id`, `seller_id`: identifiers.
- `original_title_ar`, `original_title_en`: titles from the yard note and their translation.
- `part_details`: `category`, `subcategory`, `brand`, `part_number { extracted_value, extraction_method, requires_manual_verification }`, `placement`, plus `colour_code` when a spreadsheet colour column provides it.
- `condition`: `state`, `cosmetic_damage[]`, `testing_status`.
- `readiness_status`: one of `ready_for_review`, `information_missing`, `specialist_review_required`.
- `actions_required[]`: next steps for the seller.
- `donor_vehicle { make, model, year, drive_side }`: evidence only, never a fitment claim.
- `field_sources`: maps each non-empty field path to where the value came from.
- `questions[]`: `{ field, question_en, question_ar }` for each missing or conflicting detail.
- `gaps_and_conflicts[]`: `{ field, type ("missing" | "conflict" | "cannot_claim"), detail, sources[] }`.
- `photos[]`: file paths, served at `/uploads/<item_id>/<filename>`.
- `notes_ar`: original Arabic note text.
- `ocr`: null until the upload step fills it, then an array of OCR results, one per processed photo, each `{ engine, photo, text, confidence, unclear, quality { sharpness, blurry }, part_number_candidate, read_at }`.
- `candidates`: map of field path to `{ value, source }` for CSV or OCR values that differ from an existing value and were therefore not applied, for Developer C's checks.
- `weight_kg`: from the spreadsheet weight_kg column, null otherwise.
- `draft`, `corridor`: null until Developer C's checks fill them.
- `seller_approval { approved, approved_at }`.
- `history[]`: `{ at, field, old, new, by }`, appended on every update.

Honesty rules: never include a fitment claim, a "genuine" or "OEM" authenticity claim, or a "tested working" condition unless a `field_sources` entry supports it. Untested parts keep `testing_status` `"Untested"` and are never described as working.
