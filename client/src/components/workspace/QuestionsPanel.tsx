import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PartRecord } from '@/api/types'
import { getQuestionPack } from '@/api/endpoints'
import { retryApi } from '@/api/queries'
import { ArabicText, RecordedText } from '@/components/ArabicText'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SourceLine } from './SourceLine'
import { WorkspaceSection } from './WorkspaceSection'

export function QuestionsContent({ record }: { record: PartRecord }) {
  return <>{record.questions.length ? <ul className="divided-list">{record.questions.map((question, index) => <li className="p-4" key={`${question.field}-${index}`}>
    <p>{question.question_en}</p><ArabicText className="mt-2">{question.question_ar}</ArabicText>
    <SourceLine record={record} path={`questions.${index}`} />
  </li>)}</ul> : <p className="p-4">No open questions.</p>}</>
}

export function QuestionsPanel({ record, expanded = false }: { record: PartRecord; expanded?: boolean }) {
  const [fallback, setFallback] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copying, setCopying] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const pack = useQuery({ queryKey: ['question-pack', record.item_id], queryFn: () => getQuestionPack(record.item_id), enabled: false, retry: retryApi })
  useEffect(() => { if (fallback) { textarea.current?.focus(); textarea.current?.select() } }, [fallback, pack.data])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 4000)
    return () => clearTimeout(timer)
  }, [copied])
  async function copy() {
    setCopying(true)
    setCopied(false)
    setFallback(false)
    const result = await pack.refetch()
    if (result.data && !result.isError) {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
        await navigator.clipboard.writeText(result.data.text)
        setCopied(true)
      } catch { setFallback(true) }
    }
    setCopying(false)
  }
  return <WorkspaceSection title="Questions for the yard" summary={`${record.questions.length} open ${record.questions.length === 1 ? 'question' : 'questions'}`} expanded={expanded}>
    <QuestionsContent record={record} />
    <div className="p-4 border-t">
      <p className="text-footnote text-muted-foreground">FiltaCar never sends messages. You paste it into WhatsApp yourself.</p>
      {record.questions.length > 0 && <div className="no-print"><Button className="mt-3 w-full" disabled={copying} onClick={() => void copy()}>{copying ? 'Preparing message...' : 'Copy WhatsApp message'}</Button>
        {copied && <p role="status" className="copy-toast">Copied. Nothing was sent.</p>}
        {fallback && <div className="mt-3"><label htmlFor={`copy-${record.item_id}`} className="block text-footnote">Select the message and copy it yourself. Nothing was sent.</label><Textarea ref={textarea} id={`copy-${record.item_id}`} readOnly value={pack.data?.text ?? ''} dir="auto" className="mt-2 min-h-48" /></div>}
        <details className="mt-3" onToggle={event => { if (event.currentTarget.open && !pack.data && !pack.isFetching) void pack.refetch() }}>
          <summary className="pressable min-h-11 py-3 text-sm">Message preview</summary>
          {pack.isFetching ? <p className="text-sm" role="status">Loading message...</p> : pack.data && <div className="message-preview">{pack.data.text.split('\n').map((line, index) => <RecordedText key={index} text={line || ' '} className="whitespace-pre-wrap" />)}</div>}
        </details>
        {pack.isError && <p role="alert" className="mt-2 text-sm text-danger">Message could not be loaded. {pack.error.message} Try Copy WhatsApp message again.</p>}
      </div>}
    </div>
  </WorkspaceSection>
}
