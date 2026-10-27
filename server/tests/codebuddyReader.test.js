import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import {
  parseCodebuddyOutput,
  validateLabelResult,
  createCodebuddyReader,
  loadAiConfig,
  findCodebuddy,
} from '../src/ai/codebuddyReader.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-reader-test-'))
const key = 'dummy-codebuddy-adapter-key'
const expected = {
  part_number: 'SBM-7941-NP16',
  visible_text: 'SBM-7941-NP16',
  damage_notes: [],
  readable: true,
}
const output = (value = expected) => JSON.stringify([
  { type: 'system', subtype: 'init' },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'intermediate message' }] } },
  { type: 'result', is_error: false, result: JSON.stringify(value) },
])

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

test('adapter parses the result element from the verified JSON message array', () => {
  assert.deepEqual(parseCodebuddyOutput(output()), expected)
  const fenced = JSON.stringify([{ type: 'result', is_error: false, result: '```json\n' + JSON.stringify(expected) + '\n```' }])
  assert.deepEqual(parseCodebuddyOutput(fenced), expected)
})

test('adapter rejects is_error without revealing the key in result or stderr', () => {
  const stdout = JSON.stringify([{ type: 'result', is_error: true, result: `authentication failed ${key}` }])
  assert.throws(() => parseCodebuddyOutput(stdout, { stderr: `bad credential ${key}`, key }), (err) => {
    assert.ok(err instanceof Error)
    assert.match(err.message, /error|failed/i)
    assert.equal(err.message.includes(key), false)
    return true
  })
})

test('empty stdout reports a short, key-free stderr diagnostic', () => {
  assert.throws(() => parseCodebuddyOutput(' \n', { stderr: `connection refused ${key}`, key }), (err) => {
    assert.match(err.message, /empty/i)
    assert.match(err.message, /connection refused/i)
    assert.equal(err.message.includes(key), false)
    assert.ok(err.message.length < 1500)
    return true
  })
})

test('adapter rejects malformed envelopes, missing result and invalid output shapes', () => {
  for (const stdout of [
    'not JSON',
    JSON.stringify({ type: 'result', is_error: false, result: JSON.stringify(expected) }),
    JSON.stringify([{ type: 'assistant' }]),
    JSON.stringify([{ type: 'result', is_error: false, result: '' }]),
    JSON.stringify([{ type: 'result', is_error: false, result: 'SBM-7941-NP16' }]),
    output({ ...expected, readable: 'yes' }),
    output({ ...expected, part_number: 123 }),
    output({ ...expected, damage_notes: 'none' }),
    output({ ...expected, damage_notes: [42] }),
    output({ ...expected, fitment: 'guessed' }),
  ]) {
    assert.throws(() => parseCodebuddyOutput(stdout))
  }
  assert.throws(() => validateLabelResult(null))
  assert.throws(() => validateLabelResult({ ...expected, visible_text: null }))
})

test('adapter rejects output containing its credential before it can be stored', () => {
  assert.throws(() => parseCodebuddyOutput(output({ ...expected, visible_text: key }), { key }), (err) => {
    assert.equal(err.message.includes(key), false)
    return true
  })
})

function fakeSpawn({ stdout = output(), stderr = '', exitCode = 0, error, hanging = false } = {}) {
  const calls = []
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter()
    child.stdin = new PassThrough()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => {
      calls.at(-1).killed = true
      setImmediate(() => child.emit('close', null, 'SIGKILL'))
      return true
    }
    const call = { command, args, options, stdin: '', killed: false }
    calls.push(call)
    child.stdin.on('data', (chunk) => { call.stdin += chunk.toString() })
    child.stdin.on('finish', () => {
      setImmediate(() => {
        if (error) return child.emit('error', error)
        if (hanging) return
        child.stdout.end(stdout)
        child.stderr.end(stderr)
        child.emit('close', exitCode)
      })
    })
    return child
  }
  return { calls, spawnImpl }
}

test('reader sends image first, limits tools, isolates cwd and passes the key only to child env', async () => {
  const fake = fakeSpawn()
  const imagePath = path.join(tmpDir, 'label.png')
  const imageBytes = Buffer.from('fake image bytes')
  fs.writeFileSync(imagePath, imageBytes)
  const before = process.env.CODEBUDDY_API_KEY
  const reader = createCodebuddyReader({ config: { apiKey: key, liveEnabled: true }, command: '/fake/codebuddy', spawnImpl: fake.spawnImpl })
  assert.deepEqual(await reader(imagePath), expected)
  assert.equal(fake.calls.length, 1)
  const call = fake.calls[0]
  assert.equal(call.command, '/fake/codebuddy')
  for (const arg of ['-p', '--input-format', 'stream-json', '--output-format', 'json', '--disallowedTools']) {
    assert.ok(call.args.includes(arg))
  }
  const tools = call.args[call.args.indexOf('--disallowedTools') + 1]
  for (const tool of ['Bash', 'Write', 'Edit', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']) {
    assert.ok(tools.split(',').includes(tool))
  }
  assert.equal(call.args.join(' ').includes(key), false)
  assert.equal(call.options.env.CODEBUDDY_API_KEY, key)
  assert.equal(process.env.CODEBUDDY_API_KEY, before)
  assert.notEqual(call.options.cwd, path.dirname(imagePath))
  assert.equal(fs.existsSync(call.options.cwd), false)
  const input = JSON.parse(call.stdin.trim())
  assert.equal(input.type, 'user')
  assert.equal(input.message.role, 'user')
  const [image, instruction] = input.message.content
  assert.equal(image.type, 'image')
  assert.deepEqual(image.source, { type: 'base64', media_type: 'image/png', data: imageBytes.toString('base64') })
  assert.equal(instruction.type, 'text')
  assert.match(instruction.text, /only text physically visible/i)
  assert.match(instruction.text, /never guess brand, fitment, model, year, side or condition/i)
  assert.equal(call.stdin.includes(key), false)
})

test('reader chooses JPEG and WebP media types from extensions', async () => {
  for (const [extension, mediaType] of [['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp']]) {
    const imagePath = path.join(tmpDir, 'label' + extension)
    fs.writeFileSync(imagePath, 'fake bytes')
    const fake = fakeSpawn()
    const reader = createCodebuddyReader({ config: { apiKey: key }, spawnImpl: fake.spawnImpl })
    await reader(imagePath)
    assert.equal(JSON.parse(fake.calls[0].stdin).message.content[0].source.media_type, mediaType)
  }
})

test('reader never spawns without a key', async () => {
  const fake = fakeSpawn()
  const reader = createCodebuddyReader({ config: { apiKey: '' }, spawnImpl: fake.spawnImpl })
  await assert.rejects(reader(path.join(tmpDir, 'label.png')), /key|configured/i)
  assert.equal(fake.calls.length, 0)
})

test('reader handles a missing CLI, nonzero exit and timeout without leaking the key', async () => {
  const imagePath = path.join(tmpDir, 'label.png')
  fs.writeFileSync(imagePath, 'fake bytes')
  for (const options of [
    { error: Object.assign(new Error(`missing ${key}`), { code: 'ENOENT' }) },
    { exitCode: 1, stderr: `offline ${key}` },
    { hanging: true },
  ]) {
    const fake = fakeSpawn(options)
    const reader = createCodebuddyReader({ config: { apiKey: key }, spawnImpl: fake.spawnImpl, timeoutMs: 15 })
    await assert.rejects(reader(imagePath), (err) => {
      assert.ok(err instanceof Error)
      assert.equal(err.message.includes(key), false)
      if (options.hanging) assert.match(err.message, /timed? ?out|timeout/i)
      return true
    })
    assert.equal(fs.existsSync(fake.calls[0].options.cwd), false)
    if (options.hanging) assert.equal(fake.calls[0].killed, true)
  }
})

test('runtime configuration can use an isolated dotenv file without modifying parent env', () => {
  const envPath = path.join(tmpDir, 'test.env')
  fs.writeFileSync(envPath, `CODEBUDDY_API_KEY=${key}\nAI_LIVE_ENABLED=true\n`)
  const env = {}
  const loaded = loadAiConfig({ env, envPath })
  assert.equal(loaded.apiKey, key)
  assert.equal(loaded.liveEnabled, true)
  assert.deepEqual(env, {})
  const absent = loadAiConfig({ env: {}, envPath: path.join(tmpDir, 'not-present.env') })
  assert.equal(Boolean(absent.apiKey), false)
  assert.equal(absent.liveEnabled, false)
})

test('CLI discovery checks executable files on PATH without executing them', () => {
  const binDir = path.join(tmpDir, 'bin')
  fs.mkdirSync(binDir)
  const binary = path.join(binDir, 'codebuddy')
  fs.writeFileSync(binary, '#!/bin/sh\nexit 99\n', { mode: 0o755 })
  assert.equal(findCodebuddy({ PATH: binDir }), binary)
  fs.chmodSync(binary, 0o644)
  assert.equal(findCodebuddy({ PATH: binDir }), null)
  assert.equal(findCodebuddy({ PATH: path.join(tmpDir, 'missing-bin') }), null)
})
