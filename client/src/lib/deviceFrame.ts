import { createContext, useContext } from 'react'

// Undefined lets the portal libraries retain their document.body default.
export const DevicePortalContext = createContext<HTMLElement | undefined>(undefined)
export const useDevicePortalContainer = () => useContext(DevicePortalContext)
