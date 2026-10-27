import { ArabicText } from '@/components/ArabicText'
import { isArabic } from '@/domain/text'

export function PartTitle({ text, partNumber, className }: { text: string; partNumber?: string | null; className?: string }) {
  if (isArabic(text)) return <ArabicText className={className}>{text}</ArabicText>
  const position = partNumber ? text.indexOf(partNumber) : -1
  if (!partNumber || position < 0) return <p className={className}>{text}</p>
  return <p className={className}>{text.slice(0, position)}<span className="whitespace-nowrap font-mono">{partNumber}</span>{text.slice(position + partNumber.length)}</p>
}
