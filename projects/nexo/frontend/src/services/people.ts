import { accountRequest } from './account'
import { toMediaItem } from './catalog'
import type { MediaItem } from '../data/selection'
export interface Person {
  username: string
  display_name: string
  bio: string
  avatar_url: string | null
}
export interface PersonSuggestion {
  profile: Person
  reason: string
  shared_items: MediaItem[]
  shared_genres: string[]
}
export interface PeoplePage {
  status: 'ready' | 'needs_tastes' | 'no_matches'
  items: PersonSuggestion[]
  total: number
  limit: number
  offset: number
}
export interface FollowStatus {
  following: boolean
  followed_id: string
  is_self: boolean
}
export interface FollowingPage {
  items: {
    followed_id: string
    profile: Person | null
  }[]
  total: number
  limit: number
  offset: number
}
function record(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || !raw || Array.isArray(raw))
    throw new Error('Não conseguimos ler os perfis.')
  return raw as Record<string, unknown>
}
function person(raw: unknown): Person {
  const value = record(raw)
  if (
    typeof value.username !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{2,29}$/.test(value.username) ||
    typeof value.display_name !== 'string' ||
    typeof value.bio !== 'string' ||
    !(value.avatar_url === null || typeof value.avatar_url === 'string')
  )
    throw new Error('Um perfil chegou incompleto.')
  return value as unknown as Person
}
function page(raw: unknown) {
  const value = record(raw)
  if (
    !Array.isArray(value.items) ||
    !Number.isInteger(value.total) ||
    Number(value.total) < 0 ||
    !Number.isInteger(value.limit) ||
    !Number.isInteger(value.offset)
  )
    throw new Error('A lista de perfis chegou incompleta.')
  return {
    ...value,
    status: value.status,
    items: value.items as unknown[],
    total: Number(value.total),
    limit: Number(value.limit),
    offset: Number(value.offset),
  }
}
function status(raw: unknown): FollowStatus {
  const value = record(raw)
  if (
    typeof value.following !== 'boolean' ||
    typeof value.followed_id !== 'string' ||
    typeof value.is_self !== 'boolean'
  )
    throw new Error('Não conseguimos conferir este seguimento.')
  return value as unknown as FollowStatus
}
export async function searchPeople(
  query: string,
  offset = 0,
  signal?: AbortSignal,
) {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
  const params = new URLSearchParams({
    q: query,
    limit: '12',
    offset: String(offset),
  })
  const response = await fetch(`${base}/api/v1/people/search?${params}`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  if (!response.ok)
    throw new Error('Não conseguimos buscar os perfis. Tente novamente.')
  const raw = page(await response.json())
  return { ...raw, items: raw.items.map(person) }
}
export async function getPeople(
  user: string,
  limit = 12,
  offset = 0,
  signal?: AbortSignal,
): Promise<PeoplePage> {
  const raw = page(
    await accountRequest(
      `/people?limit=${limit}&offset=${offset}`,
      'GET',
      undefined,
      signal,
      user,
    ),
  )
  if (!['ready', 'needs_tastes', 'no_matches'].includes(String(raw.status)))
    throw new Error('Não conseguimos ler suas sugestões de perfis.')
  return {
    ...raw,
    status: raw.status as PeoplePage['status'],
    items: raw.items.map((entry) => {
      const row = record(entry)
      if (
        typeof row.reason !== 'string' ||
        !Array.isArray(row.shared_items) ||
        !Array.isArray(row.shared_genres) ||
        !row.shared_genres.every((g) => typeof g === 'string')
      )
        throw new Error('Não conseguimos ler o motivo desta sugestão.')
      return {
        profile: person(row.profile),
        reason: row.reason,
        shared_items: row.shared_items.map(toMediaItem),
        shared_genres: row.shared_genres as string[],
      }
    }),
  }
}
export async function getFollowing(
  user: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<FollowingPage> {
  const raw = page(
    await accountRequest(
      `/following?limit=12&offset=${offset}`,
      'GET',
      undefined,
      signal,
      user,
    ),
  )
  return {
    ...raw,
    items: raw.items.map((entry) => {
      const row = record(entry)
      if (typeof row.followed_id !== 'string')
        throw new Error('Um seguimento chegou incompleto.')
      return {
        followed_id: row.followed_id,
        profile: row.profile === null ? null : person(row.profile),
      }
    }),
  }
}
export async function getFollowStatus(
  user: string,
  username: string,
  signal?: AbortSignal,
) {
  return status(
    await accountRequest(
      `/following/status/${encodeURIComponent(username)}`,
      'GET',
      undefined,
      signal,
      user,
    ),
  )
}
export async function followPerson(user: string, username: string) {
  return status(
    await accountRequest(
      `/following/${encodeURIComponent(username)}`,
      'PUT',
      undefined,
      undefined,
      user,
    ),
  )
}
export async function unfollowPerson(user: string, id: string) {
  await accountRequest(
    `/following/${encodeURIComponent(id)}`,
    'DELETE',
    undefined,
    undefined,
    user,
  )
}
