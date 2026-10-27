import { useEffect, useRef } from 'react'
import type { PartRecord } from '@/api/types'
import { ArabicText } from '@/components/ArabicText'
import { firstBlockingAction } from '@/domain/readiness'
import { factId, sortedActions } from '@/domain/workspace'
import { SourceLine } from './SourceLine'

export function NeedsAnswer({ record, onEdit, omitFirstBlocker = false }: { record: PartRecord; onEdit?: (path: string) => void; omitFirstBlocker?: boolean }) {
  const first = omitFirstBlocker ? firstBlockingAction(record) : null
  const actions = sortedActions(record.actions_required).filter(action => action !== first)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const highlighted = useRef<HTMLElement | null>(null)
  useEffect(() => () => { clearTimeout(timer.current); highlighted.current?.classList.remove('fact-highlight') }, [])
  function reveal(path: string) {
    const target = document.getElementById(factId(path)) ?? document.getElementById(factId(`${path}.extracted_value`))
    if (!target) return
    for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    target.focus({ preventScroll: true })
    highlighted.current?.classList.remove('fact-highlight')
    clearTimeout(timer.current)
    target.classList.add('fact-highlight')
    highlighted.current = target
    timer.current = setTimeout(() => target.classList.remove('fact-highlight'), 1800)
  }
  const cell = (action: typeof actions[number], index: number) => <li key={`${action.field}-${index}`} className="divided-row">
    <button className="pressable w-full p-4 text-start" onClick={() => { if (onEdit) onEdit(action.field); else reveal(action.field) }}>
      <span className={`status-tag ${action.blocking ? 'tone-warning' : 'tone-neutral'}`}>{action.blocking ? 'Blocks approval' : 'Does not block'}</span>
      <p className="mt-2">{action.action_en}</p><ArabicText className="mt-2">{action.action_ar}</ArabicText>
      <span className="mt-2 block text-footnote text-muted-foreground">{onEdit ? 'Answer this question' : 'View related fact'}</span>
    </button>
  </li>
  return <section className="mt-5" aria-label="Needs your answer"><h2 className="group-heading">Needs your answer</h2>
    <div className="group">{actions.length ? <><ul>{cell(actions[0], 0)}</ul>{actions.length > 1 && <details className="workspace-disclosure border-t">
      <summary className="workspace-summary pressable"><span>{actions.length - 1} more {actions.length === 2 ? 'answer' : 'answers'} needed</span><span className="disclosure-more">Show all</span><span className="disclosure-less">Show less</span></summary>
      <ul>{actions.slice(1).map((action, index) => cell(action, index + 1))}</ul>
    </details>}</> : <p className="p-4">Nothing else to answer</p>}
    <div className="px-4 pb-3"><SourceLine record={record} path="actions_required" /></div></div>
  </section>
}
