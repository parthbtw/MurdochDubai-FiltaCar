import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function LoadingRows({ label }: { label: string }) {
  return <div className="group p-4" role="status" aria-label={label}>
    {[0, 1, 2].map(index => <div key={index} className="flex gap-3 py-3" aria-hidden="true">
      <Skeleton className="h-16 w-16 shrink-0" />
      <div className="flex-1 space-y-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-full" /><Skeleton className="h-4 w-3/4" /></div>
    </div>)}
  </div>
}
export function ErrorBlock({ error, retry }: { error: Error; retry: () => void }) {
  return <div className="group p-4" role="alert">
    <p className="font-semibold">Could not load this information</p>
    <p className="mt-2 text-sm">{error instanceof ApiError ? error.message : 'The FiltaCar API could not be reached. If it is not running, start it with npm run dev.'}</p>
    <Button variant="outline" className="mt-3" onClick={retry}>Try again</Button>
  </div>
}
