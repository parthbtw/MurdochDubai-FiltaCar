import { useId } from 'react'
import type { Draft } from '@/api/types'
import { ArabicText, RecordedText } from './ArabicText'
import { isArabic } from '@/domain/text'

function BlockedPhrase({ phrase, reason }: { phrase: string; reason: string }) {
  const id = useId()
  return <><del aria-describedby={id} title={reason}>{phrase}</del><span id={id} className="sr-only">{reason}</span></>
}

export function ClaimText({ text, claims, className }: { text: string; claims: Draft['blocked_claims']; className?: string }) {
  const phrases = claims.filter(claim => claim.phrase && text.includes(claim.phrase)).sort((a, b) => b.phrase.length - a.phrase.length)
  if (!phrases.length) return <RecordedText text={text} className={className} />
  const pieces = []
  let rest = text
  while (rest) {
    const next = phrases.map(claim => ({ ...claim, index: rest.indexOf(claim.phrase) })).filter(claim => claim.index >= 0).sort((a, b) => a.index - b.index)[0]
    if (!next) { pieces.push(rest); break }
    pieces.push(rest.slice(0, next.index), <BlockedPhrase key={pieces.length} phrase={next.phrase} reason={next.reason} />)
    rest = rest.slice(next.index + next.phrase.length)
  }
  return <><RecordedText text={text} className="sr-only" />{isArabic(text) ? <ArabicText className={className}>{pieces}</ArabicText> : <p className={className}>{pieces}</p>}</>
}
