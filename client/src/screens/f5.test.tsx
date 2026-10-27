import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '@/App'
import type { PartRecord, UploadResult } from '@/api/types'
import { sellerStorageKey } from '@/domain/seller'
import { formatTime } from '@/domain/time'
import {
  aiReadPart, aiStatusNow, approvedPart, approveMissingError, compatibility, exportPreviewOne,
  metrics, part, part0001, part0004, partsResponse, putNumber, putYear,
  sellMetricsIndividual, sellPartsBusiness, sellPartsIndividual, sellPutSeller, sellUpload, uploadBlurry,
} from '@/test/fixtures'

const fetchMock = vi.fn()
let records: Map<string, PartRecord>
let uploadResponse: UploadResult
let updateResponse: PartRecord | null
let approveResponse: PartRecord
let assignmentStatus: number
beforeEach(() => {
  localStorage.clear()
  records = new Map([...partsResponse.parts, sellPutSeller].map(record => [record.item_id, record]))
  uploadResponse = sellUpload; updateResponse = null; approveResponse = approvedPart; assignmentStatus = 200
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:label'), revokeObjectURL: vi.fn() }))
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async (url: string, init: RequestInit = {}) => {
    const parsed = new URL(url, 'http://filtacar.invalid')
    const path = parsed.pathname
    let body: unknown
    if (path === '/api/upload' && init.method === 'POST') body = uploadResponse
    else if (path.endsWith('/approve') && init.method === 'POST') {
      body = approveResponse; records.set(approveResponse.item_id, approveResponse)
    } else if (init.method === 'PUT') {
      const patch = JSON.parse(String(init.body))
      if (patch.seller_id && assignmentStatus !== 200) return new Response(JSON.stringify(approveMissingError), { status: assignmentStatus })
      const id = path.split('/').at(-1)!
      body = updateResponse ?? (id === sellPutSeller.item_id && patch.seller_id === 'IND-DXB-001' ? sellPutSeller : { ...records.get(id), seller_id: patch.seller_id })
      records.set(id, body as PartRecord)
    } else if (path === '/api/parts') body = parsed.searchParams.get('seller_id') === 'IND-DXB-001' ? sellPartsIndividual : sellPartsBusiness
    else if (path === '/api/metrics') body = parsed.searchParams.get('seller_id') === 'IND-DXB-001' ? sellMetricsIndividual : metrics
    else if (path === '/api/ai/status') body = aiStatusNow
    else if (path.startsWith('/api/compatibility/')) body = compatibility
    else if (path === '/api/export/preview') body = exportPreviewOne
    else if (path.startsWith('/api/parts/')) body = records.get(path.split('/').at(-1)!)
    else throw new Error(`Unexpected fixture request: ${url}`)
    return new Response(JSON.stringify(body), { status: 200 })
  })
})
afterEach(() => localStorage.clear())
function Url() { const location = useLocation(); return <output data-testid="sell-url">{location.pathname}{location.search}</output> }
function mount(url = '/', individual = false) {
  if (individual) localStorage.setItem(sellerStorageKey, 'individual')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /><Url /></MemoryRouter></QueryClientProvider>) }
}
function mutations() { return fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST' || init?.method === 'PUT') }
const photo = () => new File(['photo'], 'clear_label.png', { type: 'image/png' })
async function chooseIndividual() {
  await userEvent.click(screen.getByRole('button', { name: 'Business: DXB-SLV-014. Who is selling?' }))
  const sheet = await screen.findByRole('dialog', { name: 'Who is selling?' })
  await userEvent.click(within(sheet).getByRole('radio', { name: /Individual: IND-DXB-001/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

it('parses all five captured sell fixtures and preserves the null upload seller until assignment', () => {
  expect(sellUpload.created).toEqual([sellPutSeller.item_id])
  expect(sellUpload.parts[0].seller_id).toBeNull()
  expect(sellPutSeller.seller_id).toBe('IND-DXB-001')
  expect(sellPartsIndividual.parts).toEqual([sellPutSeller])
  expect(sellPartsBusiness.parts).toHaveLength(10)
  expect(sellPartsBusiness.parts.every(record => record.seller_id === 'DXB-SLV-014')).toBe(true)
  expect(sellMetricsIndividual.parts_total).toBe(sellPartsIndividual.parts.length)
})
it('opens a seller sheet, persists Individual and uses seller-scoped lists, metrics and tabs', async () => {
  const first = mount('/?status=information_missing')
  await screen.findByRole('tab', { name: 'Missing 5' })
  await chooseIndividual()
  expect(localStorage.getItem(sellerStorageKey)).toBe('individual')
  expect(screen.getByTestId('sell-url')).toHaveTextContent(/^\/$/)
  const tabs = within(screen.getByRole('navigation', { name: 'Main tabs' })).getAllByRole('link')
  expect(tabs.map(link => link.textContent)).toEqual(['My parts', 'Sell a part', 'Export'])
  expect(tabs.map(link => link.getAttribute('href'))).toEqual(['/', '/sell', '/export'])
  await screen.findByText('1 part. 0 approved.')
  expect(fetchMock).toHaveBeenCalledWith('/api/parts?seller_id=IND-DXB-001', expect.anything())
  expect(fetchMock).toHaveBeenCalledWith('/api/metrics?seller_id=IND-DXB-001', expect.anything())
  expect(screen.queryByRole('tab', { name: /Missing/ })).not.toBeInTheDocument()
  first.unmount()
  mount()
  expect(screen.getByRole('button', { name: 'Individual: IND-DXB-001. Who is selling?' })).toBeInTheDocument()
  await screen.findByText('1 part. 0 approved.')
})
it('keeps mode switching usable when localStorage reads and writes throw', async () => {
  const storage = Object.getPrototypeOf(localStorage)
  vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable') })
  vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
  mount()
  await screen.findByRole('tab', { name: 'Ready 3' })
  await chooseIndividual()
  expect(await screen.findByRole('heading', { name: 'My parts', level: 1 })).toBeInTheDocument()
  await screen.findByText('1 part. 0 approved.')
})
it('resets saved tab destinations and refetches when switching back to Business', async () => {
  mount('/?status=information_missing')
  await userEvent.click(await screen.findByRole('link', { name: 'Review MIR-0004' }))
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('link', { name: 'Add' }))
  await chooseIndividual()
  expect(screen.getByTestId('sell-url')).toHaveTextContent(/^\/sell$/)
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('link', { name: 'My parts' }))
  const businessFetchesBeforeReturn = fetchMock.mock.calls.filter(([url]) => url === '/api/parts?seller_id=DXB-SLV-014').length
  await userEvent.click(screen.getByRole('button', { name: 'Individual: IND-DXB-001. Who is selling?' }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: /Business: DXB-SLV-014/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByTestId('sell-url')).toHaveTextContent(/^\/$/)
  expect(await screen.findByRole('tab', { name: 'Ready 3' })).toHaveAttribute('aria-selected', 'true')
  const tabs = within(screen.getByRole('navigation', { name: 'Main tabs' }))
  expect(tabs.getByRole('link', { name: 'Queue' })).toHaveAttribute('href', '/')
  expect(tabs.getByRole('link', { name: 'Add' })).toHaveAttribute('href', '/add')
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === '/api/parts?seller_id=DXB-SLV-014')).toHaveLength(businessFetchesBeforeReturn + 1))
})
it('shows a simple Individual list with the returned photo, title fallback and next action', async () => {
  mount('/', true)
  const title = await screen.findByText(sellPutSeller.draft!.title)
  expect(title.closest('a')).toHaveAttribute('href', `/sell/${sellPutSeller.item_id}/questions`)
  expect(screen.getByText(sellPutSeller.actions_required[0].action_en)).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /Recorded photo for MIR-0011/ })).toBeInTheDocument()
  expect(screen.getByText('Information missing')).toBeInTheDocument()
})
it('offers Sell a part for an empty Individual account', async () => {
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, init) => url === '/api/parts?seller_id=IND-DXB-001' ? Promise.resolve(new Response(JSON.stringify({ parts: [] }))) : base(url, init))
  mount('/', true)
  expect(await screen.findByText('No parts yet. Sell your first part.')).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Sell a part' }).every(link => link.getAttribute('href') === '/sell')).toBe(true)
})
it('offers accessible camera, library and CSV buttons and enables Upload only after selection', async () => {
  mount('/add')
  expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Choose from library' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Choose CSV' })).toBeInTheDocument()
  expect(screen.getByLabelText('Choose photos')).toHaveClass('sr-only')
  expect(screen.getByLabelText('Choose photos')).toHaveAttribute('capture', 'environment')
  expect(screen.getByLabelText('Choose from library file')).not.toHaveAttribute('capture')
  expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  const click = vi.spyOn(screen.getByLabelText('Choose photos'), 'click')
  await userEvent.click(screen.getByRole('button', { name: 'Take photo' }))
  expect(click).toHaveBeenCalledOnce()
  await userEvent.upload(screen.getByLabelText('Choose from library file'), photo())
  expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
})
it('assigns an Individual upload before showing Add results', async () => {
  let finish!: (response: Response) => void
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, init) => init?.method === 'PUT' ? new Promise<Response>(resolve => { finish = resolve }) : base(url, init))
  mount('/add', true)
  await userEvent.upload(screen.getByLabelText('Choose photos'), photo())
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }))
  await waitFor(() => expect(mutations()).toHaveLength(2))
  expect(mutations()[1][0]).toBe(`/api/parts/${sellPutSeller.item_id}`)
  expect(JSON.parse(mutations()[1][1].body)).toEqual({ seller_id: 'IND-DXB-001' })
  expect(screen.queryByRole('region', { name: 'Upload results' })).not.toBeInTheDocument()
  await act(async () => finish(new Response(JSON.stringify(sellPutSeller))))
  const result = await screen.findByRole('region', { name: 'Upload results' })
  expect(within(result).getByRole('link', { name: sellPutSeller.item_id })).toBeInTheDocument()
})
it('reports a failed seller assignment without showing completed upload results', async () => {
  assignmentStatus = 400
  mount('/add', true)
  await userEvent.upload(screen.getByLabelText('Choose photos'), photo())
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(approveMissingError.error!)
  expect(screen.queryByRole('region', { name: 'Upload results' })).not.toBeInTheDocument()
})
it('uploads the Photo step without item_id, assigns its seller, then routes to Label', async () => {
  mount('/sell', true)
  expect(screen.getByRole('heading', { name: 'Take a photo of the label' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  await userEvent.upload(screen.getByLabelText('Take photo file'), photo())
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }))
  await screen.findByRole('link', { name: 'This matches my label' })
  expect(screen.getByTestId('sell-url')).toHaveTextContent(`/sell/${sellPutSeller.item_id}/label`)
  expect(mutations().map(([url]) => url)).toEqual(['/api/upload', `/api/parts/${sellPutSeller.item_id}`])
  expect((mutations()[0][1].body as FormData).has('item_id')).toBe(false)
  expect(JSON.parse(mutations()[1][1].body)).toEqual({ seller_id: 'IND-DXB-001' })
  expect(screen.getByText(sellPutSeller.part_details.part_number.extracted_value!)).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
})
it('resumes a clear Label step from its URL and shows the number with its recorded source', async () => {
  mount(`/sell/${sellPutSeller.item_id}/label`, true)
  expect(await screen.findByText(sellPutSeller.part_details.part_number.extracted_value!)).toBeInTheDocument()
  expect(screen.getByText(`Source: ${sellPutSeller.field_sources['part_details.part_number.extracted_value']}`)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'This matches my label' }))
  expect(screen.getByTestId('sell-url')).toHaveTextContent(`/sell/${sellPutSeller.item_id}/questions`)
})
it('warns about a blurry photo and supports Continue anyway, manual entry and skipping', async () => {
  records.set(part0004.item_id, uploadBlurry.parts[0])
  mount('/sell/MIR-0004/label', true)
  expect(await screen.findByText('This photo is blurry. Retake it for a better reading.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Retake' })).toHaveAttribute('href', '/sell/MIR-0004/photo')
  await userEvent.click(screen.getByRole('button', { name: 'Continue anyway' }))
  expect(await screen.findByRole('textbox', { name: 'Part number from the photo' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Ask CodeBuddy AI' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Skip for now' })).toHaveAttribute('href', '/sell/MIR-0004/questions')
  updateResponse = putNumber
  await userEvent.type(screen.getByRole('textbox', { name: 'Part number from the photo' }), 'sbm 7944 pj14')
  await userEvent.click(screen.getByRole('button', { name: 'Use this number' }))
  expect(await screen.findByRole('link', { name: 'This matches my label' })).toBeInTheDocument()
  expect(JSON.parse(mutations()[0][1].body)).toEqual({ part_details: { part_number: { extracted_value: 'SBM-7944-PJ14' } } })
})
it('lets a seller fix a clear reading with the shared manual editor', async () => {
  mount('/sell/MIR-0001/label', true)
  await userEvent.click(await screen.findByRole('button', { name: 'Fix it' }))
  expect(await screen.findByRole('textbox', { name: 'Part number from the photo' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/sell/MIR-0001/questions')
})
it('shows Use this value for a saved ai_only reading', async () => {
  records.set(aiReadPart.item_id, { ...aiReadPart, ai_reads: [...aiReadPart.ai_reads!, { ...part0001.ai_reads![0], photo: aiReadPart.photos[1], read_at: approvedPart.seller_approval.approved_at!, agreement: 'ai_only' }] })
  mount(`/sell/${aiReadPart.item_id}/label`, true)
  expect(await screen.findByRole('button', { name: 'Use this value' })).toBeInTheDocument()
})
it('shows one bilingual blocking question at a time and advances using the saved response and ripple', async () => {
  updateResponse = { ...sellPutSeller, donor_vehicle: { ...sellPutSeller.donor_vehicle, year: putYear.donor_vehicle.year }, actions_required: sellPutSeller.actions_required.slice(1) }
  mount(`/sell/${sellPutSeller.item_id}/questions`, true)
  const question = await screen.findByRole('region', { name: 'Required question' })
  expect(within(question).getByText(sellPutSeller.actions_required[0].action_en)).toBeInTheDocument()
  expect(within(question).getByText(sellPutSeller.actions_required[0].action_ar)).toHaveAttribute('lang', 'ar')
  expect(within(question).getByText(sellPutSeller.actions_required[0].action_ar)).toHaveAttribute('dir', 'rtl')
  expect(screen.queryByText(sellPutSeller.actions_required[1].action_en)).not.toBeInTheDocument()
  await userEvent.type(within(question).getByRole('textbox', { name: 'Donor year' }), String(putYear.donor_vehicle.year))
  await userEvent.click(within(question).getByRole('button', { name: 'Save' }))
  await screen.findByRole('combobox', { name: 'Placement' })
  expect(screen.getByRole('status', { name: 'Saved change' })).toHaveTextContent('Donor year saved. 1 required question resolved.')
  expect(screen.queryByText(sellPutSeller.actions_required[0].action_en)).not.toBeInTheDocument()
  expect(screen.getByText(sellPutSeller.actions_required[1].action_en)).toBeInTheDocument()
  expect(JSON.parse(mutations()[0][1].body)).toEqual({ donor_vehicle: { year: putYear.donor_vehicle.year } })
})
it('finishes required questions, then lists the returned non-blocking notes as Good to know', async () => {
  updateResponse = putYear
  mount('/sell/MIR-0007/questions', true)
  const year = await screen.findByRole('textbox', { name: 'Donor year' })
  await userEvent.clear(year); await userEvent.type(year, '2016')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('All required details are confirmed.')).toBeInTheDocument()
  const notes = screen.getByRole('region', { name: 'Good to know' })
  expect(within(notes).getAllByRole('listitem')).toHaveLength(putYear.actions_required.length)
  expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/sell/MIR-0007/draft')
})
it('resumes Draft from the URL with the stored wording, claim guard and evidence link', async () => {
  mount('/sell/MIR-0007/draft', true)
  expect(await screen.findByText((_text, element) => element?.tagName === 'P' && element.textContent === part.draft!.title)).toBeInTheDocument()
  expect(screen.getByText('We removed these words because they cannot be claimed')).toBeInTheDocument()
  expect(screen.getByText('We do not say which cars it fits. Buyers must match the part number.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'See where each fact came from' })).toHaveAttribute('href', '/parts/MIR-0007/evidence')
  expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/sell/MIR-0007/approve')
})
it('lists approval blockers with links back to Questions and disables approval', async () => {
  mount(`/sell/${sellPutSeller.item_id}/approve`, true)
  const section = await screen.findByRole('region', { name: 'Approval confirmation' })
  expect(within(section).getByText('What is left to confirm')).toBeInTheDocument()
  expect(within(section).getAllByRole('link', { name: 'Back to Questions' })).toHaveLength(sellPutSeller.gaps_and_conflicts.filter(gap => gap.type !== 'cannot_claim').length)
  expect(within(section).getByRole('button', { name: 'Approve' })).toBeDisabled()
  expect(mutations()).toHaveLength(0)
})
it('approves inline, shows the returned success and preserves it after a refresh', async () => {
  const first = mount('/sell/MIR-0001/approve', true)
  await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
  expect(await screen.findByText('Approved. It is ready for the mock export. Nothing is published.')).toBeInTheDocument()
  expect(mutations()[0][0]).toBe('/api/parts/MIR-0001/approve')
  expect(mutations()[0][1].method).toBe('POST')
  const approved = screen.getByRole('region', { name: 'Approved' })
  expect(within(approved).getByRole('link', { name: 'Export' })).toHaveAttribute('href', '/export')
  expect(within(approved).getByRole('link', { name: 'My parts' })).toHaveAttribute('href', '/')
  first.unmount()
  mount('/sell/MIR-0001/approve')
  expect(await screen.findByText('Approved. It is ready for the mock export. Nothing is published.')).toBeInTheDocument()
})
it('filters Individual export Included and Excluded to the scoped parts and explains the global mock file', async () => {
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, init) => url === '/api/export/preview' ? Promise.resolve(new Response(JSON.stringify({ ...exportPreviewOne, excluded: [{ item_id: sellPutSeller.item_id, reason: 'not approved by seller' }, { item_id: part0004.item_id, reason: 'not approved by seller' }] }))) : base(url, init))
  mount('/export', true)
  expect(await screen.findByText(sellPutSeller.item_id)).toBeInTheDocument()
  expect(screen.queryByText(part0004.item_id)).not.toBeInTheDocument()
  expect(screen.queryByText(part0001.item_id)).not.toBeInTheDocument()
  expect(screen.getByText('No parts included.')).toBeInTheDocument()
  expect(screen.getByText('The mock file contains every approved part on this device.')).toBeInTheDocument()
})
it.each(['/export', '/parts/MIR-0001/evidence', '/parts/MIR-0001'])('renders formatted timestamps throughout %s', async url => {
  records.set(approvedPart.item_id, approvedPart)
  mount(url)
  if (url === '/export') await screen.findByText(formatTime(approvedPart.seller_approval.approved_at))
  else if (url.endsWith('/evidence')) await screen.findByRole('article')
  else {
    const history = await screen.findByRole('region', { name: 'Approval and history' })
    fireEvent.click(history.querySelector('summary')!)
    await screen.findByText(formatTime(approvedPart.history.at(-1)!.at))
  }
  expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  expect(document.body.textContent).toContain(formatTime(approvedPart.seller_approval.approved_at))
})

it('keeps a manual label correction in the URL so refreshing resumes it', async () => {
  const first = mount('/sell/MIR-0001/label', true)
  await userEvent.click(await screen.findByRole('button', { name: 'Fix it' }))
  expect(screen.getByTestId('sell-url')).toHaveTextContent('/sell/MIR-0001/label?edit=number')
  first.unmount()
  mount('/sell/MIR-0001/label?edit=number')
  expect(await screen.findByRole('textbox', { name: 'Part number from the photo' })).toBeInTheDocument()
})
it('shows server approval blockers and a Questions link when approval becomes blocked', async () => {
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, init) => url.endsWith('/approve') && init?.method === 'POST' ? Promise.resolve(new Response(JSON.stringify(approveMissingError), { status: 409 })) : base(url, init))
  mount('/sell/MIR-0001/approve', true)
  await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(approveMissingError.error!)
  expect(screen.getByRole('link', { name: 'Back to Questions' })).toHaveAttribute('href', '/sell/MIR-0001/questions')
  expect(screen.queryByRole('region', { name: 'Approved' })).not.toBeInTheDocument()
})
it('moves through missing package measurements without showing another blocking question', async () => {
  const dimensions = sellPutSeller.actions_required.find(action => action.field === 'packaged_dimensions_cm')!
  records.set(sellPutSeller.item_id, { ...sellPutSeller, actions_required: [dimensions] })
  const after = { ...sellPutSeller, actions_required: [dimensions], packaged_dimensions_cm: { ...sellPutSeller.packaged_dimensions_cm!, length: part0001.packaged_dimensions_cm!.length } }
  updateResponse = after
  mount(`/sell/${sellPutSeller.item_id}/questions`, true)
  const length = await screen.findByRole('textbox', { name: 'Package length, cm' })
  await userEvent.type(length, String(after.packaged_dimensions_cm.length))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('textbox', { name: 'Package width, cm' })).toBeInTheDocument()
  expect(screen.getAllByRole('region', { name: 'Required question' })).toHaveLength(1)
  expect(JSON.parse(mutations()[0][1].body)).toEqual({ packaged_dimensions_cm: { length: after.packaged_dimensions_cm.length } })
})
