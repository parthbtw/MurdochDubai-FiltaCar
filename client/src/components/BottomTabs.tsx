import { useLayoutEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BarChart3, Download, List, Plus } from 'lucide-react'

const tabs = [
  { path: '/', label: 'Queue', icon: List },
  { path: '/add', label: 'Add', icon: Plus },
  { path: '/export', label: 'Export', icon: Download },
  { path: '/impact', label: 'Impact', icon: BarChart3 },
]
export function BottomTabs() {
  const location = useLocation()
  const active = tabs.find(tab => tab.path !== '/' && location.pathname === tab.path)?.path ?? '/'
  const positions = useRef<Record<string, { to: string; state: Record<string, unknown> }>>({})
  useLayoutEffect(() => { positions.current[active] = { to: `${location.pathname}${location.search}${location.hash}`, state: { ...location.state, restoredTab: true } } }, [active, location])
  return <nav className="bottom-tabs no-print" aria-label="Main tabs">
    {tabs.map(({ path, label, icon: Icon }) => <Link key={path} to={positions.current[path]?.to ?? path} state={positions.current[path]?.state} aria-current={active === path ? 'page' : undefined} className="pressable bottom-tab">
      <Icon aria-hidden="true" size={22} strokeWidth={1.8} /><span>{label}</span>
    </Link>)}
  </nav>
}
