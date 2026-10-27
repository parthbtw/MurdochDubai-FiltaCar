# FiltaCar

FiltaCar turns salvage yard photos, spreadsheets and Arabic notes into listing drafts for used car parts. Business sellers manage a readiness queue; Individual sellers follow Sell a part. Each fact keeps its source, gaps become questions, and the seller approves the final wording. Facts in. Guesses out.

## Requirements

Node 18 or newer, with Node 20 recommended, and npm. Google Chrome is needed only for the end to end tests.

## Setup and run

```sh
npm install
npm run dev
```

Open http://localhost:5173. An iPhone size works best: in Chrome press Cmd+Option+I, then turn on the device toolbar. The API runs at http://localhost:3001.

## Tests

```sh
npm test
npm run e2e
```

The first command runs the server and client unit tests. The second runs eight Playwright journeys in installed Google Chrome at 390 by 844 pixels and checks that browser requests and the CSV fetch stay on localhost. It starts a preview at http://localhost:4473 and an API at http://localhost:3301 using a fresh temporary copy of `data/`. Keep both ports free. Real demo data is unchanged. Reports are in `client/playwright-report/`.

If Playwright Chromium is already installed, use `PW_CHROMIUM=1 npm run e2e` instead. CI runs unit tests and the client build, without browser tests.

## Reset the demo

```sh
npm run demo:reset
```

This discards local changes to the two committed demo JSON files. Restart the app afterwards.

## Five demo journeys

1. Evidence to export: open MIR-0001, inspect the part number source, approve with confirmation, then download the mock CSV from Export.
2. Conflicting year: open MIR-0007, change donor year to 2015, inspect What changed, then approve.
3. Unreadable label: open MIR-0004, choose Check label and type `sbm 7944 pj14`; it saves as `SBM-7944-PJ14` and becomes Ready for review.
4. Honest wording and blockers: inspect MIR-0003's claim guard, then see why MIR-0009 and MIR-0010 cannot be approved.
5. Seller intake: switch to Individual, sell `data/demo/clear_label.png`, confirm the label and answer 2016 for donor year; in Business, Add `data/demo/blurry_label.png` to see the retake warning.

## Optional CodeBuddy AI setup

Tesseract is the offline label reader. CodeBuddy AI is an optional second reader; the app works without its CLI, key or internet.

```sh
npm install -g @tencent-ai/codebuddy-code
cp server/.env.example server/.env
```

Add `CODEBUDDY_API_KEY` to that local file, set `AI_LIVE_ENABLED=true` and restart the API. Keep the file local; Git ignores it. New live reads use credits.

The ten synthetic demo labels are in `data/demo/labels/`. Regenerate with `npm run ai:labels -w server`. Optional `npm run ai:preread` attaches each label, saves both readings, applies agreement, runs checks and writes `data/ai_preread.json`. Failures retain the Tesseract fallback. Successful reads are cached by image hash in `data/ai_read_cache.json` and reused after restart; failures are held in memory for up to 60 seconds. Preread skips completed parts; `npm run ai:preread -- --force` reprocesses them, reuses successful cached reads and retries failures immediately. `GET /api/ai/status` reports availability. Agreement may fill an empty number; an AI only suggestion needs seller confirmation. Live reads use `POST /api/parts/:id/ai-read` with an already attached photo; seller confirmation uses `POST /api/parts/:id/ai-accept`. Existing different numbers stay unchanged. Tests use fake readers.

## Honesty rules

Demo data is synthetic. Export is marked `MOCK, NOT PUBLISHED`; nothing is published or sent to eBay. No fitment, authenticity or unsupported working claims are made. Seller approval is the last step; changing an approved record withdraws approval.

## Folders and API

`client/`: React and TypeScript app, unit tests and browser journeys.

`server/`: Express API, uploads, readers and checks.

`data/`: synthetic records, reference data and demo images.

`docs/`: [API contract](docs/CONTRACT.md), including routes, record shapes and reader rules.
