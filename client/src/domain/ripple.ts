import type { PartRecord } from '@/api/types'
import { editableFields, fieldLabel, valueAt } from './fields'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function difference<T>(before: T[], after: T[], key: (item: T) => string) {
  const previous = new Set(before.map(key)), next = new Set(after.map(key))
  return { resolved: before.filter(item => !next.has(key(item))), added: after.filter(item => !previous.has(key(item))) }
}
const sentences = (text: string) => text.match(/[^.!?\n]+(?:[.!?]+|$)/g)?.map(sentence => sentence.trim()).filter(Boolean) ?? []
export function compareRecords(before: PartRecord, after: PartRecord) {
  const previousChecklist = before.corridor?.checklist
  const nextChecklist = after.corridor?.checklist
  const previousItems = previousChecklist && nextChecklist && previousChecklist.id === nextChecklist.id && previousChecklist.version === nextChecklist.version ? previousChecklist.items : []
  return {
    readiness: before.readiness_status === after.readiness_status ? null : { before: before.readiness_status, after: after.readiness_status },
    gaps: difference(before.gaps_and_conflicts, after.gaps_and_conflicts, gap => `${gap.field}:${gap.type}`),
    questions: difference(before.questions, after.questions, question => `${question.field}:${question.question_en}`),
    actions: difference(before.actions_required, after.actions_required, action => `${action.field}:${action.action_en}`),
    title: before.draft?.title === after.draft?.title ? null : { before: before.draft?.title ?? '', after: after.draft?.title ?? '' },
    description: difference(sentences(before.draft?.description ?? ''), sentences(after.draft?.description ?? ''), sentence => sentence),
    checklist: (nextChecklist?.items ?? []).flatMap(item => {
      const previous = previousItems.find(old => old.id === item.id)
      return previous && previous.status !== item.status ? [{ id: item.id, before: previous.status, after: item.status, detail: item.detail }] : []
    }),
    approvalWithdrawn: before.seller_approval.approved && !after.seller_approval.approved,
    changedFields: editableFields.filter(field => !same(valueAt(before, field.path), valueAt(after, field.path))).map(field => field.path),
  }
}
export type Ripple = ReturnType<typeof compareRecords>

export function rippleSummary(ripple: Ripple): string {
  const fields = ripple.changedFields.map(fieldLabel).join(', ')
  const resolved = ripple.actions.resolved.filter(action => action.blocking).length
  return `${fields ? `${fields} saved.` : 'Record saved.'}${resolved ? ` ${resolved} required ${resolved === 1 ? 'question' : 'questions'} resolved.` : ' The returned record has been checked.'}${ripple.approvalWithdrawn ? ' Approval withdrawn.' : ''}`
}
