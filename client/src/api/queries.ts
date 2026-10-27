import { useSeller } from '@/domain/seller'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from './client'
import { getMetrics, getPart, getParts, type MetricsParams, type PartsParams } from './endpoints'

export const retryApi = (failureCount: number, error: Error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2
export const queryKeys = {
  parts: (params?: PartsParams) => ['parts', params?.status ?? null, params?.seller_id ?? null] as const,
  part: (id: string) => ['part', id] as const,
  metrics: (params?: MetricsParams) => ['metrics', params?.seller_id ?? null] as const,
}
export function useParts(params?: PartsParams) {
  const { sellerId } = useSeller()
  const scoped = { ...params, seller_id: sellerId }
  return useQuery({ queryKey: queryKeys.parts(scoped), queryFn: () => getParts(scoped), retry: retryApi, staleTime: 60_000 })
}
export const usePart = (id: string) => useQuery({ queryKey: queryKeys.part(id), queryFn: () => getPart(id), enabled: Boolean(id), retry: retryApi, staleTime: 60_000 })
export function useMetrics(params?: MetricsParams) {
  const { sellerId } = useSeller()
  const scoped = { ...params, seller_id: sellerId }
  return useQuery({ queryKey: queryKeys.metrics(scoped), queryFn: () => getMetrics(scoped), retry: retryApi, staleTime: 60_000 })
}
