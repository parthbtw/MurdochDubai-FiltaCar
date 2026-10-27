import { createContext, useContext } from 'react'

export const sellerModes = {
  business: { label: 'Business', sellerId: 'DXB-SLV-014', description: 'salvage yard with many parts' },
  individual: { label: 'Individual', sellerId: 'IND-DXB-001', description: 'one person selling their own parts' },
} as const
export type SellerMode = keyof typeof sellerModes
export const sellerStorageKey = 'filtacar-seller-mode'
export const SellerContext = createContext({ mode: 'business' as SellerMode, sellerId: sellerModes.business.sellerId as string, revision: 0, changeMode: (_mode: SellerMode) => { void _mode } })
export const useSeller = () => useContext(SellerContext)
