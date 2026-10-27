import { test as base, expect, type APIResponse, type Request } from '@playwright/test'

type OfflineFixtures = {
  offlineRequests: string[]
  localGet: (href: string) => Promise<APIResponse>
}

function isLocal(url: string) {
  const parsed = new URL(url)
  return parsed.protocol === 'blob:' || parsed.protocol === 'data:' || parsed.hostname === 'localhost'
}

export const test = base.extend<OfflineFixtures>({
  offlineRequests: [async ({ context }, provide, testInfo) => {
    const requests: string[] = []
    const record = (request: Request) => { requests.push(request.url()) }
    context.on('request', record)
    // Block external requests as well as failing on them.
    await context.route('**/*', route => isLocal(route.request().url()) ? route.continue() : route.abort('blockedbyclient'))
    try {
      await provide(requests)
    } finally {
      await context.unrouteAll({ behavior: 'wait' })
      context.off('request', record)
      await testInfo.attach('offline-requests', { body: JSON.stringify(requests, null, 2), contentType: 'application/json' })
      expect(requests.filter(url => !isLocal(url)), 'Every request must stay on localhost').toEqual([])
    }
  }, { auto: true }],
  localGet: async ({ request, baseURL, offlineRequests }, provide) => {
    // APIRequestContext bypasses browser routing, so record and check each hop explicitly.
    await provide(async href => {
      let url = new URL(href, baseURL).href
      for (let hop = 0; hop < 10; hop += 1) {
        offlineRequests.push(url)
        expect(isLocal(url), `External request refused: ${url}`).toBe(true)
        const response = await request.get(url, { maxRedirects: 0 })
        const location = response.headers().location
        if (response.status() < 300 || response.status() >= 400 || !location) return response
        url = new URL(location, url).href
        await response.dispose()
      }
      throw new Error('Too many redirects while requesting the local CSV')
    })
  },
})

export { expect } from '@playwright/test'
