import { Link, Route, Routes } from 'react-router-dom'
import { QueueScreen } from '@/screens/QueueScreen'
import { PartScreen } from '@/screens/PartScreen'
import { LabelScreen } from '@/screens/LabelScreen'
import { EvidenceScreen } from '@/screens/EvidenceScreen'
import { PhoneScreen } from '@/components/PhoneScreen'
import { Button } from '@/components/ui/button'

export default function App() {
  return <div className="phone-app"><Routes>
    <Route path="/" element={<QueueScreen />} />
    <Route path="/parts/:id" element={<PartScreen />} />
    <Route path="/parts/:id/label" element={<LabelScreen />} />
    <Route path="/parts/:id/evidence" element={<EvidenceScreen />} />
    <Route path="*" element={<PhoneScreen title="Page not found"><div className="group mt-4 p-4"><p>This page is not in FiltaCar.</p><Button asChild variant="outline" className="mt-3"><Link to="/">Back to Readiness queue</Link></Button></div></PhoneScreen>} />
  </Routes></div>
}
