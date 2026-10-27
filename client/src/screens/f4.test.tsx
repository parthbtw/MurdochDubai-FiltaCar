import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import App from '@/App'
import { editorFor, fieldPatch, validateField } from '@/domain/fields'
import { exportColumns, intakeColumns } from '@/domain/exchange'
import { historyValue } from '@/domain/workspace'
import {
  aiStatusNow, approvedPart, exportOneCsv, exportPreview, exportPreviewOne, metricsAfter, part0004,
  partsResponse, putNumber, uploadBadType, uploadBlurry, uploadInventory, uploadNewPart, uploadUnknownItem,
} from '@/test/fixtures'

const fetchMock = vi.fn()
let postBody: unknown, postStatus: number, previewBody: unknown, metricsBody: unknown
beforeEach(() => {
  postBody = uploadNewPart; postStatus = 200; previewBody = exportPreview; metricsBody = metricsAfter
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:selection'), revokeObjectURL: vi.fn() }))
  fetchMock.mockReset().mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (init.method === 'POST' || init.method === 'PUT') return new Response(JSON.stringify(postBody), { status: postStatus })
    const body = url === '/api/parts' ? partsResponse : url === '/api/metrics' ? metricsBody : url === '/api/export/preview' ? previewBody : url === '/api/ai/status' ? aiStatusNow : url === '/api/parts/MIR-0004' ? part0004 : approvedPart
    return new Response(JSON.stringify(body))
  })
})
function Url() { const location = useLocation(); return <output data-testid="f4-url">{location.pathname}{location.search}</output> }
function mount(url = '/add') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /><Url /></MemoryRouter></QueryClientProvider>)
  return { client, ...view }
}
function mutations() { return fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST' || init?.method === 'PUT') }
const photo = () => new File(['photo bytes'], 'clear_label.png', { type: 'image/png' })
const sheet = () => new File(['sku,make\nMIR-0021,Nissan'], 'inventory.csv', { type: 'text/csv' })
const uploadButton = () => screen.getByRole('button', { name: 'Upload' })

it('parses every supplied response fixture and treats the CSV as text', () => {
  for (const fixture of [uploadBlurry, uploadNewPart, uploadInventory]) {
    expect(Array.isArray(fixture.created)).toBe(true)
    expect(Array.isArray(fixture.updated)).toBe(true)
    expect(Array.isArray(fixture.warnings)).toBe(true)
    for (const record of fixture.parts) expect(record.item_id).toMatch(/^MIR-/)
  }
  expect(uploadBadType.error).toBe('photo "package.json" must be a jpg, png or webp image')
  expect(exportPreviewOne.included).toEqual(['MIR-0001'])
  expect(metricsAfter.parts_total).toBe(14)
  expect(exportOneCsv.replace(/^\uFEFF/, '').split(/\r?\n/)[0]).toBe(exportColumns.join(','))
  expect(exportOneCsv).toContain('MOCK, NOT PUBLISHED')
})
it('renders exactly four main tabs with icons and marks the active destination', async () => {
  mount('/impact')
  const nav = screen.getByRole('navigation', { name: 'Main tabs' })
  const links = within(nav).getAllByRole('link')
  expect(links.map(link => link.textContent)).toEqual(['Queue', 'Add', 'Export', 'Impact'])
  expect(links.map(link => link.getAttribute('href'))).toEqual(['/', '/add', '/export', '/impact'])
  expect(links.filter(link => link.getAttribute('aria-current') === 'page')).toEqual([links[3]])
  links.forEach(link => expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true'))
  await screen.findByText('5 claims blocked and 7 conflicts caught across 14 parts.')
})
it('retains the queue lane, scroll and nested part position when switching tabs', async () => {
  mount('/?status=information_missing')
  const link = await screen.findByRole('link', { name: 'Review MIR-0004' })
  const scroll = document.querySelector('[data-scroll-container]')!
  Object.defineProperty(scroll, 'scrollTop', { value: 230, writable: true }); fireEvent.scroll(scroll)
  const nav = screen.getByRole('navigation', { name: 'Main tabs' })
  await userEvent.click(within(nav).getByRole('link', { name: 'Impact' }))
  await userEvent.click(within(nav).getByRole('link', { name: 'Queue' }))
  expect(screen.getByTestId('f4-url')).toHaveTextContent('/?status=information_missing')
  expect(document.querySelector('[data-scroll-container]')?.scrollTop).toBe(230)
  await userEvent.click(await screen.findByRole('link', { name: link.getAttribute('aria-label')! }))
  await screen.findByRole('button', { name: 'Edit part number' })
  await userEvent.click(within(nav).getByRole('link', { name: 'Add' }))
  await userEvent.click(within(nav).getByRole('link', { name: 'Queue' }))
  expect(screen.getByTestId('f4-url')).toHaveTextContent('/parts/MIR-0004')
  expect(within(nav).getByRole('link', { name: 'Queue' })).toHaveAttribute('aria-current', 'page')
  await userEvent.click(screen.getByRole('link', { name: 'Back to Readiness queue' }))
  expect(screen.getByTestId('f4-url')).toHaveTextContent('/?status=information_missing')
  expect(document.querySelector('[data-scroll-container]')?.scrollTop).toBe(230)
})
it('renders the approval bar before the main tab bar and reserves scroll space', async () => {
  mount('/parts/MIR-0001')
  const bar = await screen.findByRole('region', { name: 'Listing approval' })
  const nav = screen.getByRole('navigation', { name: 'Main tabs' })
  expect(bar.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(bar).toHaveClass('approval-sticky')
  expect(bar.previousElementSibling).toHaveClass('approval-space')
  expect(bar.previousElementSibling).toHaveStyle({ blockSize: '100px' })
})
it('uses structured shared readers, a sans label title and no JSON dump', async () => {
  mount('/parts/MIR-0004/label')
  const readers = await screen.findByRole('region', { name: 'Label readers' })
  expect(within(readers).getByText('Offline reader (Tesseract)')).toBeInTheDocument()
  expect(within(readers).getByText('Confidence')).toBeInTheDocument()
  expect(readers.querySelector('pre')).toBeNull()
  expect(readers.textContent).not.toMatch(/"(?:ocr|ai_reads|quality)"\s*:/)
  expect(screen.getByRole('heading', { name: 'Check label', level: 1 })).not.toHaveClass('font-mono')
})
it('normalizes spaces, underscores and repeats before validation and saving on the label screen', async () => {
  postBody = putNumber
  mount('/parts/MIR-0004/label')
  await userEvent.type(await screen.findByRole('textbox', { name: 'Part number from the photo' }), 'sbm 7944__pj14')
  await userEvent.click(screen.getByRole('button', { name: 'Use this number' }))
  await waitFor(() => expect(mutations()).toHaveLength(1))
  expect(JSON.parse(mutations()[0][1].body)).toEqual({ part_details: { part_number: { extracted_value: 'SBM-7944-PJ14' } } })
  const field = editorFor('part_details.part_number')!
  expect(validateField(field, 'sbm 7944 pj14')).toBeNull()
  expect(fieldPatch(field, 'sbm _7944--pj14')).toEqual({ part_details: { part_number: { extracted_value: 'SBM-7944-PJ14' } } })
  expect(validateField(field, 'sbm ?7944 pj14')).toBeTruthy()
})
it('shows only Approve and Cancel as confirmation actions and keeps Edit on the fact row', async () => {
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, init) => url === '/api/parts/MIR-0001' ? Promise.resolve(new Response(JSON.stringify(partsResponse.parts[0]))) : base(url, init))
  mount('/parts/MIR-0001')
  const bar = await screen.findByRole('region', { name: 'Listing approval' })
  await userEvent.click(within(bar).getByRole('button', { name: 'Approve listing' }))
  const dialog = screen.getByRole('dialog', { name: 'Approve this listing draft?' })
  expect(within(dialog).getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  const edit = screen.getByRole('button', { name: 'Edit donor year' })
  expect(edit.parentElement).toHaveClass('fact-cell')
  expect(edit).toHaveClass('row-start-1', 'min-h-11')
})
it('formats nested saved history as plain words rather than JSON', () => {
  expect(historyValue(approvedPart.seller_approval)).toContain('Approved: true')
  expect(historyValue(approvedPart.seller_approval)).not.toContain('{')
})
it.each([
  ['type', () => new File(['bad'], 'document.pdf', { type: 'application/pdf' }), /choose a JPEG, PNG or WebP image/],
  ['size', () => new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), /exceeds the 8 MB photo limit/],
] as const)('rejects photo %s before upload', async (_name, makeFile, message) => {
  mount()
  const input = screen.getByLabelText('Choose photos')
  fireEvent.change(input, { target: { files: [makeFile()] } })
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(uploadButton()).toBeDisabled()
  expect(mutations()).toHaveLength(0)
})
it('rejects more than six photos, then allows a corrected selection and releases thumbnails', async () => {
  const { unmount } = mount()
  fireEvent.change(screen.getByLabelText('Choose photos'), { target: { files: Array.from({ length: 7 }, photo) } })
  expect(screen.getByRole('alert')).toHaveTextContent('Choose up to 6 photos')
  expect(uploadButton()).toBeDisabled()
  await userEvent.upload(screen.getByLabelText('Choose photos'), photo())
  expect(await screen.findByAltText('Selected photo: clear_label.png')).toBeInTheDocument()
  expect(screen.getByText('11 bytes')).toBeInTheDocument()
  expect(uploadButton()).toBeEnabled()
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:selection')
})
it.each([
  [() => new File(['x'], 'inventory.xlsx', { type: 'application/octet-stream' }), 'Choose a CSV file.'],
  [() => new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.csv', { type: 'text/csv' }), 'The CSV exceeds the 2 MB spreadsheet limit.'],
] as const)('rejects invalid spreadsheets before upload', async (makeFile, message) => {
  mount()
  fireEvent.change(screen.getByLabelText('Choose CSV'), { target: { files: [makeFile()] } })
  expect(screen.getByRole('alert')).toHaveTextContent(message)
  expect(uploadButton()).toBeDisabled()
  expect(mutations()).toHaveLength(0)
})
it('lists all contract input columns and sends photos, sheet and item_id in one FormData request', async () => {
  postBody = uploadBlurry
  const { client } = mount()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const input = screen.getByLabelText('Choose photos')
  expect(input).toHaveAttribute('capture', 'environment')
  expect(input).toHaveAttribute('multiple')
  expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  await userEvent.selectOptions(screen.getByLabelText('Attach to'), await screen.findByRole('option', { name: 'MIR-0004' }))
  await userEvent.click(screen.getByText('Columns FiltaCar reads'))
  expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(intakeColumns)
  await userEvent.upload(input, photo())
  await userEvent.upload(screen.getByLabelText('Choose CSV'), sheet())
  await userEvent.click(uploadButton())
  await screen.findByRole('region', { name: 'Upload results' })
  expect(mutations()).toHaveLength(1)
  expect(mutations()[0][0]).toBe('/api/upload')
  const form = mutations()[0][1].body as FormData
  expect(form.getAll('photos')).toHaveLength(1)
  expect((form.get('photos') as File).name).toBe('clear_label.png')
  expect((form.get('sheet') as File).name).toBe('inventory.csv')
  expect(form.get('item_id')).toBe('MIR-0004')
  expect(mutations()[0][1].headers.get('Content-Type')).toBeNull()
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['parts'] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['part', 'MIR-0004'] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['metrics'] })
})
it('shows created links and a clear number candidate from the new-part response', async () => {
  mount()
  await userEvent.upload(screen.getByLabelText('Choose photos'), photo())
  await userEvent.click(uploadButton())
  const result = await screen.findByRole('region', { name: 'Upload results' })
  expect(within(result).getByRole('link', { name: uploadNewPart.created[0] })).toHaveAttribute('href', `/parts/${uploadNewPart.created[0]}`)
  expect(within(result).getByText(uploadNewPart.parts[0].ocr![0].part_number_candidate!)).toBeInTheDocument()
  expect(within(result).getByText('New parts start as Information missing until each fact is confirmed.')).toBeInTheDocument()
  expect((mutations()[0][1].body as FormData).has('item_id')).toBe(false)
})
it('shows updated links, warnings and a photo-specific label check for only the processed blurry photo', async () => {
  postBody = uploadBlurry
  mount()
  await screen.findByRole('option', { name: 'MIR-0004' })
  await userEvent.upload(screen.getByLabelText('Choose photos'), photo())
  await userEvent.click(uploadButton())
  const result = await screen.findByRole('region', { name: 'Upload results' })
  expect(within(result).getByRole('link', { name: 'MIR-0004' })).toHaveAttribute('href', '/parts/MIR-0004')
  expect(within(result).getByText('photo blurry, retake')).toBeInTheDocument()
  expect(within(result).getByText('Blurry, retake')).toHaveClass('tone-warning')
  expect(within(result).getByText('The label could not be read')).toBeInTheDocument()
  const read = uploadBlurry.parts[0].ocr!.at(-1)!
  expect(within(result).getByText(`Sharpness ${read.quality.sharpness}`)).toBeInTheDocument()
  expect(within(result).getAllByRole('link', { name: 'Check label' })).toHaveLength(1)
  expect(within(result).getByRole('link', { name: 'Check label' })).toHaveAttribute('href', `/parts/MIR-0004/label?${new URLSearchParams({ photo: read.photo })}`)
})
it('uploads a CSV by itself and renders every created part link', async () => {
  postBody = uploadInventory
  mount()
  await userEvent.upload(screen.getByLabelText('Choose CSV'), sheet())
  await userEvent.click(uploadButton())
  const result = await screen.findByRole('region', { name: 'Upload results' })
  for (const id of uploadInventory.created) expect(within(result).getByRole('link', { name: id })).toHaveAttribute('href', `/parts/${id}`)
  expect((mutations()[0][1].body as FormData).has('photos')).toBe(false)
})
it('keeps inputs and Upload disabled while waiting and reports indeterminate progress', async () => {
  let resolve!: (response: Response) => void
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, init) => init?.method === 'POST' ? new Promise<Response>(done => { resolve = done }) : base(url, init))
  mount()
  await userEvent.upload(screen.getByLabelText('Choose photos'), photo())
  await userEvent.click(uploadButton())
  expect(screen.getByRole('button', { name: 'Uploading...' })).toBeDisabled()
  expect(screen.getByLabelText('Choose photos')).toBeDisabled()
  expect(screen.getByLabelText('Choose CSV')).toBeDisabled()
  expect(screen.getByLabelText('Attach to')).toBeDisabled()
  expect(screen.getByRole('progressbar', { name: 'Upload in progress' })).not.toHaveAttribute('aria-valuenow')
  await act(async () => resolve(new Response(JSON.stringify(uploadNewPart))))
  await screen.findByRole('region', { name: 'Upload results' })
  expect(mutations()).toHaveLength(1)
})
it.each([[400, uploadBadType], [404, uploadUnknownItem]] as const)('shows the %s server error without replacing it', async (status, body) => {
  postStatus = status; postBody = body
  mount()
  await userEvent.upload(screen.getByLabelText('Choose photos'), photo())
  await userEvent.click(uploadButton())
  expect(await screen.findByRole('alert')).toHaveTextContent(body.error!)
  expect(screen.queryByRole('region', { name: 'Upload results' })).not.toBeInTheDocument()
  expect(uploadButton()).toBeEnabled()
})
it('keeps the mock banner visible while loading and disables a zero-included export', async () => {
  mount('/export')
  expect(screen.getByRole('note')).toHaveTextContent('MOCK, NOT PUBLISHED. Nothing is sent to eBay.')
  expect(await screen.findByText('Approve at least one part to export it.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Download mock eBay CSV' })).toBeDisabled()
  expect(screen.queryByRole('link', { name: 'Download mock eBay CSV' })).not.toBeInTheDocument()
  expect(screen.getAllByText('Not approved by the seller')).toHaveLength(exportPreview.excluded.length)
  const columns = screen.getByText('CSV columns, in order').parentElement!
  expect(within(columns).getAllByRole('listitem').map(item => item.textContent)).toEqual(exportColumns)
  expect(screen.getByText('Price: seller to set. FiltaCar never guesses a price.')).toBeInTheDocument()
})
it('enables a real CSV download and previews the returned stored draft and approval', async () => {
  previewBody = exportPreviewOne
  mount('/export')
  const download = await screen.findByRole('link', { name: 'Download mock eBay CSV' })
  expect(download).toHaveAttribute('href', '/api/export/ebay.csv')
  expect(download).toHaveAttribute('download')
  const included = screen.getByRole('region', { name: 'Included parts' })
  expect(within(included).getByRole('link', { name: /MIR-0001/ })).toHaveAttribute('href', '/parts/MIR-0001')
  expect(await within(included).findByText(approvedPart.seller_approval.approved_at!)).toBeInTheDocument()
  for (const [label, value] of [['Title', approvedPart.draft!.title.slice(0, 80)], ['Condition', 'Used'], ['Category', 'Car Mirrors'], ['Placement', approvedPart.draft!.item_specifics['Placement on Vehicle']], ['Manufacturer part number', approvedPart.draft!.item_specifics['Manufacturer Part Number']], ['Price', 'seller to set']]) {
    expect(within(included).getByText(label, { selector: 'dt' }).nextElementSibling).toHaveTextContent(value)
  }
  expect(screen.getByRole('note')).toBeInTheDocument()
})
it('keeps the export banner visible after a server error', async () => {
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, init) => url === '/api/export/preview' ? Promise.resolve(new Response(JSON.stringify(uploadBadType), { status: 400 })) : base(url, init))
  mount('/export')
  await screen.findByRole('alert')
  expect(screen.getByRole('note')).toHaveTextContent('MOCK, NOT PUBLISHED. Nothing is sent to eBay.')
  expect(screen.getByRole('button', { name: 'Download mock eBay CSV' })).toBeDisabled()
})
it('renders every Impact KPI exactly from metrics-after, keeping seller field edits distinct', async () => {
  mount('/impact')
  await screen.findByText('5 claims blocked and 7 conflicts caught across 14 parts.')
  for (const [label, value] of [['Parts', metricsAfter.parts_total], ['Approved', metricsAfter.approved], ['Facts with a source', metricsAfter.facts_with_sources], ['Open questions', metricsAfter.questions_open], ['Missing details', metricsAfter.missing_open], ['Conflicts', metricsAfter.conflicts_open], ['Claims blocked', metricsAfter.claims_blocked], ['AI declined to guess', metricsAfter.readers.ai_declined_to_guess], ['Seller field edits', metricsAfter.seller_field_edits]] as const) {
    expect(screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent).toBe(String(value))
  }
  expect(screen.getByText('Assumption for illustration, not measured: about 15 minutes by hand and 3 minutes with FiltaCar per listing.')).toBeInTheDocument()
  expect(screen.getByText('Source: assumption')).toBeInTheDocument()
  expect(screen.getByText('Median elapsed creation to approval: Not measured')).toBeInTheDocument()
})
it('renders all five reader categories including grey zeros with no minimum bar width', async () => {
  mount('/impact')
  const readers = await screen.findByRole('region', { name: 'Readers' })
  const rows = within(readers).getAllByRole('listitem')
  expect(rows).toHaveLength(5)
  const values = Object.values(metricsAfter.readers.by_agreement)
  rows.forEach((row, index) => {
    expect(row.querySelector('.reader-count')?.textContent).toBe(String(values[index]))
    if (values[index] === 0) {
      expect(row).toHaveClass('reader-zero')
      expect(row.querySelector('.reader-bar')).toHaveStyle({ inlineSize: '0%' })
    }
  })
})
it('shows the no-draft exclusion reason as plain words', async () => {
  previewBody = { ...exportPreview, excluded: [{ ...exportPreview.excluded[0], reason: 'no draft' }] }
  mount('/export')
  expect(await screen.findByText('No draft yet')).toBeInTheDocument()
})
it('keeps an empty Impact view at zero rather than substituting illustrative counts', async () => {
  // Exercise the documented empty-account response using the captured response shape.
  metricsBody = {
    ...metricsAfter, parts_total: 0, approved: 0, facts_with_sources: 0, questions_open: 0, missing_open: 0, conflicts_open: 0, claims_blocked: 0, seller_edits: 0, seller_field_edits: 0,
    readers: { ocr_reads: 0, ai_reads: 0, ai_declined_to_guess: 0, by_agreement: { agree: 0, disagree: 0, ai_only: 0, tesseract_only: 0, neither: 0 } },
  }
  mount('/impact')
  expect(await screen.findByText('0 claims blocked and 0 conflicts caught across 0 parts.')).toBeInTheDocument()
  expect(screen.getByText('No parts recorded. Counts below are the returned totals.')).toBeInTheDocument()
  for (const value of document.querySelectorAll('.impact-figures dd')) expect(value).toHaveTextContent(/^0$/)
  expect(document.querySelectorAll('.reader-zero')).toHaveLength(5)
  for (const bar of document.querySelectorAll('.reader-bar')) expect(bar).toHaveStyle({ inlineSize: '0%' })
})
it('displays a returned baseline method and date, with measured elapsed timing kept explicit', async () => {
  // Contract-branch test only; these are fixture-derived values, not a real timing run.
  metricsBody = {
    ...metricsAfter,
    baseline: { minutes_per_listing: metricsAfter.time_estimate.manual_minutes_per_listing, method: 'Fixture timing method', measured_on: approvedPart.seller_approval.approved_at!.slice(0, 10) },
    measured: { approved_with_timing: metricsAfter.approved, median_minutes_to_approval: metricsAfter.time_estimate.filtacar_minutes_per_listing },
    time_estimate: { ...metricsAfter.time_estimate, source: 'measured', basis: 'Fixture baseline average and median elapsed creation to approval' },
  }
  mount('/impact')
  expect(await screen.findByText('Source: measured')).toBeInTheDocument()
  expect(screen.getByText('Method: Fixture timing method')).toBeInTheDocument()
  expect(screen.getByText(`Measured on ${approvedPart.seller_approval.approved_at!.slice(0, 10)}`)).toBeInTheDocument()
  expect(screen.getByText('Elapsed time is not active working time.')).toBeInTheDocument()
  expect(screen.getByText('Median elapsed creation to approval: 3 minutes')).toBeInTheDocument()
  expect(screen.queryByText(/Assumption for illustration, not measured:/)).not.toBeInTheDocument()
})
