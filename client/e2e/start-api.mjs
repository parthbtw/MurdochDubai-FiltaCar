import { spawn } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const sandbox = await mkdtemp(path.join(tmpdir(), 'filtacar-e2e-'))
const dataCopy = path.join(sandbox, 'data')

try {
  await cp(path.join(repoRoot, 'data'), dataCopy, { recursive: true, dereference: true })
  const child = spawn(process.execPath, [path.join(repoRoot, 'server/src/listen.js')], {
    cwd: repoRoot,
    env: { ...process.env, PORT: '3301', FILTA_DATA_DIR: dataCopy, AI_LIVE_ENABLED: 'false' },
    stdio: 'inherit',
  })
  process.once('SIGINT', () => child.kill('SIGINT'))
  process.once('SIGTERM', () => child.kill('SIGTERM'))
  child.once('error', async error => {
    console.error(`Could not start the demo API: ${error.message}`)
    await rm(sandbox, { recursive: true, force: true })
    process.exit(1)
  })
  child.once('exit', async (code, signal) => {
    await rm(sandbox, { recursive: true, force: true })
    process.exit(code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1))
  })
} catch (error) {
  await rm(sandbox, { recursive: true, force: true })
  throw error
}
