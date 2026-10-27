import { createApp } from './index.js'
import { runChecksOnStartup } from './startup.js'

const PORT = process.env.PORT || 3001
const app = createApp()

// Run Developer C's checks on every record before serving traffic.
runChecksOnStartup()
  .then(({ processed, errors, total }) => {
    console.log(`startup checks: ${processed}/${total} processed, ${errors.length} error(s)`)
  })
  .catch((err) => {
    console.error(`startup checks failed: ${err.message}`)
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`FiltaCar API listening on http://localhost:${PORT}`)
    })
  })
