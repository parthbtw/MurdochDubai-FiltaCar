const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' })
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Dubai' })

export function formatTime(value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Not recorded'
  const parsed = new Date(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? date.format(parsed) : `${date.format(parsed)}, ${time.format(parsed)}`
}

// Also format timestamps embedded in returned provenance and nested history values.
export const formatRecordedTimes = (text: string) => text.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/g, formatTime)
