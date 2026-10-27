import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import dotenv from 'dotenv'

const ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url))
const DISALLOWED_TOOLS = 'Bash,Write,Edit,Read,Glob,Grep,WebFetch,WebSearch'
const INSTRUCTION = 'Read only text physically visible on this label. Reply with ONLY a JSON object: {"part_number": string or null, "visible_text": string, "damage_notes": [strings], "readable": boolean}. part_number must be null unless clearly readable. Never guess brand, fitment, model, year, side or condition. damage_notes only for damage you can actually see.'
const MEDIA_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

// Load into a private object, never into the server's process environment.
export function loadAiConfig({ env = process.env, envPath = ENV_PATH } = {}) {
  const values = { ...env }
  dotenv.config({ path: envPath, processEnv: values, quiet: true })
  return {
    apiKey: typeof values.CODEBUDDY_API_KEY === 'string' ? values.CODEBUDDY_API_KEY : '',
    liveEnabled: values.AI_LIVE_ENABLED === 'true',
  }
}

// Startup detection only inspects PATH; it never starts the CLI.
export function findCodebuddy(env = process.env) {
  const extensions = process.platform === 'win32' ? ['', '.cmd', '.exe'] : ['']
  for (const directory of (env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.resolve(directory, `codebuddy${extension}`)
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        if (fs.statSync(candidate).isFile()) return candidate
      } catch {
        // Missing or non-executable entries are simply unavailable.
      }
    }
  }
  return null
}

export function sanitizeAiError(error, key = '') {
  let text = error instanceof Error ? error.message : String(error || 'CodeBuddy AI unavailable')
  if (key) text = text.split(key).join('[REDACTED]')
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\r\n\t]+/g, ' ').slice(0, 600)
}

export function validateLabelResult(result) {
  const fields = ['part_number', 'visible_text', 'damage_notes', 'readable']
  if (
    !result || typeof result !== 'object' || Array.isArray(result) ||
    Object.keys(result).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(result, field)) ||
    !(result.part_number === null || (typeof result.part_number === 'string' && result.part_number.trim())) ||
    typeof result.visible_text !== 'string' ||
    !Array.isArray(result.damage_notes) || !result.damage_notes.every((note) => typeof note === 'string') ||
    typeof result.readable !== 'boolean' ||
    (result.part_number !== null && !result.readable)
  ) {
    throw new Error('CodeBuddy AI returned an invalid label result shape')
  }
  return structuredClone(result)
}

function withStderr(message, stderr, key) {
  const snippet = sanitizeAiError(stderr, key).trim().slice(0, 240)
  return new Error(sanitizeAiError(`${message}; stderr: ${snippet || '(empty)'}`, key))
}

// The verified CLI format is an array, with the answer in result.result.
export function parseCodebuddyOutput(stdout, { stderr = '', key = '' } = {}) {
  if (typeof stdout !== 'string' || !stdout.trim()) {
    throw withStderr('CodeBuddy AI returned empty stdout', stderr, key)
  }
  let messages
  try {
    messages = JSON.parse(stdout)
  } catch {
    throw withStderr('CodeBuddy AI returned invalid stdout JSON', stderr, key)
  }
  if (!Array.isArray(messages)) {
    throw withStderr('CodeBuddy AI stdout must be a JSON array of messages', stderr, key)
  }
  const answer = [...messages].reverse().find((message) => message?.type === 'result')
  if (!answer) throw withStderr('CodeBuddy AI returned no result message', stderr, key)
  if (answer.is_error !== false) {
    const detail = typeof answer.result === 'string' ? sanitizeAiError(answer.result, key).slice(0, 180) : 'unknown CLI error'
    throw withStderr(`CodeBuddy AI result is_error: ${detail}`, stderr, key)
  }
  if (typeof answer.result !== 'string' || !answer.result.trim()) {
    throw withStderr('CodeBuddy AI returned an empty result string', stderr, key)
  }
  const text = answer.result.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim()
  let result
  try {
    result = validateLabelResult(JSON.parse(text))
  } catch {
    throw withStderr('CodeBuddy AI returned invalid label JSON or result shape', stderr, key)
  }
  if (key && JSON.stringify(result).includes(key)) {
    throw withStderr('CodeBuddy AI returned sensitive output', stderr, key)
  }
  return result
}

export function createCodebuddyReader({
  config = loadAiConfig(),
  command = 'codebuddy',
  spawnImpl = spawn,
  timeoutMs = 45000,
} = {}) {
  return async function readLabel(imagePath) {
    const key = config.apiKey || ''
    let cwd
    try {
      if (!key) throw new Error('CodeBuddy AI key is not configured')
      const mediaType = MEDIA_TYPES[path.extname(imagePath).toLowerCase()]
      if (!mediaType) throw new Error('CodeBuddy AI requires a png, jpeg or webp image')
      const bytes = fs.readFileSync(imagePath)
      if (bytes.length > 8 * 1024 * 1024) throw new Error('CodeBuddy AI image exceeds 8 MB')
      cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-label-'))
      const args = [
        '-p', '--input-format', 'stream-json', '--output-format', 'json',
        '--disallowedTools', DISALLOWED_TOOLS, '--tools', '',
        '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--setting-sources', '', '--no-session-persistence',
      ]
      const input = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: bytes.toString('base64') } },
            { type: 'text', text: INSTRUCTION },
          ],
        },
      }) + '\n'
      const { stdout, stderr } = await new Promise((resolve, reject) => {
        let child, timer, finished = false, stdout = '', stderr = ''
        const finish = (error) => {
          if (finished) return
          finished = true
          clearTimeout(timer)
          if (error) reject(withStderr(error, stderr, key))
          else resolve({ stdout, stderr })
        }
        try {
          child = spawnImpl(command, args, {
            cwd,
            env: {
              PATH: process.env.PATH,
              HOME: process.env.HOME,
              TMPDIR: process.env.TMPDIR || os.tmpdir(),
              CODEBUDDY_API_KEY: key,
            },
            stdio: ['pipe', 'pipe', 'pipe'],
          })
          timer = setTimeout(() => {
            child.kill('SIGKILL')
            finish(`CodeBuddy AI timed out after ${timeoutMs} ms`)
          }, timeoutMs)
          child.stdout.on('data', (chunk) => {
            stdout += chunk.toString()
            if (stdout.length > 1024 * 1024) {
              child.kill('SIGKILL')
              finish('CodeBuddy AI stdout exceeded 1 MB')
            }
          })
          child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(0, 65536) })
          child.on('error', (error) => {
            finish(error.code === 'ENOENT' ? 'CodeBuddy CLI not found on PATH' : `CodeBuddy CLI failed: ${sanitizeAiError(error, key)}`)
          })
          child.on('close', (code) => {
            if (code !== 0) finish(`CodeBuddy CLI exited with code ${code}`)
            else finish()
          })
          child.stdin.on('error', () => {})
          child.stdin.end(input)
        } catch (error) {
          child?.kill('SIGKILL')
          finish(`CodeBuddy CLI failed: ${sanitizeAiError(error, key)}`)
        }
      })
      return parseCodebuddyOutput(stdout, { stderr, key })
    } catch (error) {
      throw new Error(sanitizeAiError(error, key))
    } finally {
      if (cwd) fs.rmSync(cwd, { recursive: true, force: true })
    }
  }
}

export async function readLabel(imagePath) {
  return createCodebuddyReader()(imagePath)
}
