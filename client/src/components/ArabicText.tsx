import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { isArabic } from '@/domain/text'

export function ArabicText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} lang="ar" dir="rtl" className={cn('arabic-text', className)} />
}
export function RecordedText({ text, className }: { text: string; className?: string }) {
  return isArabic(text) ? <ArabicText className={className}>{text}</ArabicText> : <p className={className}>{text}</p>
}
