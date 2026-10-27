# FiltaCar

FiltaCar is a hackathon prototype for the eBay case study "From Salvage Yard to Global Marketplace". It turns messy salvage-yard inputs (photos, spreadsheets, donor-vehicle notes, Arabic notes) from a Dubai salvage seller into honest eBay listing drafts for UK buyers. Every record carries field-level provenance, surfaces gaps and conflicts as questions for the seller, and blocks approval while information is missing or conflicting, so no listing makes a fitment or authenticity claim the evidence does not support.

## How to run

```bash
npm install
npm run dev   # runs the Vite client and the Express API together
npm test      # runs the server tests (node:test + supertest)
```

The API serves on `http://localhost:3001` and the Vite dev server proxies `/api` to it.

## Folder ownership

- Developer A: `client/` (React frontend)
- Developer B: `server/` and `data/` (core API and data pipeline)
- Developer C: `server/src/checks/` (validation checks)

## API contract

See [docs/CONTRACT.md](docs/CONTRACT.md) for every route, example requests and responses, and the part record shape.
