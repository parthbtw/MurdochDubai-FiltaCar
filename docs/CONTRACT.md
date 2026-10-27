# FiltaCar API Contract

Developer B owns this contract. The API runs on `http://localhost:3001` (the Vite dev server proxies `/api` to it). API responses are JSON. Errors contain `{ "error": "..." }` with an appropriate HTTP status; unavailable AI reads also include `"fallback": "manual"`. CORS is allowed for localhost origins only.

## GET /api/health

Liveness check.

```bash
curl http://localhost:3001/api/health
```

```json
{ "ok": true }
```

## GET /api/parts

Returns all part records. Optional `?status=` filter, one of `ready_for_review`, `information_missing`, `specialist_review_required`. An unknown status value returns 400. Optional `?seller_id=` scopes results to one business or individual seller and can be combined with status. An unknown seller returns `{ "parts": [] }`, not an error.

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

- The following keys are computed or system-owned and will be rejected with 400 if present in the patch: `gaps_and_conflicts`, `questions`, `actions_required`, `created_at`, `readiness_status`, `field_sources`, `draft`, `corridor`, `ocr`, `ai_reads`, `candidates`, `history`, `seller_approval`, `item_id`.
- `item_id` cannot be changed (400).
- For each changed field path, `field_sources[field]` is set to `"seller edit"`.
- Each change appends `{ "at": "<ISO timestamp>", "field": "<dot path>", "old": ..., "new": ..., "by": "seller" }` to `history`.
- After the merge the server calls Developer C's `runChecks(record)` and saves every key it returns (`gaps_and_conflicts`, `questions`, `actions_required`, `readiness_status`, `draft`, `corridor`), with `field_sources[key]` set to `"runChecks"`. Upload and startup saves do the same.
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

When a PUT changes `part_details.part_number.extracted_value` to a nonempty value and the patch supplies neither `extraction_method` nor `requires_manual_verification`, the server sets those fields to `"seller edit"` and `false`. Each changed metadata field has source `"seller edit"` and a history entry by `"seller"`. Explicit metadata in the patch is respected. Clearing the number to null or an empty string sets `requires_manual_verification` to `true`.

## POST /api/parts/:id/approve

Sets `seller_approval.approved` to `true` with an ISO timestamp and returns the full record.

Blocked with 409 when:
- `readiness_status` is `"specialist_review_required"`.
- `gaps_and_conflicts` contains any entry with type `"missing"` or `"conflict"`.

Type `"cannot_claim"` alone does not block approval.

Approval is the last step. A PUT that changes any value, an upload that updates the record, a successful AI acceptance, or an AI read that fills a value withdraws an existing approval before checks run. The shared record helper sets `seller_approval` to `{ "approved": false, "approved_at": null }` and appends `{ at, field: "seller_approval", old: <previous approval>, new: { approved: false, approved_at: null }, by: "system: changed after approval" }` to history. It sets `field_sources["seller_approval.approved"]` to `"withdrawn after change"`. The corridor checklist approval item returns to `unknown` when checks run. A PUT with identical values preserves approval. Evidence alone from an AI read does not withdraw approval. A CSV upload with no record changes also preserves it. Approving an already approved record still refreshes its timestamp without another approval history entry.

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

CSV handling (`sheet`): parsed with csv-parse. Expected columns, case-insensitive, extras ignored and listed in warnings: `sku`, `item_id`, `make`, `model`, `year`, `side`, `colour`, `part_number`, `testing_status`, `notes_ar`, `notes_en`, `storage_location`, `weight_kg`, `length_cm`, `width_cm`, `height_cm`, `included_components`. Mapping: make/model/year to `donor_vehicle`, side to `part_details.placement`, colour to `part_details.colour_code`, part_number to `part_details.part_number.extracted_value`, testing_status to `condition.testing_status`, notes_ar to `notes_ar`, notes_en to `original_title_en`, storage_location and weight_kg to the same top-level fields, length_cm/width_cm/height_cm to `packaged_dimensions_cm.length/width/height`. Numeric package cells are parsed strictly; invalid values remain unresolved by checks. `included_components` is a semicolon-separated list trimmed into an array. A row with an existing item_id updates that record, otherwise a new part is created with a sourced ISO `created_at`; updates do not reset it or backfill seed timestamps. `field_sources` entries are `"spreadsheet row N (<filename>)"`. Empty cells stay unknown, never guessed.

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

`GET /demo/<filename>` serves files from `data/demo/`, including `/demo/labels/MIR-0001.png` through `/demo/labels/MIR-0010.png`. Demo paths stored in `photos[]` start with `/demo/`.

## CodeBuddy AI second reader

CodeBuddy AI reads only text and visible damage from an attached image. It never supplies brand, fitment, vehicle model, year, side or condition facts. `damage_notes` remains reading evidence in `ai_reads`; it does not change the record's `condition`. Tesseract remains available offline and uploads do not depend on CodeBuddy.

Each successful reading appends to `ai_reads[]`, newest last:

```json
{
  "engine": "CodeBuddy AI",
  "mode": "live",
  "photo": "/demo/labels/MIR-0001.png",
  "result": {
    "part_number": "SBM-7940-LC17",
    "visible_text": "PART NUMBER\nSBM-7940-LC17",
    "damage_notes": [],
    "readable": true
  },
  "agreement": "agree",
  "read_at": "2026-10-27T16:00:00.000Z"
}
```

`mode` is `"build-time"` or `"live"`. `part_number` is a string or null, `visible_text` is a string, `damage_notes` is an array of strings, and `readable` is a boolean. Code validates the result before saving it. A failed CLI call does not create a successful reading. `ai_reads` is system-owned and PUT rejects it.

Agreement compares the AI `part_number` with the newest Tesseract `part_number_candidate` for the exact same `photo`, uppercasing and removing whitespace from both. It never compares another photo's OCR entry.

| Agreement | Readers | Fact handling |
| --- | --- | --- |
| `agree` | Both return the same normalized number | Fill an empty part number; preserve any existing different number. |
| `disagree` | Both return different numbers | Set no fact. |
| `ai_only` | Only AI returns a number | Set no fact until seller confirmation. |
| `tesseract_only` | Only Tesseract returns a number | Keep B2 behavior: fill an empty number only when Tesseract is clear; otherwise leave it empty and require verification. |
| `neither` | Neither reader returns a number | Set no number; keep the OCR Unclear/manual verification behavior. |

An agreement that fills an empty number sets `part_details.part_number.extracted_value`, `extraction_method` to `"OCR + CodeBuddy AI agree (photo N)"`, and `requires_manual_verification` to false. All three field sources use that combined source; history records the changes by `"CodeBuddy AI + OCR"`. N is the 1-based position in `photos[]`. AI-only and disagree readings never overwrite the existing part number. A successful read and its checks output receive provenance even when no part number changes.

The server keeps only successful AI results in `data/ai_read_cache.json`, indexed by the image file's SHA-256, shared by preread and live reads. Identical image bytes reuse a successful result without another CLI call, across records and restarts. Legacy disk entries containing an `error` are treated as absent and removed on the next successful save. A repeat of the same cached live reading for the same record/photo does not append a duplicate audit entry. Cache hits can be used offline. A sanitized failure stays only in process memory for at most 60 seconds to suppress rapid repeat clicks, then the same image can be retried. Failures are forgotten on process restart. Preread `--force` bypasses this failure window while retaining successful cached results. New calls use the stable isolated `server/.ai-sandbox/` directory with filesystem and web tools disabled and time out after 45 seconds. Each call captures stdout in a separate temporary file, reads it after the child closes and deletes that temporary directory. Invalid output is saved with the key redacted in `server/.ai-sandbox/last_failed_output.txt`; the sandbox is ignored by Git. The key is loaded through dotenv and passed only in the CLI child's inherited environment; responses and diagnostic snippets never contain it.

### GET /api/ai/status

```json
{ "available": false, "reason": "live AI reading is disabled" }
```

`available` is true only when `AI_LIVE_ENABLED` is `true`, a key is configured, and the CLI was found on PATH when the app started. The reason explains unavailable configuration without disclosing the key. Availability is a startup configuration check; a subsequent call can still fail if the service is offline.

### POST /api/parts/:id/ai-read

```json
{ "photo": "/demo/labels/MIR-0001.png" }
```

The photo must be present in the part's `photos[]` and resolve to a supported image inside the demo or upload directories. The route gets a cached AI result or performs one new live call, appends the reading with `mode: "live"`, applies agreement, runs `runChecks(record)`, persists every returned key and returns the full record. Only one new AI call may run at a time; a competing uncached request returns 429. An exclusive file lock also prevents simultaneous server and preread processes from calling the reader for the same data directory. Cached requests do not start a CLI process.

Unknown parts return 404. Invalid photo requests return 400. An unavailable reader, missing file, invalid output or failed check returns 503 and leaves the record unchanged:

```json
{ "error": "CodeBuddy AI unavailable", "fallback": "manual" }
```

Use the existing manual edit and upload flows when AI is unavailable. Reader failures expose only a short sanitized diagnostic.

### POST /api/parts/:id/ai-accept

```json
{ "read_index": 0 }
```

`read_index` is the zero-based index of an `ai_reads` entry whose agreement is `"ai_only"`. Other entries and invalid indices return 400. Seller confirmation fills the part number and sets its extraction method and field sources to `"CodeBuddy AI, confirmed by seller"`, with history by `"seller"`. An existing different part number is preserved and returns 409. The route runs `runChecks(record)`, persists every returned key and returns the full record. This confirmation can use saved evidence offline.

### Build-time preread

Run `npm run ai:preread` from the root, or `npm run ai:preread -w server`. This command attaches `/demo/labels/<item_id>.png` once to each of the ten demo parts, runs the existing photo quality check and Tesseract, then obtains the cached or new AI reading. It saves the OCR entry and any successful AI entry, applies the agreement rule, runs checks and saves the parts after each item. An AI failure keeps Tesseract's B2 fallback, logs a sanitized diagnostic and continues.

Successful build-time reads are skipped on subsequent runs. `npm run ai:preread -- --force` processes them again, reusing successful cached AI results for unchanged image bytes and retrying failures immediately. The script prints one line per part and final counts for `agree`, `disagree`, `ai_only`, `tesseract_only` and `neither`, plus skipped and failed totals. The counts describe parts processed in that run.

`data/ai_preread.json` contains one latest report entry per item and photo:

```json
{
  "item_id": "MIR-0001",
  "photo": "/demo/labels/MIR-0001.png",
  "tesseract": { "engine": "tesseract.js (local)", "...": "full OCR result" },
  "ai": { "part_number": "SBM-7940-LC17", "visible_text": "SBM-7940-LC17", "damage_notes": [], "readable": true },
  "agreement": "agree",
  "read_at": "2026-10-27T16:00:00.000Z",
  "label": "read by CodeBuddy AI"
}
```

A failed AI attempt has `ai: null`, `agreement: "tesseract_only"` when Tesseract has a candidate or `"neither"` when it has none, a sanitized `error` and label `"Tesseract fallback; CodeBuddy AI unavailable"`. The script will process that part again because it has no successful build-time `ai_reads` entry, but rapid reruns within the 60-second memory window reuse the failure without a new CLI call. After that window, or immediately with `--force`, the script retries the reader. The script never labels a failed attempt as read by AI.

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

## GET /api/export/preview

Preview of a mock export only: **MOCK, NOT PUBLISHED**. Both export routes carry `X-Export-Status: MOCK, NOT PUBLISHED`. Nothing is sent to eBay and no approval or listing state changes. Inclusion requires `seller_approval.approved === true` and a non-blank stored `draft.title`. An unapproved part is excluded with `"not approved by seller"`, even if its draft is also absent. An approved part without a title is excluded with `"no draft"`.

Example from the ten unapproved demo records:

```json
{
  "included": [],
  "excluded": [
    { "item_id": "MIR-0001", "reason": "not approved by seller" },
    { "item_id": "MIR-0002", "reason": "not approved by seller" },
    { "item_id": "MIR-0003", "reason": "not approved by seller" },
    { "item_id": "MIR-0004", "reason": "not approved by seller" },
    { "item_id": "MIR-0005", "reason": "not approved by seller" },
    { "item_id": "MIR-0006", "reason": "not approved by seller" },
    { "item_id": "MIR-0007", "reason": "not approved by seller" },
    { "item_id": "MIR-0008", "reason": "not approved by seller" },
    { "item_id": "MIR-0009", "reason": "not approved by seller" },
    { "item_id": "MIR-0010", "reason": "not approved by seller" }
  ]
}
```

## GET /api/export/ebay.csv

Downloads `filtacar_mock_ebay_export_YYYY-MM-DD.csv` using the current UTC date and `Content-Disposition: attachment`. This is **MOCK, NOT PUBLISHED**, with no eBay connection. The same inclusion rules as preview apply. The response is `text/csv; charset=utf-8`, begins with a UTF-8 BOM for Excel/Arabic, uses CRLF row separators, and quotes commas, quotes and newlines correctly.

| Column, in order | Value |
| --- | --- |
| Status | `MOCK, NOT PUBLISHED` on every data row |
| Custom label | Stored `item_id` |
| Title | Stored `draft.title`, capped at 80 characters |
| Description | Stored `draft.description` |
| Condition | `Used`, the fixed mock template value |
| Category | `Car Mirrors`, the fixed mock template value |
| Placement on Vehicle | `draft.item_specifics["Placement on Vehicle"]`, empty if absent |
| Manufacturer Part Number | `draft.item_specifics["Manufacturer Part Number"]`, empty if absent |
| Colour | `draft.item_specifics.Colour`, empty if absent |
| Price | `seller to set`, no price guessed |
| Approved at | Stored `seller_approval.approved_at` |
| Sources | Non-empty `field_sources` values for fields represented in the stored draft, joined by `; ` with duplicate labels removed |

Sources include available direct draft provenance and the represented part, condition, donor and corridor input fields. Unrelated audit, seller-register and photo sources are excluded, as are blocked raw fields. No source label is invented. The route uses stored drafts and does not run checks, save records, or approve anything.

With no included parts the response contains the BOM and only this header row:

```csv
Status,Custom label,Title,Description,Condition,Category,Placement on Vehicle,Manufacturer Part Number,Colour,Price,Approved at,Sources
```

## GET /api/metrics

Reads `data/parts.json` on every request without changing it. Counts reflect stored records, including every reading in the OCR and AI arrays, not just the newest photo reading. `facts_with_sources` counts non-blank source strings, not an assertion that each source has been independently verified. Open questions and gaps are the current stored arrays; `claims_blocked` counts `cannot_claim` gaps, not `draft.blocked_claims`. `seller_edits` counts history entries whose `by` is exactly `"seller"`, including approval entries. `seller_field_edits` counts only history entries whose `by` is exactly `"seller"` and whose `field` is not `"seller_approval"`. The existing `seller_edits` count is unchanged.

Example computed from the synthetic demo records after startup checks:

```json
{
  "parts_total": 10,
  "approved": 0,
  "by_status": { "ready_for_review": 3, "information_missing": 5, "specialist_review_required": 2 },
  "facts_with_sources": 351,
  "questions_open": 16,
  "missing_open": 8,
  "conflicts_open": 4,
  "claims_blocked": 4,
  "readers": {
    "ocr_reads": 10,
    "ai_reads": 10,
    "by_agreement": { "agree": 8, "disagree": 0, "ai_only": 0, "tesseract_only": 0, "neither": 2 },
    "ai_declined_to_guess": 2
  },
  "seller_edits": 0,
  "seller_field_edits": 0,
  "measured": { "approved_with_timing": 0, "median_minutes_to_approval": null },
  "time_estimate": {
    "source": "assumption",
    "manual_minutes_per_listing": 15,
    "filtacar_minutes_per_listing": 3,
    "basis": "assumption for illustration, not measured"
  }
}
```

`ai_declined_to_guess` counts only saved AI reads whose `result.part_number` is explicitly null. Optional `?seller_id=` scopes all record counts and measured timing to one business or individual seller. An unknown seller returns zero counts and an empty measured summary, not an error.

`measured { approved_with_timing, median_minutes_to_approval }` uses only records with valid `created_at` and `seller_approval.approved_at`, with approval not before creation. Durations are elapsed minutes, not active working time. The median averages the two centre values for an even count and is null when there are no valid timings. The ten seeds have no `created_at`, so timing starts empty. GET never writes timestamps or records.

If a valid optional `data/manual_baseline.json` exists with `{ parts, total_minutes, measured_on, method }`, metrics adds `baseline { minutes_per_listing, measured_on, method }`, using `total_minutes / parts`. It is reread per request; missing or malformed baseline data is ignored. Only the synthetic `data/manual_baseline.example.json` is committed; real local baseline data is ignored by Git. Record how the manual exercise was timed, and do not label the example as measured evidence.

`time_estimate` keeps its existing minute fields and adds `source`. Without both a valid baseline and at least one approval timing, `source` is `"assumption"` and the illustrative 15/3 constants from `server/src/config.js` remain. With both, `source` is `"measured"`, the manual field is the baseline average and the FiltaCar field is the median elapsed creation-to-approval time. `basis` identifies that distinction; elapsed time is not a measured saving in active work.

## GET /api/parts/:id/question-pack

Returns copyable WhatsApp text from `buildQuestionPack(record)` in the checks module, using the stored questions. No message is sent anywhere. The text contains the English and Arabic questions, and `questions_count` counts questions, not language lines. A record with no questions returns:

```json
{
  "item_id": "MIR-0001",
  "text": "No open questions.\nلا توجد أسئلة مفتوحة.",
  "questions_count": 0
}
```

MIR-0010's pack after startup includes both `SBM-7946-PF` and `SBM-7946-PX` in the bilingual part-number question. An unknown ID returns 404:

```json
{ "error": "part MIR-9999 not found" }
```

## Agreement relabel and tests

Run `node server/scripts/fix-neither.js` from the root to correct legacy `tesseract_only` labels in `data/parts.json` and `data/ai_preread.json` to `neither` only when both recorded numbers are explicitly null for the same photo. Part records use the newest matching OCR entry. Missing evidence is left unchanged. The script prints changed-entry counts, changes no other fields, makes no reader calls, and is idempotent.

Run `npm test` from the repository root for all backend and checks suites. The server test command is exactly `node --test`, with no path arguments, so Node 20, 22 and 24 use default discovery for `tests/*.test.js` and `src/checks/test/`. Route and migration tests use temporary data, and reader tests use fakes without calling the real CLI.

## Server start

On start the server runs Developer C's `runChecks` on every record, saves the returned keys and writes `parts.json` once. A record whose checks throw is logged and kept unchanged.

## Demo reset

Run `npm run demo:reset` from the repository root to restore the two committed demo JSON files. The root script is `git checkout -- data/parts.json data/ai_preread.json && echo Demo data reset to the committed state`. This discards local changes in those two files and prints the confirmation after a successful reset.

## Demo fixtures

`data/demo/` holds offline demo fixtures, generated with sharp from SVG (rerun with `npm run fixtures -w server`):

- `clear_label.png`: white label with large black text "SBM-7941-NP16" and a small line "MADE IN JAPAN". OCR reads it with confidence 90 and `unclear` false.
- `blurry_label.png`: the same label heavily blurred. The quality check marks it blurry and OCR stays unclear.
- `inventory.csv`: 3 rows, one clean mirror, one whose year conflicts with its notes_ar, and one with an empty part_number. notes_ar contains Arabic text.

`npm run ai:labels -w server` separately generates the ten sharp/SVG label fixtures under `data/demo/labels/`, using only each seed record's known part number. MIR-0004 is heavily blurred and MIR-0005 is half covered by a grey patch. Those two seed records have null part numbers, so their number text stays blank. MIR-0010 displays a number with exactly one changed character to exercise protection of an existing different value. Fixture generation does not change records or call CodeBuddy.

## Part record shape

Field names are team spec and must not change, so Developer A's mock data keeps working.

- `item_id`, `seller_id`: identifiers.
- `original_title_ar`, `original_title_en`: titles from the yard note and their translation.
- `part_details`: `category`, `subcategory`, `brand`, `part_number { extracted_value, extraction_method, requires_manual_verification }`, `placement`, plus `colour_code` when a spreadsheet colour column provides it.
- `condition`: `state`, `cosmetic_damage[]`, `testing_status`.
- `readiness_status`: one of `ready_for_review`, `information_missing`, `specialist_review_required`.
- `actions_required[]`: ordered `{ priority, field, action_en, action_ar, blocking }` entries, one per gap plus a storage action if missing. Priority 1 is highest: 1 specialist conflicts; 2 seller-fixable conflicts; 3 missing identifiers and OCR/AI confirmation; 4 condition/testing disclosure; 5 shipping weight, dimensions, components and colour code; 6 non-blocking claim/unknown-word notes; 7 missing storage location. Only missing/conflict actions are blocking. Computed and protected from PUT edits.
- `donor_vehicle { make, model, year, drive_side }`: evidence only, never a fitment claim.
- `field_sources`: maps each non-empty field path to where the value came from.
- `questions[]`: `{ field, question_en, question_ar }` for each missing or conflicting detail.
- `gaps_and_conflicts[]`: `{ field, type ("missing" | "conflict" | "cannot_claim"), detail, sources[] }`.
- `photos[]`: file paths, served at `/uploads/<item_id>/<filename>` or `/demo/labels/<item_id>.png` for demo labels.
- `notes_ar`: original Arabic note text.
- `ocr`: null until the upload step fills it, then an array of OCR results, one per processed photo, each `{ engine, photo, text, confidence, unclear, quality { sharpness, blurry }, part_number_candidate, read_at }`.
- `ai_reads`: optional until the first successful AI read, then an array, newest last, of `{ engine: "CodeBuddy AI", mode: "build-time" | "live", photo, result { part_number, visible_text, damage_notes[], readable }, agreement, read_at }`. See the agreement rules above; AI evidence does not supply other part or vehicle facts.
- `candidates`: map of field path to `{ value, source }` for CSV or OCR values that differ from an existing value and were therefore not applied, for Developer C's checks.
- `created_at`: server-generated ISO creation timestamp for new upload or CSV records. Existing seed parts have no timestamp and are excluded from measured approval timing. PUT cannot edit it.
- `storage_location`: optional internal rack/bay string from the spreadsheet or seller edit. Missing storage creates only a priority-7, non-blocking action, never a gap. It is never copied to a draft, export or export Sources.
- `weight_kg`: positive numeric packaged weight from the spreadsheet or seller edit, unknown/null otherwise. Missing or invalid weight creates a blocking missing gap and bilingual question.
- `packaged_dimensions_cm { length, width, height }`: positive numeric package measurements in centimetres, unknown/null otherwise. All three are required; a missing or invalid dimension creates one blocking `packaged_dimensions_cm` gap and bilingual question.
- `included_components[]`: strings naming only components supplied with the part, unknown/null otherwise. Missing/empty components create a blocking gap and bilingual question. The draft adds one `Included: ...` line only when components are present.
- `draft`, `corridor`: null until Developer C's checks fill them. See the compatibility and checklist contracts below.
- `seller_approval { approved, approved_at }`.
- `history[]`: `{ at, field, old, new, by }`, appended on every update.

Honesty rules: never certify authenticity or guarantee fitment. A working claim requires a sourced `condition.test_record`, not just a testing-status string. Untested parts keep `testing_status` `"Untested"` and are never described as working. Subjective condition words in English and Arabic, including "good condition", "excellent", "like new", "perfect", "mint", "حالة جيدة", "حالة ممتازة", "ممتاز", "نظيف", "زي الجديد" and "مثل الجديد", are removed with `Cannot claim: subjective condition; describe the actual condition instead`. Repeated subjective wording in titles/notes creates one non-blocking bilingual question per part. Original titles and notes remain unchanged as evidence. MIR-0007's subjective title does not change readiness.

## Draft compatibility and corridor checklist

`draft.compatibility` is `{ supported: string[], unverified: string[], note }`. `supported` requires the existing two-source `confirmedPartNumber` logic, no unresolved identifier gap, and a matching entry in `data/compatibility_map.json`. Each string names the reference vehicle using "listed in reference data for" and "per reference catalogue (test data, not verified)". This is support within synthetic test reference data, not verified real-world fitment. Each catalogue entry contains `reference_vehicles: [{ make, model, years, drive_side }]` and keeps `source: "synthetic reference catalogue (test data, not verified)"`.

`unverified` always includes the donor vehicle with "Donor vehicle only, not verified fitment". LHD donors also include "Suitability for UK right-hand drive vehicles not verified". Reference vehicles whose part number could not be confirmed go here rather than into supported. `note` is "Buyer must match the part number before purchase." A short Compatibility paragraph is built from this object; no "fits", "compatible with" or "guaranteed" wording is used as a claim. MIR-0010 has no supported reference listing while its number conflicts. `runChecks(record, compatibilityMap?)` is pure: reference JSON is read once at module load, or the optional second argument supplies a map; checks never write files or use the network.

The draft condition sentence capitalizes the damage text after `Used. `, for example `Used. Light scuff on housing edge.`, without changing stored `cosmetic_damage`. Guidance labels appear as a bracketed suffix: `O/S (offside, right) (guidance, verify).` and `The buyer must verify against the part number (guidance, verify).` They never appear as a separate `. guidance, verify.` fragment. Estimated shipping uses `Shipping guidance, verify: 2 to 15 kg (estimated, weight not provided).`, with the actual corridor tier substituted. Disclosures including `Untested`, donor vehicle wording, `not verified`, and `Buyer must match the part number before purchase.` remain unchanged.

`corridor.shipping` derives its illustrative tier from `record.weight_kg` and includes `packaged_dimensions_cm` when all three measurements are valid. Missing weight keeps shipping explicitly estimated, and still creates a blocking missing gap.

The versioned definition is `data/checklists/uae-uk-mirrors-test-v1.json`, with `id: "UAE-UK-MIRRORS-TEST-v1"`, `version: "1.0"`, `dated: "2026-10-27"` and `label: "Test checklist for the prototype. Not legal, customs or tax advice."`. Each definition item has bilingual requirements, `checked_by` describing how it is checked, and `blocking`. The final two items are reference-only and name HM Revenue and Customs for UK import VAT on low-value consignments and UK Trade Tariff for commodity-code candidate 7009.10. Verify with those official sources; no tax rates, thresholds or confirmed classification are asserted.

`corridor.checklist` returns `{ id, version, dated, label, items: [{ id, status, detail }] }`, with status `pass`, `fail`, `unknown` or `reference`. It covers identifier/side confirmation, factual condition/defects, testing disclosure, photos, shipping measurements, components, fragile glass packing, hazardous-item verification, cautious compatibility and seller approval. A ready part has no fail on a blocking item. Hazard status is unknown without evidence, packing pass means the alert is shown rather than that packing was inspected, and approval stays unknown until the separate seller-approval endpoint records the last step.

All new seed shipping values and reference vehicle ranges are synthetic test data, sourced to the existing spreadsheet row or the labelled synthetic catalogue. The seed readiness remains MIR-0001 to MIR-0003 ready, MIR-0004 to MIR-0008 missing information, and MIR-0009/MIR-0010 specialist review. Seller corrections still clear MIR-0004's missing number and MIR-0007's year conflict; correcting MIR-0010's number does not clear its electrical specialist blocker.
