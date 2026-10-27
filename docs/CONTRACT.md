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

- The following keys are computed or system-owned and will be rejected with 400 if present in the patch: `gaps_and_conflicts`, `questions`, `readiness_status`, `field_sources`, `draft`, `corridor`, `ocr`, `history`, `seller_approval`, `item_id`.
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

- `POST /api/upload`: accepts yard photos and OCR output, enriches a record and fills `ocr`.
- `GET /api/export/ebay.csv`: exports approved records as an eBay listing CSV for UK buyers.
- `GET /api/metrics`: pipeline quality metrics.

## Part record shape

Field names are team spec and must not change, so Developer A's mock data keeps working.

- `item_id`, `seller_id`: identifiers.
- `original_title_ar`, `original_title_en`: titles from the yard note and their translation.
- `part_details`: `category`, `subcategory`, `brand`, `part_number { extracted_value, extraction_method, requires_manual_verification }`, `placement`.
- `condition`: `state`, `cosmetic_damage[]`, `testing_status`.
- `readiness_status`: one of `ready_for_review`, `information_missing`, `specialist_review_required`.
- `actions_required[]`: next steps for the seller.
- `donor_vehicle { make, model, year, drive_side }`: evidence only, never a fitment claim.
- `field_sources`: maps each non-empty field path to where the value came from.
- `questions[]`: `{ field, question_en, question_ar }` for each missing or conflicting detail.
- `gaps_and_conflicts[]`: `{ field, type ("missing" | "conflict" | "cannot_claim"), detail, sources[] }`.
- `photos[]`: file paths.
- `notes_ar`: original Arabic note text.
- `ocr`: null until the upload step fills it.
- `draft`, `corridor`: null until Developer C's checks fill them.
- `seller_approval { approved, approved_at }`.
- `history[]`: `{ at, field, old, new, by }`, appended on every update.

Honesty rules: never include a fitment claim, a "genuine" or "OEM" authenticity claim, or a "tested working" condition unless a `field_sources` entry supports it. Untested parts keep `testing_status` `"Untested"` and are never described as working.
