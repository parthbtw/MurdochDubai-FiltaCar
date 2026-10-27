import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './endpoints'
import { ApiError } from './client'
import { retryApi } from './queries'
import { part, partsResponse as parts, metrics, questionPack, exportPreview, aiStatus } from '@/test/fixtures'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
function respond(body: unknown, status = 200) { fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status })) }
describe('typed endpoints', () => {
  const cases: [string, () => Promise<unknown>, string, string, unknown][] = [
    ['health', api.getHealth, '/api/health', 'GET', { ok: true }],
    ['parts', () => api.getParts(), '/api/parts', 'GET', parts],
    ['filtered parts', () => api.getParts({ status: 'information_missing', seller_id: 'yard / 1' }), '/api/parts?status=information_missing&seller_id=yard+%2F+1', 'GET', parts],
    ['part', () => api.getPart('MIR/7'), '/api/parts/MIR%2F7', 'GET', part],
    ['update', () => api.updatePart('MIR/7', { donor_vehicle: { year: 2015 } }), '/api/parts/MIR%2F7', 'PUT', part],
    ['approve', () => api.approvePart('MIR/7'), '/api/parts/MIR%2F7/approve', 'POST', part],
    ['compatibility', () => api.getCompatibility('SBM / 1'), '/api/compatibility/SBM%20%2F%201', 'GET', { part_number: 'SBM / 1', source: 'synthetic reference catalogue (test data, not verified)', region_notes: '', reference_vehicles: [], field_sources: {} }],
    ['AI status', api.getAiStatus, '/api/ai/status', 'GET', aiStatus],
    ['AI read', () => api.aiRead('MIR/7', '/demo/labels/MIR-0007.png'), '/api/parts/MIR%2F7/ai-read', 'POST', part],
    ['AI accept', () => api.aiAccept('MIR/7', 0), '/api/parts/MIR%2F7/ai-accept', 'POST', part],
    ['export', api.getExportPreview, '/api/export/preview', 'GET', exportPreview],
    ['metrics', () => api.getMetrics(), '/api/metrics', 'GET', metrics],
    ['seller metrics', () => api.getMetrics({ seller_id: 'yard / 1' }), '/api/metrics?seller_id=yard+%2F+1', 'GET', metrics],
    ['question pack', () => api.getQuestionPack('MIR/7'), '/api/parts/MIR%2F7/question-pack', 'GET', questionPack],
  ]
  it.each(cases)('%s uses the contract URL and method', async (_, call, url, method, body) => {
    respond(body)
    expect(await call()).toEqual(body)
    const [actualUrl, init] = fetchMock.mock.calls[0]
    expect(actualUrl).toBe(url)
    expect(init.method ?? 'GET').toBe(method)
    expect(init.headers.get('Accept')).toBe('application/json')
  })
  it('serializes a seller patch without changing it', async () => {
    respond(part); await api.updatePart('MIR-0007', { donor_vehicle: { year: 2015 } })
    expect(fetchMock.mock.calls[0][1].body).toBe('{"donor_vehicle":{"year":2015}}')
    expect(fetchMock.mock.calls[0][1].headers.get('Content-Type')).toBe('application/json')
  })
  it('sends the exact AI request bodies', async () => {
    respond(part); await api.aiRead('MIR-0007', '/demo/labels/MIR-0007.png')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ photo: '/demo/labels/MIR-0007.png' })
    respond(part); await api.aiAccept('MIR-0007', 0)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ read_index: 0 })
  })
  it('uploads multipart without forcing a content type', async () => {
    const form = new FormData(); form.append('item_id', 'MIR-0007')
    respond({ created: [], updated: ['MIR-0007'], warnings: [], parts: [part] })
    await api.uploadFiles(form)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/upload')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(fetchMock.mock.calls[0][1].body).toBe(form)
    expect(fetchMock.mock.calls[0][1].headers.has('Content-Type')).toBe(false)
  })
  it('exports through a relative download URL', () => expect(api.exportCsvUrl).toBe('/api/export/ebay.csv'))
  it('maps 404 to the server message', async () => {
    respond({ error: 'part MIR-9999 not found' }, 404)
    await expect(api.getPart('MIR-9999')).rejects.toMatchObject({ name: 'ApiError', status: 404, message: 'part MIR-9999 not found' })
  })
  it('preserves approval gaps on 409', async () => {
    respond({ error: 'cannot approve', gaps_and_conflicts: part.gaps_and_conflicts }, 409)
    await expect(api.approvePart('MIR-0007')).rejects.toMatchObject({ status: 409, body: { gaps_and_conflicts: part.gaps_and_conflicts } })
  })
  it('preserves the manual fallback on 503', async () => {
    respond({ error: 'reader unavailable', fallback: 'manual' }, 503)
    await expect(api.aiRead('MIR-0007', part.photos[1])).rejects.toMatchObject({ status: 503, body: { fallback: 'manual' } })
  })
  it('never retries 4xx, and bounds other retries', () => {
    expect(retryApi(0, new ApiError(404, 'not found', {}))).toBe(false)
    expect(retryApi(0, new ApiError(503, 'unavailable', {}))).toBe(true)
    expect(retryApi(2, new Error('offline'))).toBe(false)
  })
})
