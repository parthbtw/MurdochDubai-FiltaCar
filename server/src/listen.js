import { createApp } from './index.js'

const PORT = process.env.PORT || 3001
const app = createApp()

app.listen(PORT, () => {
  console.log(`FiltaCar API listening on http://localhost:${PORT}`)
})
