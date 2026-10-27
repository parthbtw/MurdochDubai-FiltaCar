import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import App from '@/App'
import { DeviceFrame } from './DeviceFrame'
import { SourceSheet } from './SourceSheet'
import { ApprovalAction } from './ApprovalAction'
import { QuestionsPanel } from './workspace/QuestionsPanel'
import { part, part0001 } from '@/test/fixtures'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Toaster } from './ui/sonner'
import { toast } from 'sonner'

afterEach(() => { localStorage.clear(); toast.dismiss() })

function viewport(wide: boolean) {
  const listeners = new Set<() => void>()
  const media = {
    matches: wide, media: '(min-width: 601px)', onchange: null,
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  return {
    media,
    resize(value: boolean) { act(() => { media.matches = value; listeners.forEach(listener => listener()) }) },
  }
}

function mountApp(url = '/unknown') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /></MemoryRouter></QueryClientProvider>)
}

function mount(children: React.ReactNode, url = '/') {
  return render(<MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DeviceFrame>{children}</DeviceFrame></MemoryRouter>)
}

it('frames the whole app on desktop with static, hidden status chrome and contained tabs', () => {
  viewport(true)
  mountApp()
  const phone = screen.getByTestId('device-screen')
  expect(screen.getByTestId('device-frame')).toContainElement(phone)
  expect(within(phone).getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  expect(phone).toContainElement(screen.getByTestId('dynamic-island'))
  expect(screen.getByTestId('dynamic-island')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByTestId('device-status-bar')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByTestId('device-status-bar')).toHaveTextContent('9:41')
  expect(phone).toContainElement(screen.getByRole('navigation', { name: 'Main tabs' }))
})

it('opens the app seller drawer inside the screen and returns focus after closing', async () => {
  viewport(true)
  mountApp()
  const trigger = screen.getByRole('button', { name: /Who is selling/ })
  await userEvent.click(trigger)
  const drawer = await screen.findByRole('dialog', { name: 'Who is selling?' })
  expect(screen.getByTestId('device-screen')).toContainElement(drawer)
  expect(drawer).toHaveAttribute('data-vaul-custom-container', 'true')
  await userEvent.click(within(drawer).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
})

it.each([{ wide: false, query: '' }, { wide: true, query: '?frame=0' }])('keeps the app unframed for $wide wide and "$query"', async ({ wide, query }) => {
  viewport(wide)
  mountApp(`/unknown${query}`)
  expect(screen.queryByTestId('device-frame')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Who is selling/ }))
  expect(await screen.findByRole('dialog', { name: 'Who is selling?' })).toBeInTheDocument()
  expect(screen.getByRole('dialog').closest('.phone-app')).toBeNull()
})

it('switches live at the media query boundary and removes the listener on unmount', () => {
  const view = viewport(false)
  const mounted = mount(<p>App content</p>)
  expect(screen.queryByTestId('device-frame')).not.toBeInTheDocument()
  view.resize(true)
  expect(screen.getByTestId('device-screen')).toHaveTextContent('App content')
  view.resize(false)
  expect(screen.queryByTestId('device-frame')).not.toBeInTheDocument()
  expect(screen.getByText('App content')).toBeInTheDocument()
  mounted.unmount()
  expect(view.media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
})

it('reads the escape hatch from the current URL without persisting it', async () => {
  viewport(true)
  mount(<><p>App content</p><Link to="/?frame=0">Hide frame</Link><Link to="/">Show frame</Link></>)
  await userEvent.click(screen.getByRole('link', { name: 'Hide frame' }))
  expect(screen.queryByTestId('device-frame')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'Show frame' }))
  expect(screen.getByTestId('device-frame')).toBeInTheDocument()
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
})

it('scales the whole device down for short windows and never scales above one', () => {
  viewport(true)
  vi.stubGlobal('innerHeight', 486)
  vi.stubGlobal('innerWidth', 1280)
  mount(<p>App content</p>)
  const scale = () => Number(screen.getByTestId('device-frame').style.getPropertyValue('--device-scale'))
  expect(scale()).toBe(0.5)
  vi.stubGlobal('innerHeight', 2000)
  fireEvent(window, new Event('resize'))
  expect(scale()).toBe(1)
})

it('keeps source detents in screen coordinates and makes the handle keyboard operable', async () => {
  viewport(true)
  function Evidence() {
    const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null)
    return <><button onClick={event => setTrigger(event.currentTarget)}>Trace field</button><SourceSheet record={part} field={trigger ? { path: 'part_number', label: 'Part number', trigger } : null} onClose={() => setTrigger(null)} /></>
  }
  mount(<Evidence />)
  await userEvent.click(screen.getByRole('button', { name: 'Trace field' }))
  const drawer = await screen.findByRole('dialog', { name: 'Where this came from' })
  expect(screen.getByTestId('device-screen')).toContainElement(drawer)
  expect(drawer.style.height).toBe('calc(var(--screen-height) * 0.55)')
  const handle = within(drawer).getByRole('button', { name: 'Change sheet height' })
  handle.focus()
  await userEvent.keyboard('{Enter}')
  expect(drawer.style.height).toBe('calc(var(--screen-height) * 0.92)')
  await userEvent.keyboard(' ')
  expect(drawer.style.height).toBe('calc(var(--screen-height) * 0.55)')
  await userEvent.click(within(drawer).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Trace field' })).toHaveFocus())
})

it.each(['dialog', 'sheet', 'popover', 'dropdown', 'tooltip'] as const)('contains the shared %s portal', async kind => {
  viewport(true)
  const examples = {
    dialog: <Dialog><DialogTrigger>Open overlay</DialogTrigger><DialogContent><DialogTitle>Overlay title</DialogTitle><DialogDescription>Overlay details</DialogDescription></DialogContent></Dialog>,
    sheet: <Sheet><SheetTrigger>Open overlay</SheetTrigger><SheetContent><SheetTitle>Overlay title</SheetTitle><SheetDescription>Overlay details</SheetDescription></SheetContent></Sheet>,
    popover: <Popover><PopoverTrigger>Open overlay</PopoverTrigger><PopoverContent>Overlay title</PopoverContent></Popover>,
    dropdown: <DropdownMenu><DropdownMenuTrigger>Open overlay</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Overlay title</DropdownMenuItem></DropdownMenuContent></DropdownMenu>,
    tooltip: <TooltipProvider delayDuration={0}><Tooltip><TooltipTrigger>Open overlay</TooltipTrigger><TooltipContent>Overlay title</TooltipContent></Tooltip></TooltipProvider>,
  }
  mount(examples[kind])
  const trigger = screen.getByRole('button', { name: 'Open overlay' })
  if (kind === 'tooltip') await userEvent.hover(trigger)
  else await userEvent.click(trigger)
  await waitFor(() => expect(screen.getByTestId('device-screen')).toHaveTextContent('Overlay title'))
  for (const title of screen.getAllByText('Overlay title')) expect(screen.getByTestId('device-screen')).toContainElement(title)
})

it.each([true, false])('puts Sonner toasts in the screen when framed=%s and in body otherwise', async wide => {
  viewport(wide)
  const { container } = mount(<Toaster />)
  act(() => { toast('Saved in this screen') })
  const message = await screen.findByText('Saved in this screen')
  if (wide) expect(screen.getByTestId('device-screen')).toContainElement(message)
  else { expect(document.body).toContainElement(message); expect(container).not.toContainElement(message) }
})

it('keeps sticky approval outside a pushing route and opens its sheet inside the screen', async () => {
  viewport(true)
  const client = new QueryClient()
  mount(<QueryClientProvider client={client}><main className="route-push"><ApprovalAction record={part0001} sticky /></main></QueryClientProvider>)
  const bar = screen.getByRole('region', { name: 'Listing approval' })
  expect(screen.getByTestId('device-screen')).toContainElement(bar)
  expect(bar.closest('.route-push')).toBeNull()
  await userEvent.click(within(bar).getByRole('button', { name: 'Approve listing' }))
  expect(screen.getByTestId('device-screen')).toContainElement(await screen.findByRole('dialog', { name: 'Approve this listing draft?' }))
})

it('keeps the copy confirmation outside a pushing route and inside the screen', async () => {
  viewport(true)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: 'Recorded questions' }))))
  const user = userEvent.setup()
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  mount(<QueryClientProvider client={client}><main className="route-push"><QuestionsPanel record={{ ...part, questions: [{ field: 'part_number', question_en: 'Confirm the part number', question_ar: '' }] }} expanded /></main></QueryClientProvider>)
  await user.click(screen.getByRole('button', { name: 'Copy WhatsApp message' }))
  const message = await screen.findByText('Copied. Nothing was sent.')
  expect(screen.getByTestId('device-screen')).toContainElement(message)
  expect(message.closest('.route-push')).toBeNull()
})
