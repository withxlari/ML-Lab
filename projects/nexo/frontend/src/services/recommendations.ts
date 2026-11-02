import type { MediaItem, MediaType } from '../data/selection'
import { toMediaItem } from './catalog'
import { accountRequest } from './account'
export interface Recommendation {
  item: MediaItem
  score: number
  reasons: {
    description: string
    sourceSlug: string
    sourceTitle: string
  }[]
}
export interface Recommendations {
  status: 'ready' | 'needs_tastes' | 'no_matches'
  catalogSize: number
  total: number
  offset?: number
  hasMore?: boolean
  items: Recommendation[]
}
export async function getRecommendations(
  userId: string,
  mediaType?: MediaType,
  signal?: AbortSignal,
  offset = 0,
): Promise<Recommendations> {
  const params = new URLSearchParams({ limit: '12', strategy: 'personalized' })
  if (mediaType) params.set('media_type', mediaType)
  if (offset > 0) params.set('offset', String(offset))
  const raw = await accountRequest(
    `/recommendations?${params}`,
    'GET',
    undefined,
    signal,
    userId,
  )
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('status' in raw) ||
    !['ready', 'needs_tastes', 'no_matches'].includes(String(raw.status)) ||
    !('items' in raw) ||
    !Array.isArray(raw.items) ||
    !('catalog_size' in raw) ||
    typeof raw.catalog_size !== 'number' ||
    !Number.isInteger(raw.catalog_size) ||
    raw.catalog_size < 0 ||
    !('total' in raw) ||
    !Number.isInteger(raw.total) ||
    Number(raw.total) < 0 ||
    ('offset' in raw &&
      (!Number.isInteger(raw.offset) || Number(raw.offset) < 0)) ||
    ('has_more' in raw && typeof raw.has_more !== 'boolean')
  )
    throw new Error('Não conseguimos ler suas sugestões.')
  const items = raw.items.map((row: unknown) => {
    if (
      typeof row !== 'object' ||
      row === null ||
      !('item' in row) ||
      !('score' in row) ||
      typeof row.score !== 'number' ||
      !Number.isFinite(row.score) ||
      row.score < 0 ||
      row.score > 1 ||
      !('reasons' in row) ||
      !Array.isArray(row.reasons) ||
      row.reasons.length === 0
    )
      throw new Error('Uma sugestão chegou incompleta.')
    const reasons = row.reasons.map((reason: unknown) => {
      if (
        typeof reason !== 'object' ||
        reason === null ||
        !('description' in reason) ||
        typeof reason.description !== 'string' ||
        !reason.description.trim() ||
        !('source_slug' in reason) ||
        typeof reason.source_slug !== 'string' ||
        !('source_title' in reason) ||
        typeof reason.source_title !== 'string'
      )
        throw new Error('Não conseguimos ler o motivo da sugestão.')
      return {
        description: reason.description,
        sourceSlug: reason.source_slug,
        sourceTitle: reason.source_title,
      }
    })
    return { item: toMediaItem(row.item), score: row.score, reasons }
  })
  validatePage(raw.status, items, Number(raw.total))
  const pageOffset = 'offset' in raw ? Number(raw.offset) : 0
  const hasMore = pageOffset + items.length < Number(raw.total)
  if (
    pageOffset + items.length > Number(raw.total) ||
    ('has_more' in raw && raw.has_more !== hasMore)
  )
    throw new Error('A lista de sugestões chegou inconsistente.')
  return {
    status: raw.status as Recommendations['status'],
    items,
    total: Number(raw.total),
    catalogSize: raw.catalog_size,
    offset: pageOffset,
    hasMore,
  }
}
function validatePage(
  status: unknown,
  items: Recommendation[],
  total: number,
): void {
  if (
    items.length > 12 ||
    total < items.length ||
    new Set(items.map((row) => row.item.id)).size !== items.length ||
    (status === 'ready' ? items.length === 0 : items.length !== 0)
  )
    throw new Error('A lista de sugestões chegou inconsistente.')
}
