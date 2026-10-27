import { startTransition, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { SellerContext, sellerModes, sellerStorageKey, type SellerMode } from '@/domain/seller'

function savedMode(): SellerMode {
  try { return localStorage.getItem(sellerStorageKey) === 'individual' ? 'individual' : 'business' }
  catch { return 'business' }
}
export function SellerProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<SellerMode>(savedMode)
  const [revision, setRevision] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()
  const client = useQueryClient()
  function changeMode(next: SellerMode) {
    if (next === mode) return
    try { localStorage.setItem(sellerStorageKey, next) } catch { /* The selection still applies for this session. */ }
    void client.invalidateQueries({ refetchType: 'none' })
    const path = location.pathname
    startTransition(() => {
      setMode(next); setRevision(value => value + 1)
      navigate(path === '/export' ? '/export' : path === '/impact' && next === 'business' ? '/impact' : path === '/add' || path.startsWith('/sell') ? next === 'individual' ? '/sell' : '/add' : '/', { replace: true, state: null })
    })
  }
  return <SellerContext.Provider value={{ mode, sellerId: sellerModes[mode].sellerId, revision, changeMode }}>{children}</SellerContext.Provider>
}
