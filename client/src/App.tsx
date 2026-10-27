import { Link, Route, Routes } from 'react-router-dom'
import { QueueScreen } from '@/screens/QueueScreen'
import { PartScreen } from '@/screens/PartScreen'
import { LabelScreen } from '@/screens/LabelScreen'
import { EvidenceScreen } from '@/screens/EvidenceScreen'
import { PhoneScreen } from '@/components/PhoneScreen'
import { Button } from '@/components/ui/button'
import { BottomTabs } from '@/components/BottomTabs'
import { AddScreen } from '@/screens/AddScreen'
import { ExportScreen } from '@/screens/ExportScreen'
import { ImpactScreen } from '@/screens/ImpactScreen'

import { SellerProvider } from '@/components/SellerProvider'
import { useSeller } from '@/domain/seller'
import { SellScreen } from '@/screens/SellScreen'
import { MyPartsScreen } from '@/screens/MyPartsScreen'
import { DeviceFrame } from '@/components/DeviceFrame'

export default function App() {
  return <SellerProvider><DeviceFrame><SellerApp /></DeviceFrame></SellerProvider>
}
function SellerApp() {
  const { mode, revision } = useSeller()
  return <div className="phone-app" key={`${mode}-${revision}`}><Routes>
    <Route path="/" element={mode === 'individual' ? <MyPartsScreen /> : <QueueScreen />} />
    <Route path="/sell" element={<SellScreen />} />
    <Route path="/sell/:id/:step" element={<SellScreen />} />
    <Route path="/add" element={<AddScreen />} />
    <Route path="/export" element={<ExportScreen />} />
    <Route path="/impact" element={<ImpactScreen />} />
    <Route path="/parts/:id" element={<PartScreen />} />
    <Route path="/parts/:id/label" element={<LabelScreen />} />
    <Route path="/parts/:id/evidence" element={<EvidenceScreen />} />
    <Route path="*" element={<PhoneScreen title="Page not found"><div className="group mt-4 p-4"><p>This page is not in FiltaCar.</p><Button asChild variant="outline" className="mt-3"><Link to="/">Back to Readiness queue</Link></Button></div></PhoneScreen>} />
  </Routes><BottomTabs /></div>
}
