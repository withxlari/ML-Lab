import type { MediaItem, MediaType } from '../data/selection'
import { accountRequest, rawMedia } from './account'
import { toMediaItem } from './catalog'
export const categories: {
  id: MediaType
  label: string
}[] = [
  { id: 'movie', label: 'Filmes' },
  { id: 'series', label: 'Séries' },
  { id: 'book', label: 'Livros' },
  { id: 'manga', label: 'Mangás' },
  { id: 'game', label: 'Jogos' },
]
export interface CategoryTaste {
  liked_genres: string[]
  avoided_genres: string[]
  liked_themes: string[]
  avoided_themes: string[]
}
export interface Tastes {
  categories: Partial<Record<MediaType, CategoryTaste>>
  like_text: string
  avoid_text: string
}
export const emptyTaste = (): CategoryTaste => ({
  liked_genres: [],
  avoided_genres: [],
  liked_themes: [],
  avoided_themes: [],
})
export interface PublicProfile {
  username: string
  display_name: string
  bio: string
  avatar_url?: string | null
  is_public: boolean
  show_ratings: boolean
  show_stats?: boolean
  show_followers?: boolean
  show_following?: boolean
  stats?: {
    explored: number | null
    favorites: number | null
    followers: number | null
    following: number | null
  }
  top_fives: Partial<Record<MediaType, MediaItem[]>>
  updated_at?: string
}
export interface Review {
  media_key: string
  item: MediaItem
  body: string
  rating: number | null
  visibility: 'private' | 'public'
  spoiler: boolean
  updated_at: string
}
export type FeedbackAction =
  'more_like_this' | 'not_interested' | 'already_known'
export interface Feedback {
  media_key: string
  item: MediaItem
  action: FeedbackAction
  updated_at: string
}
export interface Activity {
  recent?: {
    item: MediaItem
    rating: number | null
    has_review: boolean
    updated_at: string
  }[]
  items: {
    item: MediaItem
    rating: number | null
    body: string | null
    spoiler: boolean
    updated_at: string
  }[]
  total: number
  limit: number
  offset: number
}
function record(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || !raw || Array.isArray(raw))
    throw new Error('Não foi possível ler estas informações.')
  return raw as Record<string, unknown>
}
function profile(raw: unknown): PublicProfile | null {
  if (raw === null) return null
  const value = record(raw)
  if (
    typeof value.username !== 'string' ||
    typeof value.display_name !== 'string' ||
    typeof value.bio !== 'string' ||
    typeof value.is_public !== 'boolean' ||
    typeof value.show_ratings !== 'boolean'
  )
    throw new Error('Este perfil chegou incompleto.')
  const tops = record(value.top_fives)
  const top_fives: PublicProfile['top_fives'] = {}
  for (const { id } of categories) {
    const list = tops[id]
    if (list !== undefined) {
      if (!Array.isArray(list) || list.length > 5)
        throw new Error('Top 5 inválido.')
      top_fives[id] = list.map(toMediaItem)
    }
  }
  return { ...value, top_fives } as unknown as PublicProfile
}
function review(raw: unknown): Review {
  const value = record(raw)
  if (
    typeof value.body !== 'string' ||
    typeof value.media_key !== 'string' ||
    !['private', 'public'].includes(String(value.visibility))
  )
    throw new Error('Avaliação incompleta.')
  return { ...value, item: toMediaItem(value.item) } as unknown as Review
}
function feedback(raw: unknown): Feedback {
  const value = record(raw)
  if (
    !['more_like_this', 'not_interested', 'already_known'].includes(
      String(value.action),
    )
  )
    throw new Error('Ajuste incompleto.')
  return { ...value, item: toMediaItem(value.item) } as unknown as Feedback
}
export async function getTastes(
  user: string,
  signal?: AbortSignal,
): Promise<Tastes> {
  const raw = record(
    await accountRequest('/preferences', 'GET', undefined, signal, user),
  )
  if (typeof raw.like_text !== 'string' || typeof raw.avoid_text !== 'string')
    throw new Error('Gostos incompletos.')
  const cats = record(raw.categories)
  for (const value of Object.values(cats))
    for (const key of [
      'liked_genres',
      'avoided_genres',
      'liked_themes',
      'avoided_themes',
    ]) {
      const tags = record(value)[key]
      if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string'))
        throw new Error('Gostos incompletos.')
    }
  return raw as unknown as Tastes
}
export async function saveTastes(user: string, body: Tastes) {
  await accountRequest('/preferences', 'PUT', body, undefined, user)
}
export async function getOwnProfile(user: string, signal?: AbortSignal) {
  return profile(
    await accountRequest('/public-profile', 'GET', undefined, signal, user),
  )
}
export async function saveProfile(user: string, body: PublicProfile) {
  return profile(
    await accountRequest(
      '/public-profile',
      'PUT',
      {
        username: body.username,
        display_name: body.display_name,
        bio: body.bio,
        is_public: body.is_public,
        show_ratings: body.show_ratings,
        show_stats: body.show_stats ?? false,
        show_followers: body.show_followers ?? false,
        show_following: body.show_following ?? false,
        top_fives: Object.fromEntries(
          Object.entries(body.top_fives).map(([k, v]) => [k, v.map(rawMedia)]),
        ),
      },
      undefined,
      user,
    ),
  )
}
export async function getReview(
  user: string,
  slug: string,
  signal?: AbortSignal,
) {
  const raw = await accountRequest(
    `/reviews/${encodeURIComponent(slug)}`,
    'GET',
    undefined,
    signal,
    user,
  )
  return raw === null ? null : review(raw)
}
export async function saveReview(
  user: string,
  item: MediaItem,
  body: Pick<Review, 'body' | 'rating' | 'visibility' | 'spoiler'>,
) {
  return review(
    await accountRequest(
      `/reviews/${encodeURIComponent(item.id)}`,
      'PUT',
      { ...body, item: rawMedia(item) },
      undefined,
      user,
    ),
  )
}
export async function deleteReview(user: string, slug: string) {
  await accountRequest(
    `/reviews/${encodeURIComponent(slug)}`,
    'DELETE',
    undefined,
    undefined,
    user,
  )
}
export async function getFeedback(user: string, signal?: AbortSignal) {
  const raw = await accountRequest(
    '/recommendation-feedback',
    'GET',
    undefined,
    signal,
    user,
  )
  if (!Array.isArray(raw)) throw new Error('Ajustes incompletos.')
  return raw.map(feedback)
}
export async function saveFeedback(
  user: string,
  item: MediaItem,
  action: FeedbackAction,
) {
  return feedback(
    await accountRequest(
      `/recommendation-feedback/${encodeURIComponent(item.id)}`,
      'PUT',
      { item: rawMedia(item), action },
      undefined,
      user,
    ),
  )
}
export async function deleteFeedback(user: string, slug: string) {
  await accountRequest(
    `/recommendation-feedback/${encodeURIComponent(slug)}`,
    'DELETE',
    undefined,
    undefined,
    user,
  )
}
async function publicRequest(
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
  const response = await fetch(`${base}/api/v1/profiles/${path}`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'Este perfil não está disponível.'
        : 'Não foi possível abrir este perfil.',
    )
  return response.json()
}
export async function getPublicProfile(username: string, signal?: AbortSignal) {
  return profile(await publicRequest(encodeURIComponent(username), signal))!
}
export interface ProfileConnections {
  items: {
    username: string
    display_name: string
    bio: string
    avatar_url?: string | null
  }[]
  total: number
  limit: number
  offset: number
}
export async function getConnections(
  username: string,
  direction: 'followers' | 'following',
  offset: number,
  signal?: AbortSignal,
): Promise<ProfileConnections> {
  const raw = record(
    await publicRequest(
      `${encodeURIComponent(username)}/connections?direction=${direction}&limit=12&offset=${offset}`,
      signal,
    ),
  )
  if (!Array.isArray(raw.items) || !Number.isInteger(raw.total))
    throw new Error('Não foi possível ler esta lista de perfis.')
  for (const item of raw.items) {
    const person = record(item)
    if (
      typeof person.username !== 'string' ||
      typeof person.display_name !== 'string'
    )
      throw new Error('A lista de perfis chegou incompleta.')
  }
  return raw as unknown as ProfileConnections
}
export async function getActivity(
  username: string,
  offset: number,
  signal?: AbortSignal,
  kind: 'all' | 'reviews' | 'ratings' = 'all',
): Promise<Activity> {
  const raw = record(
    await publicRequest(
      `${encodeURIComponent(username)}/activity?limit=12&offset=${offset}&kind=${kind}`,
      signal,
    ),
  )
  if (!Array.isArray(raw.items) || typeof raw.total !== 'number')
    throw new Error('Avaliações incompletas.')
  return {
    ...raw,
    recent: Array.isArray(raw.recent)
      ? raw.recent.map((entry) => {
          const value = record(entry)
          return { ...value, item: toMediaItem(value.item) }
        })
      : undefined,
    items: raw.items.map((entry) => {
      const value = record(entry)
      return { ...value, item: toMediaItem(value.item) }
    }),
  } as unknown as Activity
}
