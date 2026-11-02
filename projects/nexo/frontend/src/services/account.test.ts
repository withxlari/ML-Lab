import { afterEach, expect, test, vi } from 'vitest'
import seed from '../../../backend/app/data/catalog.json'
import { toMediaItem } from './catalog'
import {
  importAccountItems,
  loadAccountLibrary,
  saveAccountItem,
  updateAccountItem,
  saveTaste,
  finishOnboarding,
  completeAccountItem,
} from './account'
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabase: () => ({ auth: { getSession } }) }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})
function session(id = 'owner') {
  return {
    data: { session: { user: { id }, access_token: 'test-user-token' } },
    error: null,
  }
}

test('completion uses one authenticated write and preserves the explicit opinion without stars', async () => {
  getSession.mockResolvedValue(session())
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        item: seed[0],
        entry: {
          media_key: seed[0]!.slug,
          status: 'completed',
          rating: null,
          is_favorite: false,
          reaction: 'disliked',
        },
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  const completed = await completeAccountItem(
    toMediaItem(seed[0]),
    'disliked',
    'owner',
  )
  expect(completed.library).toEqual({
    status: 'completed',
    rating: null,
    isFavorite: false,
    reaction: 'disliked',
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0]![0]).toContain('/library/completed')
  const options = fetchMock.mock.calls[0]![1]
  expect(options.method).toBe('POST')
  expect(JSON.parse(options.body)).toMatchObject({ reaction: 'disliked' })
  expect(JSON.parse(options.body).rating).toBeUndefined()
})
test('rejects a changed account before sending any private request', async () => {
  getSession.mockResolvedValue(session('another-owner'))
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  await expect(saveAccountItem(toMediaItem(seed[0]), 'owner')).rejects.toThrow(
    'A conta mudou',
  )
  expect(fetchMock).not.toHaveBeenCalled()
})
test('sends the user bearer and preserves creators and UUID when saving', async () => {
  getSession.mockResolvedValue(session())
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(seed[0])))
  vi.stubGlobal('fetch', fetchMock)
  await saveAccountItem(toMediaItem(seed[0]), 'owner')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const options = fetchMock.mock.calls[0]![1]
  expect(options.method).toBe('PUT')
  expect(options.headers.Authorization).toBe('Bearer test-user-token')
  const body = JSON.parse(options.body)
  expect(body.item.id).toBe(seed[0]!.id)
  expect(body.item.creators).toEqual(seed[0]!.creators)
  expect(body.user_id).toBeUndefined()
})
test('stops a multi-batch transfer if the signed-in user changes', async () => {
  getSession
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce(session('other'))
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ imported: 100 })))
  vi.stubGlobal('fetch', fetchMock)
  const items = Array.from({ length: 101 }, () => toMediaItem(seed[0]))
  await expect(importAccountItems(items, 'owner')).rejects.toThrow(
    'A conta mudou',
  )
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
test('does not silently accept an incomplete account library', async () => {
  getSession.mockResolvedValue(session())
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [], total: 1 }))),
  )
  await expect(loadAccountLibrary(undefined, 'owner')).rejects.toThrow(
    'página incompleta',
  )
})
test('restores personal status, rating and favorite with the saved work', async () => {
  getSession.mockResolvedValue(session())
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [seed[0]],
          total: 1,
          entries: [
            {
              media_key: seed[0]!.slug,
              status: 'completed',
              rating: 5,
              is_favorite: true,
            },
          ],
        }),
      ),
    ),
  )
  const items = await loadAccountLibrary(undefined, 'owner')
  expect(items[0]!.library).toEqual({
    status: 'completed',
    rating: 5,
    isFavorite: true,
  })
})
test('clears only the requested rating and leaves other fields out of PATCH', async () => {
  getSession.mockResolvedValue(session())
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        media_key: seed[0]!.slug,
        status: 'completed',
        rating: null,
        is_favorite: true,
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  expect(
    await updateAccountItem(seed[0]!.slug, { rating: null }, 'owner'),
  ).toEqual({ status: 'completed', rating: null, isFavorite: true })
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ rating: null })
})
test('posts a new taste atomically without sending an owner or implicit progress', async () => {
  getSession.mockResolvedValue(session())
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        item: seed[0],
        entry: {
          media_key: seed[0]!.slug,
          status: 'planned',
          rating: 4,
          is_favorite: false,
        },
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  expect(
    (await saveTaste(toMediaItem(seed[0]), { rating: 4 }, 'owner')).library
      ?.rating,
  ).toBe(4)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
  expect(body.rating).toBe(4)
  expect(body.status).toBeUndefined()
  expect(body.user_id).toBeUndefined()
  expect(body.is_favorite).toBeUndefined()
})
test('rejects a changed account before updating onboarding state', async () => {
  getSession.mockResolvedValue(session('other-owner'))
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  await expect(finishOnboarding('skip', 'owner')).rejects.toThrow(
    'A conta mudou',
  )
  expect(fetchMock).not.toHaveBeenCalled()
})
