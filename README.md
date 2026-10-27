# FiltaCar

FiltaCar is a hackathon prototype for the eBay case study "From Salvage Yard to Global Marketplace". It turns messy salvage-yard inputs (photos, spreadsheets, donor-vehicle notes, Arabic notes) from a Dubai salvage seller into honest eBay listing drafts for UK buyers. Every record carries field-level provenance, surfaces gaps and conflicts as questions for the seller, and blocks approval while information is missing or conflicting, so no listing makes a fitment or authenticity claim the evidence does not support.

## How to run

```bash
npm install
npm run dev   # runs the Vite client and the Express API together
npm test      # runs the server tests (node:test + supertest)
```

The API serves on `http://localhost:3001` and the Vite dev server proxies `/api` to it.

## CodeBuddy AI setup

Tesseract remains the offline label reader. CodeBuddy AI is an optional second reader; the app works without the CLI, key or internet.

```bash
npm install -g @tencent-ai/codebuddy-code
cp server/.env.example server/.env
```

Add your key to `CODEBUDDY_API_KEY` in `server/.env` and keep `AI_LIVE_ENABLED=true` to enable new live reads. Restart the API after changing this setup. Keep `server/.env` local; it is ignored by Git.

The ten synthetic demo labels are committed in `data/demo/labels/`. Regenerate them with `npm run ai:labels -w server`, then run the optional preread when ready:

```bash
npm run ai:preread
```

Preread attaches each label, saves Tesseract and AI readings, applies the agreement rules, runs the record checks and writes `data/ai_preread.json`. A failed AI read keeps the Tesseract fallback and processing continues. It skips parts already read; `npm run ai:preread -- --force` processes them again using cached AI results for unchanged image bytes. Only successful AI results are cached by SHA-256 in `data/ai_read_cache.json` and reused by live reads, including after restart. Failures stay only in memory for up to 60 seconds to suppress rapid repeat clicks, then allow a retry. Preread `--force` retries failures immediately while keeping successful cached results. Old disk error entries are ignored. New image reads use credits; tests use fake readers only.

Check `GET /api/ai/status` for availability. Live reads use `POST /api/parts/:id/ai-read` with `{ "photo": "/demo/labels/MIR-0001.png" }`; that photo must already belong to the record. Agreement can fill an empty part number, while an AI-only result needs seller confirmation through `POST /api/parts/:id/ai-accept`. Existing different numbers are preserved. See the contract for all request and response rules.

## Folder ownership

- Developer A: `client/` (React frontend)
- Developer B: `server/` and `data/` (core API and data pipeline)
- Developer C: `server/src/checks/` (validation checks)

## API contract

See [docs/CONTRACT.md](docs/CONTRACT.md) for every route, example requests and responses, and the part record shape.
