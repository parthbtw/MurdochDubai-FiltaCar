import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import dotenv from 'dotenv'

const ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url))
export const AI_SANDBOX_DIR = path.resolve(fileURLToPath(new URL('../../.ai-sandbox/', import.meta.url)))
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
export function findCodebuddy(env = process.env, { platform = process.platform } = {}) {
  const windows = platform === 'win32'
  const extensions = windows
    ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map((value) => value.trim().toLowerCase()).filter((value) => /^\.[a-z0-9]+$/.test(value))
    : ['']
  for (const directory of (env.PATH || '').split(windows ? ';' : path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.resolve(directory, `codebuddy${extension}`)
      try {
        // Windows executability is defined by PATHEXT, not POSIX mode bits.
        fs.accessSync(candidate, windows ? fs.constants.F_OK : fs.constants.X_OK)
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

function scanResultMessage(stdout) {
  const stack = []
  let quoted = false
  let escaped = false
  let answer
  let answerStart = -1
  for (let index = 0; index < stdout.length; index++) {
    const char = stdout[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === '{' || char === '[') {
      const envelope = char === '{' && (stack.length === 0 || (stack.length === 1 && stack[0].char === '['))
      stack.push({ char, start: index, envelope })
    } else if (char === '}' || char === ']') {
      const frame = stack.pop()
      if (!frame || (char === '}' ? frame.char !== '{' : frame.char !== '[')) {
        stack.length = 0
        continue
      }
      if (!frame.envelope) continue
      try {
        const message = JSON.parse(stdout.slice(frame.start, index + 1))
        if (message.type === 'result') {
          answer = message
          answerStart = frame.start
        }
      } catch {
        // An incomplete object is never used as a reading.
      }
    }
  }
  // A standalone JSONL result can follow a malformed or non-JSON log line.
  for (const line of [...stdout.matchAll(/[^\r\n]+/g)].reverse()) {
    if (line.index <= answerStart) break
    try {
      const message = JSON.parse(line[0])
      if (message?.type === 'result') return message
    } catch {
      // Keep scanning earlier lines; raw output is saved if none parse.
    }
  }
  return answer || null
}

function parseResult(stdout, stderr, key) {
  if (typeof stdout !== 'string' || !stdout.trim()) {
    throw withStderr('CodeBuddy AI returned empty stdout', stderr, key)
  }
  let messages
  try {
    messages = JSON.parse(stdout)
  } catch {
    const recovered = scanResultMessage(stdout)
    if (!recovered) throw withStderr('CodeBuddy AI returned truncated or invalid stdout JSON; no complete result message', stderr, key)
    messages = [recovered]
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

// The verified CLI format is an array, with the answer in result.result.
export function parseCodebuddyOutput(stdout, { stderr = '', key = '', sandboxDir = AI_SANDBOX_DIR } = {}) {
  try {
    return parseResult(stdout, stderr, key)
  } catch (error) {
    const debugFile = path.join(sandboxDir, 'last_failed_output.txt')
    const raw = typeof stdout === 'string' ? stdout : String(stdout ?? '')
    try {
      fs.mkdirSync(sandboxDir, { recursive: true })
      fs.writeFileSync(debugFile, key ? raw.split(key).join('[REDACTED]') : raw, { mode: 0o600 })
    } catch {
      throw new Error(`${sanitizeAiError(error, key).slice(0, 350)}; could not write redacted debug output to ${sanitizeAiError(debugFile, key)}`)
    }
    throw new Error(`${sanitizeAiError(error, key).slice(0, 350)}; redacted debug output: ${sanitizeAiError(debugFile, key)}`)
  }
}

export function createCodebuddyReader({
  config = loadAiConfig(),
  command = 'codebuddy',
  spawnImpl = spawn,
  timeoutMs = 45000,
  sandboxDir = AI_SANDBOX_DIR,
} = {}) {
  return async function readLabel(imagePath) {
    const key = config.apiKey || ''
    let outputDir
    let outputFd
    const closeOutput = () => {
      if (outputFd !== undefined) {
        const fd = outputFd
        outputFd = undefined
        fs.closeSync(fd)
      }
    }
    try {
      if (!key) throw new Error('CodeBuddy AI key is not configured')
      const mediaType = MEDIA_TYPES[path.extname(imagePath).toLowerCase()]
      if (!mediaType) throw new Error('CodeBuddy AI requires a png, jpeg or webp image')
      const bytes = fs.readFileSync(imagePath)
      if (bytes.length > 8 * 1024 * 1024) throw new Error('CodeBuddy AI image exceeds 8 MB')
      fs.mkdirSync(sandboxDir, { recursive: true })
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-label-output-'))
      const outputFile = path.join(outputDir, 'stdout.json')
      outputFd = fs.openSync(outputFile, 'w')
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
        let child, timer, finished = false, stderr = ''
        const finish = (error) => {
          if (finished) return
          finished = true
          clearTimeout(timer)
          try {
            closeOutput()
            if (error) throw new Error(error)
            if (fs.statSync(outputFile).size > 1024 * 1024) {
              throw new Error('CodeBuddy AI stdout exceeded 1 MB')
            }
            resolve({ stdout: fs.readFileSync(outputFile, 'utf8'), stderr })
          } catch (failure) {
            reject(withStderr(sanitizeAiError(failure, key), stderr, key))
          }
        }
        try {
          child = spawnImpl(command, args, {
            cwd: sandboxDir,
            env: { ...process.env, CODEBUDDY_API_KEY: key },
            stdio: ['pipe', outputFd, 'pipe'],
          })
          timer = setTimeout(() => {
            child.kill('SIGKILL')
            finish(`CodeBuddy AI timed out after ${timeoutMs} ms`)
          }, timeoutMs)
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
      return parseCodebuddyOutput(stdout, { stderr, key, sandboxDir })
    } catch (error) {
      throw new Error(sanitizeAiError(error, key))
    } finally {
      closeOutput()
      if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true })
    }
  }
}

export async function readLabel(imagePath) {
  return createCodebuddyReader()(imagePath)
}
