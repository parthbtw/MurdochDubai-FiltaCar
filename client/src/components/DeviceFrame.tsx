import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { DevicePortalContext } from '@/lib/deviceFrame'

const desktopQuery = '(min-width: 601px)'

function fitScale() {
  return Math.max(0, Math.min(1, (window.innerHeight - 48) / 876, (window.innerWidth - 48) / 425))
}

export function DeviceFrame({ children }: { children: ReactNode }) {
  const { search } = useLocation()
  const [wide, setWide] = useState(() => window.matchMedia(desktopQuery).matches)
  const [scale, setScale] = useState(fitScale)
  const [screen, setScreen] = useState<HTMLDivElement | null>(null)
  const framed = wide && new URLSearchParams(search).get('frame') !== '0'

  useEffect(() => {
    const media = window.matchMedia(desktopQuery)
    const resize = () => { setWide(media.matches); setScale(fitScale()) }
    resize()
    media.addEventListener('change', resize)
    window.addEventListener('resize', resize)
    return () => {
      media.removeEventListener('change', resize)
      window.removeEventListener('resize', resize)
    }
  }, [])

  if (!framed) return <>{children}</>

  return <div className="device-stage" data-testid="device-frame" style={{ '--device-scale': scale } as CSSProperties}>
    <div className="device-body">
      <div aria-hidden="true" className="device-button device-button-action" />
      <div aria-hidden="true" className="device-button device-button-volume-up" />
      <div aria-hidden="true" className="device-button device-button-volume-down" />
      <div aria-hidden="true" className="device-button device-button-power" />
      <div ref={setScreen} className="device-screen" data-testid="device-screen">
        <DevicePortalContext.Provider value={screen ?? undefined}>{children}</DevicePortalContext.Provider>
        <div aria-hidden="true" className="device-status-bar" data-testid="device-status-bar">
          <span>9:41</span>
          <div className="device-status-icons">
            <svg viewBox="0 0 20 14"><path d="M1 10h3v4H1zm5-3h3v7H6zm5-3h3v10h-3zm5-4h3v14h-3z" fill="currentColor" /></svg>
            <svg viewBox="0 0 20 16"><path d="M2 5a12 12 0 0 1 16 0M5 8a8 8 0 0 1 10 0M8 11a3 3 0 0 1 4 0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><circle cx="10" cy="14" r="1.4" fill="currentColor" /></svg>
            <span className="device-battery" />
          </div>
        </div>
        <div aria-hidden="true" className="device-island" data-testid="dynamic-island" />
        <div aria-hidden="true" className="device-home-indicator" />
      </div>
    </div>
  </div>
}
