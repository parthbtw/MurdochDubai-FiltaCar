import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import mark from '@/assets/brand/filtacar-mark.png'
import { cn } from '@/lib/utils'

const scrollPositions = new Map<string, number>()
export function PhoneScreen({ title, detail = false, monoTitle = detail, backTo = '/', backLabel = 'Readiness queue', children }: { title: string; detail?: boolean; monoTitle?: boolean; backTo?: string; backLabel?: string; children: ReactNode }) {
  const location = useLocation()
  const navigation = useNavigationType()
  const navigate = useNavigate()
  const scroll = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const scrollKey = `${location.pathname}${location.search}`
  useLayoutEffect(() => {
    const element = scroll.current
    if (!element) return
    element.scrollTop = scrollPositions.get(scrollKey) ?? 0
    setCollapsed(element.scrollTop > 64)
  }, [scrollKey])
  return <div ref={scroll} className="app-scroll" data-scroll-container onScroll={event => {
    const top = event.currentTarget.scrollTop
    scrollPositions.set(scrollKey, top)
    setCollapsed(top > 64)
  }}>
    <header className="top-bar safe-inline">
      <div className="top-bar-row">
        {detail ? <Link to={backTo} className="pressable -ms-2 flex min-h-11 items-center gap-0.5 rounded-md pe-2 text-sm" aria-label={`Back to ${backLabel}`} onClick={event => {
          if (!location.state?.restoredTab && location.state?.returnTo === backTo && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(-1) }
        }}>
          <ChevronLeft aria-hidden="true" className="h-5 w-5 shrink-0 rtl:rotate-180" />{backLabel}
        </Link> : <div className="flex items-center gap-2"><img src={mark} alt="" className="h-8 w-8 object-contain" /><span className="text-base font-semibold">FiltaCar</span></div>}
        {collapsed ? <span aria-hidden="true" className={cn('truncate text-sm font-semibold', monoTitle && 'font-mono')}>{title}</span> : !detail && <span className="text-xs text-muted-foreground">DXB-SLV-014</span>}
      </div>
    </header>
    <main key={location.pathname} className={cn('safe-inline safe-bottom pb-6 pt-5', location.key !== 'default' && (detail ? 'route-push' : navigation === 'POP' ? 'route-back' : ''))}>
      <h1 className={cn('large-title', monoTitle && 'font-mono')}>{title}</h1>
      {children}
    </main>
  </div>
}
