import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import App from '@/App'
import { NeedsAnswer } from '@/components/workspace/NeedsAnswer'
import { QuestionsPanel } from '@/components/workspace/QuestionsPanel'
import { DraftPanel } from '@/components/workspace/DraftPanel'
import { CorridorPanel } from '@/components/workspace/CorridorPanel'
import { ReadersPanel } from '@/components/workspace/ReadersPanel'
import { ApprovalPanel } from '@/components/workspace/ApprovalPanel'
import { PhotoQualityPanel } from '@/components/workspace/PhotoQualityPanel'
import { ClaimText } from '@/components/ClaimText'
import { confirmedPartNumber, sortedActions } from '@/domain/workspace'
import { part, part0001, part0004, part0005, part0009, compatibility, questionPack, questionPack0001, metrics, partsResponse } from '@/test/fixtures'
import type { ReactNode } from 'react'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/parts') return new Response(JSON.stringify(partsResponse))
    if (url === '/api/metrics') return new Response(JSON.stringify(metrics))
    if (url.endsWith('/question-pack')) return new Response(JSON.stringify(url.includes('MIR-0001') ? questionPack0001 : questionPack))
    if (url.startsWith('/api/compatibility/')) return url.endsWith('SBM-7940-LC17') ? new Response(JSON.stringify(compatibility)) : new Response(JSON.stringify({ error: 'no compatibility entry' }), { status: 404 })
    return new Response(JSON.stringify(part))
  })
})
function mount(children: ReactNode, url = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter></QueryClientProvider>)
}
async function openPanel(title: string) {
  const section = screen.getByRole('region', { name: title })
  await userEvent.click(section.querySelector('summary')!)
  return within(section)
}

it('includes the six extra captured fixtures in the typed index', () => {
  expect([part0001, part0004, part0005, part0009].map(record => record.item_id)).toEqual(['MIR-0001', 'MIR-0004', 'MIR-0005', 'MIR-0009'])
  expect(compatibility.part_number).toBe('SBM-7940-LC17')
  expect(questionPack0001.questions_count).toBe(part0001.questions.length)
})
it('separates queue corridor labels from values and removes the tiny thumbnails', async () => {
  mount(<App />)
  const cell = await screen.findByRole('link', { name: 'Review MIR-0001' })
  const value = within(cell).getByText(`UK side: ${part0001.corridor!.uk_side_wording.value}`)
  expect(value).not.toHaveTextContent(/guidance, verify/i)
  expect(within(cell).getByText('Guidance, verify')).toHaveClass('label-tag')
  expect(within(cell).queryByRole('img')).not.toBeInTheDocument()
})
it('shows MIR-0007 answers with blockers first, then priority, without mutating the record', async () => {
  const record = { ...part, actions_required: [...part.actions_required].reverse() }
  mount(<NeedsAnswer record={record} />)
  await openPanel('Needs your answer')
  const rows = screen.getAllByRole('listitem')
  const expected = sortedActions(record.actions_required)
  expect(rows).toHaveLength(expected.length)
  expected.forEach((action, index) => {
    expect(rows[index]).toHaveTextContent(action.action_en)
    expect(rows[index]).toHaveTextContent(action.blocking ? 'Blocks approval' : 'Does not block')
    expect(within(rows[index]).getByText(action.action_ar)).toHaveAttribute('dir', 'rtl')
  })
  expect(record.actions_required[0]).toEqual(part.actions_required.at(-1))
  const shuffled = [part.actions_required[1], { ...part.actions_required[0], priority: 4 }, { ...part.actions_required[0], priority: 1 }]
  expect(sortedActions(shuffled).map(action => action.priority)).toEqual([1, 4, 6])
})
it('shows the empty answer state', () => {
  mount(<NeedsAnswer record={{ ...part, actions_required: [] }} />)
  expect(screen.getByText('Nothing else to answer')).toBeInTheDocument()
})
it('moves from an action to the related fact and respects reduced motion', async () => {
  vi.mocked(window.matchMedia).mockReturnValueOnce({ matches: true } as MediaQueryList)
  mount(<><NeedsAnswer record={part} /><div id="fact-donor_vehicle.year" tabIndex={-1}>Donor year</div></>)
  const section = screen.getByRole('region', { name: 'Needs your answer' })
  await userEvent.click(within(section).getByRole('button', { name: /Blocks approval/ }))
  const target = document.getElementById('fact-donor_vehicle.year')!
  expect(target).toHaveClass('fact-highlight')
  expect(target).toHaveFocus()
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
})
it('copies the fetched bilingual WhatsApp message and confirms nothing was sent', async () => {
  const user = userEvent.setup()
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  mount(<QuestionsPanel record={part} expanded />)
  await user.click(screen.getByRole('button', { name: 'Copy WhatsApp message' }))
  expect(write).toHaveBeenCalledWith(questionPack.text)
  expect(await screen.findByRole('status')).toHaveTextContent('Copied. Nothing was sent.')
  expect(fetchMock).toHaveBeenCalledWith('/api/parts/MIR-0007/question-pack', expect.objectContaining({ headers: expect.any(Headers) }))
  expect(fetchMock.mock.calls.every(([, options]) => !options.method || options.method === 'GET')).toBe(true)
})
it('selects a read-only fallback when the clipboard is missing', async () => {
  userEvent.setup()
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard)
  mount(<QuestionsPanel record={part} expanded />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy WhatsApp message' }))
  const textarea = await screen.findByRole('textbox') as HTMLTextAreaElement
  expect(textarea).toHaveAttribute('readonly')
  expect(textarea).toHaveValue(questionPack.text)
  await waitFor(() => expect(textarea.selectionEnd).toBe(questionPack.text.length))
  expect(textarea.selectionStart).toBe(0)
  expect(screen.getByText('Select the message and copy it yourself. Nothing was sent.')).toBeInTheDocument()
})
it('also offers fallback when clipboard permission is denied', async () => {
  const user = userEvent.setup()
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'))
  mount(<QuestionsPanel record={part} expanded />)
  await user.click(screen.getByRole('button', { name: 'Copy WhatsApp message' }))
  expect(await screen.findByRole('textbox')).toHaveValue(questionPack.text)
})
it('renders Arabic message-preview lines right to left', async () => {
  mount(<QuestionsPanel record={part} expanded />)
  await userEvent.click(screen.getByText('Message preview'))
  const line = questionPack.text.split('\n').find(text => /\p{Script=Arabic}/u.test(text))!
  expect(await screen.findByText(line)).toHaveAttribute('dir', 'rtl')
})
it('does not offer a copy action when there are no open questions', () => {
  mount(<QuestionsPanel record={{ ...part0001, questions: [] }} expanded />)
  expect(screen.getByText('No open questions.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copy WhatsApp message' })).not.toBeInTheDocument()
})
it('shows the draft, title count, both compatibility groups and struck Arabic claim with its reason', async () => {
  mount(<DraftPanel record={part} expanded />)
  expect(screen.getByText('Draft, not published')).toBeInTheDocument()
  expect(screen.getByText(`${Array.from(part.draft!.title).length} / 80 characters`)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'In the test reference catalogue' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Not verified' })).toBeInTheDocument()
  const strike = screen.getByText('حالة جيدة')
  expect(strike.tagName).toBe('DEL')
  expect(strike).toHaveAccessibleDescription(part.draft!.blocked_claims[0].reason)
  expect(strike.closest('[lang="ar"]')).toHaveAttribute('dir', 'rtl')
  expect(await screen.findByText('No reference entry for this part number.')).toBeInTheDocument()
  const labels = screen.getAllByText('Guidance, verify')
  expect(labels.every(label => label.matches('span.label-tag'))).toBe(true)
})
it('shows the no-draft state', () => {
  mount(<DraftPanel record={{ ...part, draft: null }} expanded />)
  expect(screen.getByText('No draft yet. FiltaCar writes one after the checks run.')).toBeInTheDocument()
})
it('loads region notes only for a confirmed number and labels the test catalogue', async () => {
  mount(<DraftPanel record={part0001} expanded />)
  expect(await screen.findByText(compatibility.region_notes)).toBeInTheDocument()
  expect(screen.getByText('Synthetic reference catalogue, test data, not verified')).toBeInTheDocument()
  expect(screen.getByText(`Source: ${compatibility.source}`)).toBeInTheDocument()
  expect(confirmedPartNumber(part0004)).toBeNull()
  expect(confirmedPartNumber({ ...part0001, part_details: { ...part0001.part_details, part_number: { ...part0001.part_details.part_number, requires_manual_verification: true } } })).toBeNull()
})
it('marks blocked phrases in original Arabic notes without changing the text', () => {
  const original = part.original_title_ar!
  const { container } = mount(<ClaimText text={original} claims={part.draft!.blocked_claims} />)
  const strike = container.querySelector('del')!
  expect(strike).toHaveTextContent('حالة جيدة')
  expect(strike).toHaveAccessibleDescription(part.draft!.blocked_claims[0].reason)
  expect(container.querySelector('p.sr-only')).toHaveTextContent(original)
  expect(part.original_title_ar).toBe(original)
})
it('renders MIR-0005 estimated shipping, bilingual definition requirements and the dated checklist', () => {
  mount(<CorridorPanel record={part0005} expanded />)
  expect(screen.getByText('Estimated, weight not provided')).toBeInTheDocument()
  expect(screen.getByText('Part number confirmed')).toBeInTheDocument()
  expect(screen.getByText('تأكيد رقم القطعة')).toHaveAttribute('dir', 'rtl')
  expect(screen.getByText('Version 1.0. Dated 2026-10-27.')).toBeInTheDocument()
  expect(screen.getByText('Test checklist for the prototype. Not legal, customs or tax advice.')).toBeInTheDocument()
  expect(screen.getByText('Verify with HM Revenue and Customs')).toBeInTheDocument()
  expect(screen.getByText('Verify with UK Trade Tariff')).toBeInTheDocument()
  const side = screen.getByText(part0005.corridor!.uk_side_wording.value!)
  expect(side).not.toHaveTextContent(/guidance, verify/i)
})
it('shows MIR-0004 declined reading, neither-reader explanation and unclear marker', () => {
  mount(<ReadersPanel record={part0004} expanded />)
  expect(screen.getByText('Declined to guess')).toBeInTheDocument()
  expect(screen.getByText('Neither reader could read a number. Type it from the photo.')).toBeInTheDocument()
  expect(screen.getByText('OCR unclear')).toHaveClass('tone-warning')
})
it('shows the agreement sentence for MIR-0001', () => {
  mount(<ReadersPanel record={part0001} expanded />)
  expect(screen.getByText('Both readers found the same number')).toBeInTheDocument()
})
it.each([
  ['disagree', 'The readers found different numbers. You decide.'],
  ['ai_only', 'Only CodeBuddy AI found a number. It stays a suggestion until you confirm it.'],
  ['tesseract_only', 'Only the offline reader found a number.'],
] as const)('shows the saved %s reader explanation', (agreement, sentence) => {
  mount(<ReadersPanel record={{ ...part0001, ai_reads: part0001.ai_reads!.map(read => ({ ...read, agreement })) }} expanded />)
  expect(screen.getByText(sentence)).toBeInTheDocument()
})
it('marks blurry photos and leaves photos without quality explicitly unrecorded', () => {
  mount(<PhotoQualityPanel record={part0004} />)
  expect(screen.getByText('Blurry, retake')).toHaveClass('tone-warning')
  expect(screen.getByText('Quality not recorded')).toBeInTheDocument()
})
it('orders history newest first and keeps approval read-only', () => {
  const first = part.history[0]
  const record = { ...part, history: [{ ...first, at: '2026-10-26T10:00:00Z', by: 'Earlier seller' }, { ...first, at: '2026-10-27T10:00:00Z', by: 'Later seller' }] }
  mount(<ApprovalPanel record={record} expanded />)
  expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Later seller')
  expect(screen.getByText('Not approved yet')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('pushes an evidence route with source labels next to values and a real print action', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  mount(<App />, '/parts/MIR-0007')
  await userEvent.click(await screen.findByRole('link', { name: 'View evidence' }))
  const facts = await screen.findByRole('region', { name: 'Facts and sources' })
  const year = within(facts).getByText('Donor year', { selector: 'dt' }).closest('div')!
  expect(year).toHaveTextContent('2018')
  expect(year).toHaveTextContent('Source: spreadsheet row 9')
  await userEvent.click(screen.getByRole('button', { name: 'Print or save as PDF' }))
  expect(print).toHaveBeenCalledOnce()
  expect(screen.getByRole('region', { name: 'Gaps and conflicts' })).toHaveTextContent('Arabic yard note')
  expect(screen.getByText('Synthetic demo data. FiltaCar prepares drafts; the seller approves; nothing is published.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to MIR-0007' })).toHaveAttribute('href', '/parts/MIR-0007')
})
it('keeps the seven requested workspace panels in order below Next step', async () => {
  mount(<App />, '/parts/MIR-0007')
  await screen.findByRole('region', { name: 'Needs your answer' })
  const titles = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
  expect(titles.slice(0, 8)).toEqual(['Next step', 'Needs your answer', 'Questions for the yard', 'Listing draft', 'UAE to UK corridor', 'Label readers', 'Photo quality', 'Approval and history'])
  expect(document.querySelector('details.workspace-disclosure')).not.toHaveAttribute('open')
})
