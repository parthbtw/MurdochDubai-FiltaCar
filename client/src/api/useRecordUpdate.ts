import { useQueryClient } from '@tanstack/react-query'
import type { PartRecord } from './types'
import { queryKeys } from './queries'

export function useRecordUpdate() {
  const client = useQueryClient()
  return (record: PartRecord) => {
    client.setQueryData(queryKeys.part(record.item_id), record)
    void client.invalidateQueries({ queryKey: ['parts'] })
    void client.invalidateQueries({ queryKey: ['metrics'] })
  }
}
