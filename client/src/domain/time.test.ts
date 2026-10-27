import { expect, it } from 'vitest'
import { formatRecordedTimes, formatTime } from './time'
import { historyValue } from './workspace'

it('formats ISO timestamps in Dubai time with a readable date and 24-hour time', () => {
  expect(formatTime('2026-10-27T18:32:00.000Z')).toBe('27 Oct 2026, 22:32')
  expect(formatTime('2026-10-27T22:32:00+04:00')).toBe('27 Oct 2026, 22:32')
  expect(formatTime('2026-10-27T22:32:00Z')).toBe('28 Oct 2026, 02:32')
})
it('formats date-only records without adding a time and handles missing or invalid dates', () => {
  expect(formatTime('2026-10-27')).toBe('27 Oct 2026')
  for (const value of [null, undefined, '', 'invalid']) expect(formatTime(value)).toBe('Not recorded')
})
it('formats timestamp strings embedded in provenance and nested history without changing the record', () => {
  const at = '2026-10-27T18:32:00.000Z'
  expect(formatRecordedTimes(`Saved at ${at}; next reading ${at}`)).toBe('Saved at 27 Oct 2026, 22:32; next reading 27 Oct 2026, 22:32')
  const history = { approved: true, approved_at: at }
  expect(historyValue(history)).toBe('Approved: true; Approval time: 27 Oct 2026, 22:32')
  expect(history.approved_at).toBe(at)
})
