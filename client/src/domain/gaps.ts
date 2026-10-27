import type { Gap, PartRecord } from '@/api/types'
import { fieldLabel } from './fields'

export function formatGap(gap: Gap): string {
  const detail = gap.detail.trim().replace(/^(?:Information missing(?:[.:]\s*|$))+/i, '').trim()
    .replace(/^Information missing\b/i, 'Missing')
    .replace(/[.!?]\s+(?=[A-Z])/g, '; ')
  const fallback = gap.type === 'missing' ? 'Missing' : gap.type === 'conflict' ? 'Sources disagree' : 'Cannot claim'
  const sentence = (detail || fallback).replace(/^./u, letter => letter.toUpperCase())
  return `${fieldLabel(gap.field)}: ${sentence}${/[.!?]$/.test(sentence) ? '' : '.'}`
}

export function gapsFor(record: Pick<PartRecord, 'gaps_and_conflicts'>, path: string) {
  return record.gaps_and_conflicts.filter(gap => gap.field === path || path.startsWith(`${gap.field}.`))
}
