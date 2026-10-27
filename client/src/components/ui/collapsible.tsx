import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { cn } from "@/lib/utils"

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = React.forwardRef<React.ElementRef<typeof CollapsiblePrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger>>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Trigger ref={ref} className={cn('min-h-11 rounded-md px-3 text-start text-base active:bg-muted focus-visible:ring-2 focus-visible:ring-ring', className)} {...props} />
))
CollapsibleTrigger.displayName = 'CollapsibleTrigger'

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
