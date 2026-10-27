import { Badge } from '@/components/ui/badge'
import type { Readiness } from '@/api/types'
import { readiness } from '@/domain/readiness'

const tones = { ready: 'bg-ready-soft text-ready', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger' }
export function StatusPill({ status }: { status: Readiness }) {
  const state = readiness[status]
  return <Badge className={tones[state.tone]}>{state.label}</Badge>
}
