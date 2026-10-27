import express from 'express'
import cors from 'cors'
import path from 'node:path'
import partsRouter, { compatibilityLookup } from './routes/parts.js'
import uploadRouter from './routes/upload.js'
import { createAiRouter } from './routes/ai.js'
import { DATA_DIR } from './store.js'

export function createApp({ ai = {} } = {}) {
  const app = express()
  app.disable('x-powered-by')

  // CORS allowed for localhost only.
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
          return callback(null, true)
        }
        return callback(new Error('CORS not allowed for this origin'))
      },
    })
  )
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({ ok: true })
  })

  app.use('/api', createAiRouter(ai))
  app.use('/api/parts', partsRouter)
  app.use('/api/upload', uploadRouter)

  // Static photos from data/uploads, so the frontend can show them at
  // /uploads/<item_id>/<filename>.
  app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')))
  app.use('/demo', express.static(path.join(DATA_DIR, 'demo')))

  // GET /api/compatibility/:partNumber: reference catalogue lookup or 404.
  app.get('/api/compatibility/:partNumber', (req, res) => {
    const entry = compatibilityLookup(req.params.partNumber)
    if (!entry) {
      return res
        .status(404)
        .json({ error: `no compatibility entry for part number ${req.params.partNumber}` })
    }
    res.json({ part_number: req.params.partNumber, ...entry })
  })

  // 404 for unknown API routes.
  app.use((req, res) => {
    res.status(404).json({ error: `no route for ${req.method} ${req.path}` })
  })

  // Central error handler: always JSON { error }.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || 500
    if (err.name === 'MulterError') status = 400
    if (err.message && err.message.includes('CORS')) status = 403
    res.status(status).json({ error: err.message || 'internal server error' })
  })

  return app
}
