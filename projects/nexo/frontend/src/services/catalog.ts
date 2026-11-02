import type { MediaItem, MediaType } from '../data/selection'
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function isStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  )
}
export function toMediaItem(value: unknown): MediaItem {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.id) ||
    typeof value.slug !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    !['movie', 'series', 'book', 'manga', 'game'].includes(
      String(value.media_type),
    ) ||
    !(
      value.original_title === null || typeof value.original_title === 'string'
    ) ||
    !(
      value.release_year === null ||
      (Number.isInteger(value.release_year) &&
        Number(value.release_year) !== 0 &&
        Math.abs(Number(value.release_year)) <= 9999)
    ) ||
    !isStrings(value.creators) ||
    !isStrings(value.genres) ||
    !(
      value.poster_path === null ||
      (typeof value.poster_path === 'string' &&
        !value.poster_path.includes('..') &&
        /^(?:\/images\/[a-z0-9._-]+|https:\/\/image\.tmdb\.org\/t\/p\/w500\/[A-Za-z0-9._-]+|https:\/\/covers\.openlibrary\.org\/b\/(?:id\/[0-9]+|isbn\/[0-9]{13})-L\.jpg\?default=false|https:\/\/bookinfo-imagens-prod\.s3\.amazonaws\.com\/[0-9]{13}-180x240\.jpg|https:\/\/books\.google\.com\/books\/(?:publisher\/)?content\?[A-Za-z0-9%=&._~+-]+|https:\/\/media\.kitsu\.(?:app|io)\/manga\/[A-Za-z0-9/_.-]+|https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_cover_big\/[A-Za-z0-9_-]+\.jpg)$/.test(
          value.poster_path,
        ))
    ) ||
    !(value.description === null || typeof value.description === 'string') ||
    !(
      value.editorial_note === null || typeof value.editorial_note === 'string'
    ) ||
    typeof value.source_url !== 'string' ||
    !URL.canParse(value.source_url) ||
    new URL(value.source_url).protocol !== 'https:'
  ) {
    throw new Error('Não foi possível ler os títulos recebidos.')
  }
  return {
    id: value.slug,
    apiId: value.id,
    title: value.title,
    originalTitle: value.original_title ?? undefined,
    type: value.media_type as MediaItem['type'],
    year: value.release_year as number | null,
    creator: value.creators.join(' e '),
    creators: value.creators,
    genres: value.genres,
    image: value.poster_path ?? '/images/poster-placeholder.svg',
    backdrop:
      typeof value.backdrop_path === 'string' &&
      /^(?:https:\/\/image\.tmdb\.org\/t\/p\/w1280\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+|https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_screenshot_big\/[A-Za-z0-9_-]+\.jpg)$/.test(
        value.backdrop_path,
      )
        ? value.backdrop_path
        : undefined,
    isAdult: value.is_adult === true,
    ageRating:
      typeof value.age_rating === 'string' ? value.age_rating : undefined,
    isbn13: typeof value.isbn_13 === 'string' ? value.isbn_13 : undefined,
    language: typeof value.language === 'string' ? value.language : undefined,
    publisher:
      typeof value.publisher === 'string' ? value.publisher : undefined,
    editionDate:
      typeof value.edition_date === 'string' ? value.edition_date : undefined,
    description:
      value.description ?? 'Ainda não temos uma sinopse para este título.',
    note: value.editorial_note ?? '',
    source: value.source_url,
    provider: [
      'tmdb',
      'open_library',
      'google_books',
      'kitsu',
      'igdb',
    ].includes(String(value.provider))
      ? (value.provider as MediaItem['provider'])
      : undefined,
    entityType:
      typeof value.provider_entity_type === 'string'
        ? value.provider_entity_type
        : undefined,
    externalId:
      typeof value.external_id === 'string' ? value.external_id : undefined,
    platforms: isStrings(value.platforms) ? value.platforms : [],
    aliases: isStrings(value.aliases) ? value.aliases : [],
  }
}
export interface CatalogPage {
  items: MediaItem[]
  total: number | null
  limit: number
  offset: number
  hasMore?: boolean
  warnings?: string[]
  externalSearch?: boolean
  bookSelection?: {
    source: string
    url: string
    from: string
    to: string
    checkedAt: string
    stale: boolean
    selectedCount: number
  }
}
export interface CatalogOptions {
  mediaType?: MediaType
  query?: string
  limit?: number
  offset?: number
  slugs?: string[]
  external?: boolean
  trending?: boolean
}
export async function getCatalog(
  options: CatalogOptions = {},
  signal?: AbortSignal,
): Promise<CatalogPage> {
  if (
    !options.trending &&
    ((options.query?.trim().length ?? 0) >= 2 ||
      (['manga', 'game'].includes(options.mediaType ?? '') &&
        !options.query?.trim())) &&
    !options.slugs &&
    options.external !== false
  ) {
    return searchProviders(options, signal)
  }
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
  const limit = options.limit ?? 24
  const offset = options.offset ?? 0
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  if (options.mediaType) params.set('media_type', options.mediaType)
  if (options.query?.trim()) params.set('q', options.query.trim())
  for (const slug of options.slugs ?? []) params.append('slugs', slug)
  const response = await fetch(
    `${baseUrl}/api/v1/${options.trending ? 'discover' : 'media'}?${params}`,
    {
      signal: signal
        ? AbortSignal.any([
            signal,
            AbortSignal.timeout(options.trending ? 45000 : 20000),
          ])
        : AbortSignal.timeout(options.trending ? 45000 : 20000),
    },
  )
  if (!response.ok)
    throw new Error('Não foi possível carregar os títulos. Tente novamente.')
  const data: unknown = await response.json()
  if (
    !isRecord(data) ||
    !Array.isArray(data.items) ||
    !Number.isInteger(data.total) ||
    Number(data.total) < 0 ||
    data.offset !== offset ||
    data.limit !== limit
  ) {
    throw new Error('O catálogo retornou uma resposta inesperada.')
  }
  const page = data.items.map(toMediaItem)
  const total = Number(data.total)
  if (page.length !== Math.min(limit, Math.max(0, total - offset))) {
    throw new Error('O catálogo retornou uma página incompleta.')
  }
  if (new Set(page.map((item) => item.id)).size !== page.length) {
    throw new Error('O catálogo retornou títulos repetidos.')
  }
  const warnings = Array.isArray(data.sources)
    ? data.sources
        .filter((source) => isRecord(source) && source.status !== 'ok')
        .map(
          (source) =>
            sourceLabels[String(source.provider)] ?? String(source.provider),
        )
    : []
  let bookSelection: CatalogPage['bookSelection']
  if (isRecord(data.book_selection)) {
    const info = data.book_selection
    if (
      info.source !== 'BookInfo' ||
      info.source_url !== 'https://www.bookinfo.com.br/maisvendidos' ||
      typeof info.period_start !== 'string' ||
      typeof info.period_end !== 'string' ||
      typeof info.checked_at !== 'string' ||
      typeof info.stale !== 'boolean'
    )
      throw new Error('A seleção brasileira retornou dados inesperados.')
    bookSelection = {
      source: info.source,
      url: info.source_url,
      from: info.period_start,
      to: info.period_end,
      checkedAt: info.checked_at,
      stale: info.stale,
      selectedCount: Number.isInteger(info.selected_count)
        ? Number(info.selected_count)
        : 0,
    }
  }
  return { items: page, total, limit, offset, warnings, bookSelection }
}
export async function getSavedCatalog(
  slugs: string[],
  options: CatalogOptions,
  signal?: AbortSignal,
  snapshots: MediaItem[] = [],
): Promise<CatalogPage> {
  const items: MediaItem[] = []
  const unique = [...new Set(slugs)]
  for (let start = 0; start < unique.length; start += 100) {
    const page = await getCatalog(
      {
        ...options,
        external: false,
        slugs: unique.slice(start, start + 100),
        limit: 100,
        offset: 0,
      },
      signal,
    )
    items.push(...page.items)
  }
  const loaded = new Set(items.map((item) => item.id))
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  for (const item of snapshots) {
    if (
      unique.includes(item.id) &&
      !loaded.has(item.id) &&
      (!options.mediaType || item.type === options.mediaType) &&
      normalize(
        [
          item.title,
          item.originalTitle ?? '',
          item.creator,
          ...item.genres,
          ...(item.aliases ?? []),
        ].join(' '),
      ).includes(normalize(options.query?.trim() ?? ''))
    ) {
      items.push(item)
      loaded.add(item.id)
    }
  }
  items.sort((a, b) => unique.indexOf(a.id) - unique.indexOf(b.id))
  const limit = options.limit ?? 24
  const offset = options.offset ?? 0
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  }
}
const sourceLabels: Record<string, string> = {
  catalog: 'Nexo',
  tmdb: 'TMDB',
  open_library: 'Open Library',
  google_books: 'Google Books',
  bookinfo: 'BookInfo',
  books: 'Livros',
  kitsu: 'Kitsu',
  igdb: 'IGDB',
}
async function searchProviders(
  options: CatalogOptions,
  signal?: AbortSignal,
): Promise<CatalogPage> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
  const pageNumber =
    Math.floor((options.offset ?? 0) / (options.limit ?? 24)) + 1
  const params = new URLSearchParams({
    q: options.query?.trim() ?? '',
    page: String(pageNumber),
  })
  if (options.mediaType) params.set('media_type', options.mediaType)
  const response = await fetch(`${baseUrl}/api/v1/search?${params}`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  })
  if (!response.ok)
    throw new Error('Não foi possível buscar os títulos. Tente novamente.')
  const data: unknown = await response.json()
  if (
    !isRecord(data) ||
    !Array.isArray(data.items) ||
    !Array.isArray(data.sources) ||
    data.page !== pageNumber ||
    typeof data.has_more !== 'boolean'
  )
    throw new Error('A busca retornou uma resposta inesperada.')
  const warnings: string[] = []
  for (const source of data.sources) {
    if (
      !isRecord(source) ||
      typeof source.provider !== 'string' ||
      !['ok', 'unavailable', 'not_configured'].includes(String(source.status))
    )
      throw new Error('A busca retornou uma fonte inesperada.')
    if (source.status !== 'ok')
      warnings.push(sourceLabels[source.provider] ?? source.provider)
  }
  return {
    items: data.items.map(toMediaItem),
    total: null,
    limit: options.limit ?? 24,
    offset: options.offset ?? 0,
    hasMore: data.has_more,
    warnings,
    externalSearch: true,
  }
}
export async function getMediaDetails(
  item: MediaItem,
  signal?: AbortSignal,
): Promise<MediaItem> {
  if (!item.provider || !item.entityType || !item.externalId) return item
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
  const path = [item.provider, item.entityType, item.externalId]
    .map(encodeURIComponent)
    .join('/')
  const response = await fetch(`${baseUrl}/api/v1/search/details/${path}`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  })
  if (!response.ok)
    throw new Error('Alguns detalhes não puderam ser carregados.')
  const data: unknown = await response.json()
  const details = toMediaItem(data)
  if (item.type === 'book' && item.isbn13) {
    if (details.isbn13 && details.isbn13 !== item.isbn13)
      throw new Error('Os detalhes recebidos são de outra edição do livro.')
    return {
      ...details,
      ...item,
      description:
        item.description && !item.description.startsWith('Ainda não temos')
          ? item.description
          : details.description,
      genres: item.genres.length ? item.genres : details.genres,
      image:
        item.provider === 'google_books' &&
        details.isbn13 === item.isbn13 &&
        details.image.startsWith('https://books.google.com/')
          ? details.image
          : item.image,
    }
  }
  return { ...details, id: item.id }
}
export function isStoredMediaItem(value: unknown): value is MediaItem {
  if (!isRecord(value)) return false
  try {
    toMediaItem({
      id: '00000000-0000-4000-8000-000000000001',
      slug: value.id,
      title: value.title,
      original_title: value.originalTitle ?? null,
      media_type: value.type,
      release_year: value.year,
      creators: [value.creator],
      genres: value.genres,
      poster_path: value.image,
      description: value.description,
      editorial_note: value.note || null,
      source_url: value.source,
    })
    return true
  } catch {
    return false
  }
}
