import type { MediaItem, MediaType } from './selection'
export const libraryStatuses = [
  'planned',
  'in_progress',
  'completed',
  'paused',
  'dropped',
] as const
export type LibraryStatus = (typeof libraryStatuses)[number]
export type LibraryReaction = 'liked' | 'disliked'
export interface LibraryFeedback {
  status: LibraryStatus
  rating: number | null
  isFavorite: boolean
  reaction?: LibraryReaction | null
}
export const emptyFeedback: LibraryFeedback = {
  status: 'planned',
  rating: null,
  isFavorite: false,
}
export function statusLabel(status: LibraryStatus, type?: MediaType) {
  const reading = type === 'book' || type === 'manga'
  if (status === 'planned')
    return type === 'game'
      ? 'Quero jogar'
      : reading
        ? 'Quero ler'
        : type
          ? 'Quero ver'
          : 'Para depois'
  if (status === 'in_progress')
    return type === 'game'
      ? 'Jogando'
      : reading
        ? 'Lendo'
        : type
          ? 'Assistindo'
          : 'Em andamento'
  return {
    completed: 'Concluído',
    paused: 'Em pausa',
    dropped: 'Deixei de lado',
  }[status]
}
export function filterLibrary(
  items: MediaItem[],
  status: LibraryStatus | 'all',
  favoritesOnly: boolean,
) {
  return items.filter(
    (item) =>
      (!favoritesOnly || item.library?.isFavorite) &&
      (status === 'all' || (item.library?.status ?? 'planned') === status),
  )
}
export function libraryPage(
  items: MediaItem[],
  options: {
    status: LibraryStatus | 'all'
    favoritesOnly: boolean
    mediaType?: MediaType
    query?: string
    limit: number
    offset: number
  },
) {
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  const matching = filterLibrary(
    items,
    options.status,
    options.favoritesOnly,
  ).filter(
    (item) =>
      (!options.mediaType || item.type === options.mediaType) &&
      normalize(
        [
          item.title,
          item.originalTitle ?? '',
          item.creator,
          ...item.genres,
          ...(item.aliases ?? []),
        ].join(' '),
      ).includes(normalize(options.query?.trim() ?? '')),
  )
  return {
    items: matching.slice(options.offset, options.offset + options.limit),
    total: matching.length,
    limit: options.limit,
    offset: options.offset,
  }
}
