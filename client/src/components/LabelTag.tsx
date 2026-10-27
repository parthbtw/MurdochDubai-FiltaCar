import type { ReactNode } from 'react'

export function LabelTag({ label }: { label: string }) {
  if (!label) return null
  return <span className="label-tag">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
}

export function GuidanceText({ text, labels }: { text: string; labels: string[] }) {
  const distinct = [...new Set(labels.filter(Boolean))].sort((a, b) => b.length - a.length)
  const chunks: ReactNode[] = []
  let rest = text
  while (rest) {
    const match = distinct.map(label => ({ label, index: rest.toLowerCase().indexOf(label.toLowerCase()) })).filter(item => item.index >= 0).sort((a, b) => a.index - b.index)[0]
    if (!match) { chunks.push(rest); break }
    chunks.push(rest.slice(0, match.index), <LabelTag key={chunks.length} label={match.label} />)
    rest = rest.slice(match.index + match.label.length)
  }
  return <>{chunks}</>
}
