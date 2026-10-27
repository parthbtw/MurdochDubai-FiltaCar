import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import App from '@/App'
import { partsResponse as parts, metrics, part, specialist } from '@/test/fixtures'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    const body = url === '/api/parts' ? parts : url === '/api/metrics' ? metrics : url === '/api/parts/MIR-0010' ? specialist : part
    return new Response(JSON.stringify(body), { status: 200 })
  })
})
function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output data-testid="url">{location.pathname}{location.search}</output><button onClick={() => navigate('/?status=specialist_review_required')}>Navigate to specialist</button></>
}
function mount(url = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /><LocationProbe /></MemoryRouter></QueryClientProvider>)
}
it('shows real lane counts, defaults to Ready and fetches parts once', async () => {
  mount()
  expect(await screen.findByRole('tab', { name: 'Ready 3' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: 'Missing 5' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Specialist 2' })).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: /^Review MIR-/ })).toHaveLength(3)
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/parts')).toHaveLength(1)
})
it('choosing Missing shows MIR-0004 to MIR-0008 and changes the URL', async () => {
  mount()
  await userEvent.click(await screen.findByRole('tab', { name: 'Missing 5' }))
  for (const number of [4, 5, 6, 7, 8]) expect(screen.getByRole('link', { name: `Review MIR-000${number}` })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Review MIR-0001' })).not.toBeInTheDocument()
  expect(screen.getByTestId('url')).toHaveTextContent('/?status=information_missing')
})
it('uses the URL lane and responds to navigation', async () => {
  mount('/?status=information_missing')
  expect(await screen.findByRole('tab', { name: 'Missing 5' })).toHaveAttribute('aria-selected', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Navigate to specialist' }))
  expect(screen.getByRole('tab', { name: 'Specialist 2' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('link', { name: 'Review MIR-0010' })).toBeInTheDocument()
})
it('supports keyboard lane selection', async () => {
  mount()
  const ready = await screen.findByRole('tab', { name: 'Ready 3' })
  act(() => ready.focus())
  await userEvent.keyboard('{ArrowRight}')
  expect(screen.getByRole('tab', { name: 'Missing 5' })).toHaveAttribute('aria-selected', 'true')
})
it('explains a failed queue fetch and offers retry', async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'parts unavailable' }), { status: 400 }))
  mount()
  await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
  expect(screen.getAllByText('parts unavailable')).toHaveLength(2)
  expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(2)
})
it('renders an empty lane honestly', async () => {
  fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify(url === '/api/parts' ? { parts: [] } : metrics)))
  mount()
  expect(await screen.findByText('No parts in this lane.')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Ready 0' })).toBeInTheDocument()
})
it('shows donor year 2018 and both conflicting sources', async () => {
  mount('/parts/MIR-0007')
  const cell = await screen.findByRole('button', { name: 'Source for donor year: spreadsheet row 9' })
  expect(within(cell).getByText('2018')).toBeInTheDocument()
  expect(within(cell).getByText('Conflict')).toBeInTheDocument()
  expect(within(cell).getByText('Sources: spreadsheet row 9; Arabic yard note')).toBeInTheDocument()
})
it('traces the donor year through its source chip into an evidence sheet', async () => {
  mount('/parts/MIR-0007')
  const cell = await screen.findByRole('button', { name: 'Source for donor year: spreadsheet row 9' })
  await userEvent.click(within(cell).getByText('spreadsheet row 9'))
  const sheet = await screen.findByRole('dialog', { name: 'Where this came from' })
  expect(within(sheet).getByText('spreadsheet row 9')).toBeInTheDocument()
  expect(within(sheet).getByText("From row 9 of the seller's inventory spreadsheet")).toBeInTheDocument()
  const resize = within(sheet).getByRole('button', { name: 'Change sheet height' })
  expect(resize).toHaveAttribute('tabindex', '0')
  await userEvent.click(resize)
  expect(within(sheet).getByText('Question to confirm')).toBeInTheDocument()
  await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
it('keeps the original Arabic title in its own language and direction', async () => {
  mount('/parts/MIR-0007')
  const title = await screen.findByText(part.original_title_ar!)
  expect(title).toHaveAttribute('lang', 'ar')
  expect(title).toHaveAttribute('dir', 'rtl')
})
it('marks storage internal and missing photos honestly', async () => {
  mount('/parts/MIR-0007')
  expect(await screen.findByText('Rack B7, Bay 2')).toBeInTheDocument()
  expect(screen.getByText('Internal, never shown to buyers')).toBeInTheDocument()
  const image = screen.getByAltText('Recorded photo for MIR-0007: mir-0007-01.jpg')
  fireEvent.error(image)
  const missingTile = screen.getByRole('img', { name: 'Missing recorded photo: mir-0007-01.jpg' })
  expect(within(missingTile).getByText('File not in demo pack')).toBeInTheDocument()
  expect(within(missingTile).getByText('mir-0007-01.jpg')).toBeInTheDocument()
})
it('returns to the same lane and stored scroll position', async () => {
  mount('/?status=information_missing')
  const link = await screen.findByRole('link', { name: 'Review MIR-0007' })
  const scroll = document.querySelector('[data-scroll-container]')!
  Object.defineProperty(scroll, 'scrollTop', { value: 210, writable: true })
  fireEvent.scroll(scroll)
  await userEvent.click(link)
  await screen.findByRole('button', { name: 'Source for donor year: spreadsheet row 9' })
  await userEvent.click(screen.getByRole('link', { name: 'Back to Readiness queue' }))
  expect(screen.getByTestId('url')).toHaveTextContent('/?status=information_missing')
  expect(document.querySelector('[data-scroll-container]')?.scrollTop).toBe(210)
})
it('provides a way back from an unknown page', async () => {
  mount('/not-a-page')
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'Back to Readiness queue' }))
  expect(await screen.findByRole('tab', { name: 'Ready 3' })).toBeInTheDocument()
})
