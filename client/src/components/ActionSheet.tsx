import type { ReactNode } from 'react'
import { Button } from './ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from './ui/drawer'

export function ActionSheet({ title, description, open, onClose, busy = false, showDone = true, children }: { title: string; description: string; open: boolean; onClose: () => void; busy?: boolean; showDone?: boolean; children: ReactNode }) {
  return <Drawer open={open} onOpenChange={value => { if (!value && !busy) onClose() }} dismissible={!busy} autoFocus handleOnly>
    <DrawerContent><DrawerHeader className="border-b pt-0"><div className="flex items-center justify-between gap-3"><DrawerTitle>{title}</DrawerTitle>{showDone && <Button variant="ghost" disabled={busy} onClick={onClose}>Done</Button>}</div><DrawerDescription>{description}</DrawerDescription></DrawerHeader>
      <div className="safe-bottom min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div>
    </DrawerContent>
  </Drawer>
}
