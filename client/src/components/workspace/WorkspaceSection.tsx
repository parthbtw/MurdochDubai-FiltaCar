import type { ReactNode } from 'react'

export function WorkspaceSection({ title, summary, children, expanded = false }: { title: string; summary: string; children: ReactNode; expanded?: boolean }) {
  return <section className="workspace-section mt-5" aria-label={title}>
    <h2 className="group-heading">{title}</h2>
    {expanded ? <div className="group workspace-body">{children}</div> : <details className="group workspace-disclosure">
      <summary className="pressable workspace-summary"><span>{summary}</span><span className="disclosure-more">Show all</span><span className="disclosure-less">Show less</span></summary>
      <div className="workspace-body border-t">{children}</div>
    </details>}
  </section>
}
