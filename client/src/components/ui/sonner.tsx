import type * as React from "react"
import { Toaster as Sonner } from "sonner"
import { createPortal } from "react-dom"
import { useDevicePortalContainer } from "@/lib/deviceFrame"

type ToasterProps = React.ComponentProps<typeof Sonner> & { container?: HTMLElement }

const Toaster = ({ container: target, ...props }: ToasterProps) => {
  const screen = useDevicePortalContainer()
  const container = screen ?? target ?? document.body
  // This Sonner version has no container prop; portal its rendered host instead.
  return createPortal(
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:rounded-lg group-[.toaster]:text-callout",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
      offset={screen ? { top: 59, bottom: 106, left: 16, right: 16 } : props.offset}
      mobileOffset={screen ? { top: 59, bottom: 106, left: 16, right: 16 } : props.mobileOffset}
      style={{ ...props.style, ...(screen ? { '--width': '361px' } : {}) } as React.CSSProperties}
    />,
    container,
  )
}

export { Toaster }
