import type { ReactNode } from 'react'
import { formatGap } from '@/domain/gaps'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import App from '@/App'
import type { PartRecord } from '@/api/types'
import { FactEditor } from '@/components/FactEditor'
import { ApprovalAction } from '@/components/ApprovalAction'
import { RippleBanner } from '@/components/RippleBanner'
import { editorFor } from '@/domain/fields'
import { compareRecords } from '@/domain/ripple'
import { part, part0001, part0004, part0005, part0009, putYear, putNumber, approvedPart, afterApprovalEdit, aiReadPart, aiStatusNow, approveMissingError, approveSpecialistError, compatibility, metrics, partsResponse } from '@/test/fixtures'

const fetchMock = vi.fn()
let current: PartRecord
let response: unknown
let responseStatus: number
beforeEach(() => {
  current = part; response = putYear; responseStatus = 200
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (init.method === 'PUT' || init.method === 'POST') return new Response(JSON.stringify(response), { status: responseStatus })
    if (url === '/api/ai/status') return new Response(JSON.stringify(aiStatusNow))
    if (url === '/api/parts?seller_id=DXB-SLV-014') return new Response(JSON.stringify(partsResponse))
    if (url === '/api/metrics?seller_id=DXB-SLV-014') return new Response(JSON.stringify(metrics))
    if (url.startsWith('/api/compatibility/')) return new Response(JSON.stringify(compatibility))
    return new Response(JSON.stringify(current))
  })
})
function mount(children: ReactNode = <App />, url = '/parts/MIR-0007') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter></QueryClientProvider>) }
}
function mutationCalls() { return fetchMock.mock.calls.filter(([, init]) => init.method === 'PUT' || init.method === 'POST') }
async function editYear(value: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit donor year' }))
  const input = await screen.findByRole('textbox', { name: 'Donor year' })
  await userEvent.clear(input); await userEvent.type(input, value)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
}
async function openApproval(container: HTMLElement = document.body) {
  await userEvent.click(await within(container).findByRole('button', { name: 'Approve listing' }))
  return screen.findByRole('dialog', { name: 'Approve this listing draft?' })
}
it('shows one first blocker in Next step and remaining actions only in Needs your answer', async () => {
  mount()
  const next = await screen.findByRole('region', { name: 'Next step' })
  expect(within(next).getByText(part.actions_required[0].action_en)).toBeInTheDocument()
  const rest = screen.getByRole('region', { name: 'Needs your answer' })
  expect(within(rest).queryByText(part.actions_required[0].action_en)).not.toBeInTheDocument()
  await userEvent.click(within(next).getByRole('button', { name: 'Answer this question' }))
  expect(await screen.findByRole('textbox', { name: 'Donor year' })).toHaveValue('2018')
})
it('opens the editor for a remaining blocking question', async () => {
  current = part0005
  mount(<App />, '/parts/MIR-0005')
  const rest = await screen.findByRole('region', { name: 'Needs your answer' })
  await userEvent.click(within(rest).getByRole('button', { name: /the part has not been tested/ }))
  expect(await screen.findByRole('textbox', { name: 'Testing status' })).toHaveValue('Untested')
})
it('validates before sending and describes the accepted format', async () => {
  mount()
  await editYear('1949')
  expect(await screen.findByRole('alert')).toHaveTextContent(/four-digit year from 1950/)
  expect(screen.getByRole('textbox', { name: 'Donor year' })).toHaveAccessibleDescription(/four-digit year/)
  expect(mutationCalls()).toHaveLength(0)
})
it('sends the smallest nested patch, updates cache, invalidates summaries and shows ripple', async () => {
  const { client } = mount()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  await editYear('2015')
  const ripple = await screen.findByRole('region', { name: 'What changed' })
  expect(ripple).toHaveTextContent('Information missing to Ready for review')
  expect(ripple).toHaveTextContent('Gap resolved: Donor year: Spreadsheet row 9 says 2018, Arabic yard note says 2015.')
  expect(JSON.parse(mutationCalls()[0][1].body)).toEqual({ donor_vehicle: { year: 2015 } })
  expect(client.getQueryData(['part', 'MIR-0007'])).toEqual(putYear)
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['parts'] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['metrics'] })
  expect(document.getElementById('fact-donor_vehicle.year')).toHaveClass('fact-changed')
  expect(ripple.querySelector('del')).toBeInTheDocument()
  expect(ripple.querySelector('mark')).toBeInTheDocument()
})
it('keeps a 400 server error in the editor without a ripple', async () => {
  responseStatus = 400; response = { error: 'year rejected by server' }
  mount(); await editYear('2015')
  expect(await screen.findByRole('alert')).toHaveTextContent('year rejected by server')
  expect(screen.getByRole('dialog', { name: 'Edit donor year' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'What changed' })).not.toBeInTheDocument()
})
it('disables Save and reports progress during the request', async () => {
  let resolve!: (value: Response) => void
  const pending = new Promise<Response>(done => { resolve = done })
  mount(<FactEditor record={part} field={editorFor('donor_vehicle.year')!} onClose={vi.fn()} onSaved={vi.fn()} />)
  fetchMock.mockImplementation(() => pending)
  await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  expect(screen.getByRole('progressbar', { name: 'Saving change' })).toBeInTheDocument()
  resolve(new Response(JSON.stringify(putYear)))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving...' })).not.toBeInTheDocument())
})
it('warns when editing an approved record and reports withdrawal after saving', async () => {
  current = approvedPart; response = afterApprovalEdit
  mount(<App />, '/parts/MIR-0001')
  await userEvent.click(await screen.findByRole('button', { name: 'Edit storage location' }))
  expect(await screen.findByText('Saving withdraws your approval.')).toBeInTheDocument()
  const input = screen.getByRole('textbox', { name: 'Storage location' })
  await userEvent.clear(input); await userEvent.type(input, afterApprovalEdit.storage_location!)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('region', { name: 'What changed' })).toHaveTextContent('Approval withdrawn because the record changed. Approve again when ready.')
})
it.each([part0005, part0009])('disables approval for $item_id with human reasons', record => {
  mount(<ApprovalAction record={record} />)
  expect(screen.getByRole('button', { name: 'Approve listing' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Approve listing' })).toHaveAccessibleDescription(/Cannot approve yet/)
  if (record === part0009) expect(screen.getByText('Specialist review required.')).toBeInTheDocument()
  else expect(screen.getByText('Part number: OCR Unclear, seller to type value.')).toBeInTheDocument()
})
it('confirms and cancels approval without a request', async () => {
  mount(<ApprovalAction record={part0001} />)
  const dialog = await openApproval()
  expect(dialog).toHaveTextContent('You confirm the facts and the wording. FiltaCar does not publish anything.')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(mutationCalls()).toHaveLength(0)
})
it.each([approveMissingError, approveSpecialistError])('shows the captured 409 error and any returned gaps', async error => {
  response = error; responseStatus = 409
  mount(<ApprovalAction record={part0001} />)
  const dialog = await openApproval()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(error.error!)
  for (const gap of error.gaps_and_conflicts ?? []) expect(screen.getByRole('alert')).toHaveTextContent(formatGap(gap))
})
it('approves a record with cannot-claim notes and shows the locked state and new history', async () => {
  current = part0001; response = approvedPart
  mount(<App />, '/parts/MIR-0001')
  const dialog = await openApproval(await screen.findByRole('region', { name: 'Listing approval' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getAllByText(/Approved by the seller on/).length).toBeGreaterThan(0)
  expect(mutationCalls()[0][0]).toBe('/api/parts/MIR-0001/approve')
  const section = screen.getByRole('region', { name: 'Approval and history' })
  await userEvent.click(section.querySelector('summary')!)
  expect(within(section).getAllByRole('listitem')[0]).toHaveTextContent('Seller changed seller approval.')
  expect(section.querySelector('svg')).toBeInTheDocument()
})
it('shows the recorded withdrawal in the history timeline in plain words', async () => {
  current = afterApprovalEdit
  mount(<App />, '/parts/MIR-0001')
  const section = await screen.findByRole('region', { name: 'Approval and history' })
  await userEvent.click(section.querySelector('summary')!)
  expect(within(section).getByText('Approval withdrawn because the record changed.')).toBeInTheDocument()
})
it('renders checklist transitions from returned statuses', () => {
  const before = structuredClone(approvedPart), after = structuredClone(afterApprovalEdit)
  before.corridor!.checklist.items[0].status = 'unknown'; after.corridor!.checklist.items[0].status = 'pass'
  mount(<RippleBanner ripple={compareRecords(before, after)} onClose={vi.fn()} />)
  expect(screen.getByRole('region', { name: 'What changed' })).toHaveTextContent('unknown to pass')
})

it('opens the label route from the missing-number fact and selects the newest recorded reading', async () => {
  current = part0004
  mount(<App />, '/parts/MIR-0004')
  const fact = await screen.findByRole('button', { name: /Source for part number:/ })
  await userEvent.click(within(fact.parentElement!).getByRole('link', { name: 'Check label' }))
  expect(await screen.findByAltText('Label photo: MIR-0004.png')).toHaveAttribute('src', '/demo/labels/MIR-0004.png')
})
it('zooms in and out, supports keyboard pan and reset', async () => {
  current = part0005
  mount(<App />, '/parts/MIR-0005/label')
  const image = await screen.findByAltText('Label photo: MIR-0005.png')
  expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
  expect(image).toHaveStyle({ transform: 'translate(0px, 0px) scale(1.5)' })
  fireEvent.keyDown(screen.getByRole('region', { name: /Label photo. Use arrow keys/ }), { key: 'ArrowRight' })
  expect(image).toHaveStyle({ transform: 'translate(-24px, 0px) scale(1.5)' })
  await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
  expect(image).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' })
  await userEvent.click(screen.getByRole('button', { name: 'Zoom in' })); await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
  expect(screen.getByLabelText('Photo zoom')).toHaveTextContent('100%')
})
it('uses the requested photo only when it is in the returned record', async () => {
  current = part0005
  mount(<App />, `/parts/MIR-0005/label?photo=${encodeURIComponent(part0005.photos[0])}`)
  expect(await screen.findByAltText('Label photo: mir-0005-01.jpg')).toHaveAttribute('src', '/uploads/mir-0005-01.jpg')
  expect(screen.getByRole('button', { name: 'Ask CodeBuddy AI' })).toBeEnabled()
})
it('asks for a live reading and shows the saved result without inventing a number', async () => {
  current = part0005; response = aiReadPart
  const { client } = mount(<App />, '/parts/MIR-0005/label')
  await userEvent.click(await screen.findByRole('button', { name: 'Ask CodeBuddy AI' }))
  expect(await screen.findByText('Mode: live')).toBeInTheDocument()
  expect(screen.getByText('Declined to guess')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Use this value' })).not.toBeInTheDocument()
  expect(JSON.parse(mutationCalls()[0][1].body)).toEqual({ photo: '/demo/labels/MIR-0005.png' })
  expect(client.getQueryData(['part', 'MIR-0005'])).toEqual(aiReadPart)
})
it('reports the running-reader 429 message', async () => {
  current = part0005; responseStatus = 429; response = { error: 'busy' }
  mount(<App />, '/parts/MIR-0005/label')
  await userEvent.click(await screen.findByRole('button', { name: 'Ask CodeBuddy AI' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Another reading is running. Try again in a moment.')
})
it.each([{ status: 503, body: { error: 'unavailable' } }, { status: 400, body: { error: 'manual only', fallback: 'manual' } }])('offers and focuses manual entry on $status fallback', async ({ status, body }) => {
  current = part0005; responseStatus = status; response = body
  mount(<App />, '/parts/MIR-0005/label')
  await userEvent.click(await screen.findByRole('button', { name: 'Ask CodeBuddy AI' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('CodeBuddy AI is unavailable. Type the number from the photo instead.')
  expect(screen.getByRole('textbox', { name: 'Part number from the photo' })).toHaveFocus()
})
it('keeps the reading button when live reading is off', async () => {
  current = part0005
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, init) => url === '/api/ai/status' ? Promise.resolve(new Response(JSON.stringify({ ...aiStatusNow, available: false }))) : base(url, init))
  mount(<App />, '/parts/MIR-0005/label')
  expect(await screen.findByText('Live reading is off. Saved readings still work.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ask CodeBuddy AI' })).toBeEnabled()
})
it('shows Use this value only for ai_only and sends the actual array index', async () => {
  current = { ...part0005, ai_reads: [...part0005.ai_reads!, { ...part0001.ai_reads![0], photo: part0005.photos[1], read_at: '2026-10-28T10:00:00Z', agreement: 'ai_only' }] }
  response = putNumber
  mount(<App />, '/parts/MIR-0005/label')
  await userEvent.click(await screen.findByRole('button', { name: 'Use this value' }))
  await waitFor(() => expect(mutationCalls()).toHaveLength(1))
  expect(mutationCalls()[0][0]).toBe('/api/parts/MIR-0005/ai-accept')
  expect(JSON.parse(mutationCalls()[0][1].body)).toEqual({ read_index: 1 })
})
it('shows a 409 acceptance error', async () => {
  current = { ...part0001, ai_reads: part0001.ai_reads!.map(read => ({ ...read, agreement: 'ai_only' })) }
  responseStatus = 409; response = { error: 'a different number already exists' }
  mount(<App />, '/parts/MIR-0001/label')
  await userEvent.click(await screen.findByRole('button', { name: 'Use this value' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('a different number already exists')
})
it('lets the seller choose between disagreeing reader numbers using a fact patch', async () => {
  current = { ...part0001, ai_reads: part0001.ai_reads!.map(read => ({ ...read, agreement: 'disagree' })) }
  response = approvedPart
  mount(<App />, '/parts/MIR-0001/label')
  await userEvent.click(await screen.findByRole('button', { name: /^Use Offline reader:/ }))
  await waitFor(() => expect(mutationCalls()).toHaveLength(1))
  expect(mutationCalls()[0][1].method).toBe('PUT')
  expect(JSON.parse(mutationCalls()[0][1].body)).toEqual({ part_details: { part_number: { extracted_value: part0001.ocr!.at(-1)!.part_number_candidate } } })
  expect(screen.queryByRole('button', { name: 'Use this value' })).not.toBeInTheDocument()
})
it('validates manual entry and saves the uppercased hyphenated number with a ripple', async () => {
  current = part0004; response = putNumber
  mount(<App />, '/parts/MIR-0004/label')
  await userEvent.click(await screen.findByRole('button', { name: 'Use this number' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter letters and digits in groups joined by hyphens')
  expect(mutationCalls()).toHaveLength(0)
  await userEvent.type(screen.getByRole('textbox', { name: 'Part number from the photo' }), ' sbm - 7941 - np16 ')
  await userEvent.click(screen.getByRole('button', { name: 'Use this number' }))
  expect(await screen.findByRole('region', { name: 'What changed' })).toHaveTextContent('Part number')
  expect(JSON.parse(mutationCalls()[0][1].body)).toEqual({ part_details: { part_number: { extracted_value: 'SBM-7941-NP16' } } })
})
it('uploads a captured image and displays the new returned photo quality and reading', async () => {
  current = part0004
  const photo = '/uploads/MIR-0004/clear_label.png'
  const after = { ...putNumber, photos: [...putNumber.photos, photo], ocr: [...putNumber.ocr!, { ...part0001.ocr!.at(-1)!, photo, quality: { sharpness: 1114.26, blurry: false }, unclear: false }] }
  response = { created: [], updated: [current.item_id], warnings: [], parts: [after] }
  mount(<App />, '/parts/MIR-0004/label')
  const input = await screen.findByLabelText('Retake photo')
  expect(input).toHaveAttribute('capture', 'environment')
  expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  await userEvent.upload(input, new File(['photo bytes'], 'clear_label.png', { type: 'image/png' }))
  expect(await screen.findByAltText('Label photo: clear_label.png')).toBeInTheDocument()
  expect(screen.getByText('Sharpness 1114.26')).toBeInTheDocument()
  const form = mutationCalls()[0][1].body as FormData
  expect(form.get('item_id')).toBe('MIR-0004')
  expect((form.get('photos') as File).name).toBe('clear_label.png')
  expect(screen.getByText('No AI reading recorded.')).toBeInTheDocument()
  expect(screen.getByText('Reader agreement not recorded.')).toBeInTheDocument()
})
