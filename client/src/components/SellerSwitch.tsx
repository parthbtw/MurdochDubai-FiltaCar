import { useState } from 'react'
import { sellerModes, useSeller, type SellerMode } from '@/domain/seller'
import { ActionSheet } from './ActionSheet'
import { Button } from './ui/button'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

export function SellerSwitch() {
  const { mode, sellerId, changeMode } = useSeller()
  const [open, setOpen] = useState(false)
  return <><Button variant="ghost" className="h-auto px-1 text-footnote" aria-label={`${sellerModes[mode].label}: ${sellerId}. Who is selling?`} aria-haspopup="dialog" onClick={() => setOpen(true)}>{sellerModes[mode].label}: {sellerId}</Button>
    <ActionSheet compact title="Who is selling?" description="Choose whose parts you want to manage on this device." open={open} onClose={() => setOpen(false)}>
      <ToggleGroup type="single" value={mode} aria-label="Seller mode" className="flex-col gap-3 bg-background p-0" onValueChange={value => { if (value) { setOpen(false); changeMode(value as SellerMode) } }}>
        {Object.entries(sellerModes).map(([key, seller]) => <ToggleGroupItem key={key} value={key} className="h-auto min-h-11 w-full justify-start whitespace-normal border border-input p-4 text-start text-base"><span><span className="block font-semibold">{seller.label}: {seller.sellerId}</span><span className="mt-1 block font-normal">{seller.description}</span></span></ToggleGroupItem>)}
      </ToggleGroup>
    </ActionSheet>
  </>
}
