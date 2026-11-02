import type { MediaItem } from '../data/selection'
import { getSupabase } from './supabase'
import { toMediaItem } from './catalog'
import { libraryStatuses } from '../data/library'
import type { LibraryFeedback } from '../data/library'
function feedback(raw: unknown): LibraryFeedback & {
  mediaKey: string
} {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('media_key' in raw) ||
    typeof raw.media_key !== 'string' ||
    !('status' in raw) ||
    !libraryStatuses.some((value) => value === raw.status) ||
    !('rating' in raw) ||
    !(
      raw.rating === null ||
      (typeof raw.rating === 'number' &&
        Number.isInteger(raw.rating) &&
        raw.rating >= 1 &&
        raw.rating <= 5)
    ) ||
    !('is_favorite' in raw) ||
    typeof raw.is_favorite !== 'boolean'
  )
    throw new Error('Não foi possível ler suas preferências.')
  const reaction = 'reaction' in raw ? raw.reaction : undefined
  if (
    reaction !== undefined &&
    reaction !== null &&
    reaction !== 'liked' &&
    reaction !== 'disliked'
  )
    throw new Error('Não foi possível ler sua opinião sobre a obra.')
  return {
    mediaKey: raw.media_key,
    status: raw.status as LibraryFeedback['status'],
    rating: raw.rating as number | null,
    isFavorite: raw.is_favorite,
    ...(reaction !== undefined ? { reaction } : {}),
  }
}
export interface Profile {
  id: string
  display_name: string | null
  avatar_path?: string | null
  avatar_url?: string | null
  created_at: string
  updated_at: string
  onboarding_status: 'not_started' | 'skipped' | 'completed'
}
export async function accountRequest(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
  expectedUserId?: string,
): Promise<unknown> {
  const client = getSupabase()
  if (!client) throw new Error('O acesso à conta está indisponível.')
  const {
    data: { session },
    error,
  } = await client.auth.getSession()
  if (error || !session) throw new Error('Entre na sua conta para continuar.')
  if (!expectedUserId || session.user.id !== expectedUserId)
    throw new Error('A conta mudou. Atualize a página antes de continuar.')
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
  const response = await fetch(`${base}/api/v1/me${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([
          signal,
          AbortSignal.timeout(
            path.startsWith('/recommendations') || path.startsWith('/people')
              ? 60000
              : 30000,
          ),
        ])
      : AbortSignal.timeout(
          path.startsWith('/recommendations') || path.startsWith('/people')
            ? 60000
            : 30000,
        ),
  })
  if (response.status === 401)
    throw new Error('Sua sessão expirou. Entre novamente.')
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    const detail =
      typeof data === 'object' && data && 'detail' in data ? data.detail : null
    throw new Error(
      typeof detail === 'string' && detail.length < 250
        ? detail
        : 'Não foi possível atualizar sua conta. Tente novamente.',
    )
  }
  return response.status === 204 ? null : response.json()
}
export function rawMedia(item: MediaItem) {
  return {
    id: item.apiId,
    slug: item.id,
    title: item.title,
    original_title: item.originalTitle ?? null,
    media_type: item.type,
    release_year: item.year,
    creators: item.creators ?? (item.creator ? [item.creator] : []),
    genres: item.genres,
    poster_path: item.image,
    backdrop_path: item.backdrop ?? null,
    is_adult: item.isAdult ?? false,
    age_rating: item.ageRating ?? null,
    isbn_13: item.isbn13 ?? null,
    language: item.language ?? null,
    publisher: item.publisher ?? null,
    edition_date: item.editionDate ?? null,
    description: item.description || null,
    editorial_note: item.note || null,
    source_url: item.source,
    provider: item.provider ?? null,
    provider_entity_type: item.entityType ?? null,
    external_id: item.externalId ?? null,
    platforms: item.platforms ?? [],
    aliases: item.aliases ?? [],
  }
}
export async function loadAccountLibrary(
  signal?: AbortSignal,
  expectedUserId?: string,
): Promise<MediaItem[]> {
  const items: MediaItem[] = []
  let total: number
  do {
    const raw = await accountRequest(
      `/library?limit=100&offset=${items.length}`,
      'GET',
      undefined,
      signal,
      expectedUserId,
    )
    if (
      typeof raw !== 'object' ||
      raw === null ||
      !('items' in raw) ||
      !Array.isArray(raw.items) ||
      !('total' in raw) ||
      typeof raw.total !== 'number' ||
      !Number.isInteger(raw.total) ||
      raw.total < 0
    )
      throw new Error('Não foi possível ler sua lista.')
    const page = raw.items.map(toMediaItem)
    total = raw.total
    if (!page.length && items.length < total)
      throw new Error('A lista retornou uma página incompleta.')
    if (
      !('entries' in raw) ||
      !Array.isArray(raw.entries) ||
      raw.entries.length !== page.length
    )
      throw new Error('Não foi possível ler suas preferências.')
    const entries = new Map(
      raw.entries.map((entry) => {
        const value = feedback(entry)
        return [value.mediaKey, value]
      }),
    )
    for (const item of page) {
      const entry = entries.get(item.id)
      if (!entry) throw new Error('Não foi possível ler suas preferências.')
      item.library = {
        status: entry.status,
        rating: entry.rating,
        isFavorite: entry.isFavorite,
        ...(entry.reaction !== undefined ? { reaction: entry.reaction } : {}),
      }
    }
    items.push(...page)
  } while (items.length < total)
  return items
}
export async function saveAccountItem(
  item: MediaItem,
  expectedUserId?: string,
): Promise<MediaItem> {
  return toMediaItem(
    await accountRequest(
      `/library/${encodeURIComponent(item.id)}`,
      'PUT',
      { item: rawMedia(item) },
      undefined,
      expectedUserId,
    ),
  )
}
export async function removeAccountItem(
  id: string,
  expectedUserId?: string,
): Promise<void> {
  await accountRequest(
    `/library/${encodeURIComponent(id)}`,
    'DELETE',
    undefined,
    undefined,
    expectedUserId,
  )
}
export async function saveTaste(
  item: MediaItem,
  update: Pick<Partial<LibraryFeedback>, 'rating' | 'isFavorite'>,
  expectedUserId?: string,
): Promise<MediaItem> {
  const raw = await accountRequest(
    '/tastes',
    'POST',
    {
      item: rawMedia(item),
      ...(update.rating !== undefined ? { rating: update.rating } : {}),
      ...(update.isFavorite !== undefined
        ? { is_favorite: update.isFavorite }
        : {}),
    },
    undefined,
    expectedUserId,
  )
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('item' in raw) ||
    !('entry' in raw)
  )
    throw new Error('Não foi possível ler sua escolha.')
  const media = toMediaItem(raw.item)
  const entry = feedback(raw.entry)
  if (entry.mediaKey !== media.id)
    throw new Error('A escolha retornada não corresponde ao título.')
  return {
    ...media,
    library: {
      status: entry.status,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      ...(entry.reaction !== undefined ? { reaction: entry.reaction } : {}),
    },
  }
}
export async function finishOnboarding(
  action: 'skip' | 'complete',
  expectedUserId?: string,
): Promise<Profile> {
  return validateProfile(
    await accountRequest(
      '/onboarding',
      'PUT',
      { action },
      undefined,
      expectedUserId,
    ),
  )
}
export async function completeAccountItem(
  item: MediaItem,
  reaction: LibraryFeedback['reaction'],
  expectedUserId: string,
): Promise<MediaItem> {
  const raw = await accountRequest(
    '/library/completed',
    'POST',
    { item: rawMedia(item), reaction: reaction ?? null },
    undefined,
    expectedUserId,
  )
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('item' in raw) ||
    !('entry' in raw)
  )
    throw new Error('Não foi possível registrar a obra como concluída.')
  const media = toMediaItem(raw.item)
  const entry = feedback(raw.entry)
  if (entry.mediaKey !== media.id || entry.status !== 'completed')
    throw new Error('A obra concluída retornou dados inesperados.')
  return {
    ...media,
    library: {
      status: entry.status,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      reaction: entry.reaction ?? null,
    },
  }
}
export async function updateAccountItem(
  id: string,
  update: Partial<LibraryFeedback>,
  expectedUserId?: string,
): Promise<LibraryFeedback> {
  const raw = await accountRequest(
    `/library/${encodeURIComponent(id)}`,
    'PATCH',
    {
      ...(update.status !== undefined ? { status: update.status } : {}),
      ...(update.rating !== undefined ? { rating: update.rating } : {}),
      ...(update.isFavorite !== undefined
        ? { is_favorite: update.isFavorite }
        : {}),
      ...(update.reaction !== undefined ? { reaction: update.reaction } : {}),
    },
    undefined,
    expectedUserId,
  )
  const entry = feedback(raw)
  if (entry.mediaKey !== id)
    throw new Error('O título retornado não corresponde à sua lista.')
  return {
    status: entry.status,
    rating: entry.rating,
    isFavorite: entry.isFavorite,
    ...(entry.reaction !== undefined ? { reaction: entry.reaction } : {}),
  }
}
export async function importAccountItems(
  items: MediaItem[],
  expectedUserId?: string,
): Promise<void> {
  for (let offset = 0; offset < items.length; offset += 100)
    await accountRequest(
      '/library/import',
      'POST',
      { items: items.slice(offset, offset + 100).map(rawMedia) },
      undefined,
      expectedUserId,
    )
}
export async function loadProfile(
  signal?: AbortSignal,
  expectedUserId?: string,
): Promise<Profile> {
  return validateProfile(
    await accountRequest('', 'GET', undefined, signal, expectedUserId),
  )
}
export function validateProfile(raw: unknown): Profile {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('id' in raw) ||
    typeof raw.id !== 'string' ||
    !('display_name' in raw) ||
    !(typeof raw.display_name === 'string' || raw.display_name === null) ||
    !('created_at' in raw) ||
    typeof raw.created_at !== 'string' ||
    !('updated_at' in raw) ||
    typeof raw.updated_at !== 'string' ||
    !('onboarding_status' in raw) ||
    !['not_started', 'skipped', 'completed'].includes(
      String(raw.onboarding_status),
    )
  )
    throw new Error('Não foi possível ler seu perfil.')
  return raw as Profile
}
export async function updateProfile(
  displayName: string,
  expectedUserId?: string,
): Promise<Profile> {
  return validateProfile(
    await accountRequest(
      '',
      'PATCH',
      { display_name: displayName.trim() || null },
      undefined,
      expectedUserId,
    ),
  )
}
