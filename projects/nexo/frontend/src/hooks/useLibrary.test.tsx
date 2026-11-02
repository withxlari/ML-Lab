import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import seed from '../../../backend/app/data/catalog.json'
import { toMediaItem } from '../services/catalog'
import { useLibrary } from './useLibrary'
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  importItems: vi.fn(),
  clear: vi.fn(),
  page: vi.fn(),
  taste: vi.fn(),
  complete: vi.fn(),
  owner: 'owner' as string | null,
  save: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('./auth-context', () => ({
  useAuth: () => ({
    session: mocks.owner ? { user: { id: mocks.owner } } : null,
    loading: false,
  }),
}))
vi.mock('./usePreferences', () => ({
  useSavedMedia: () => ({
    saved: ['interstellar'],
    savedSnapshots: [],
    clearSaved: mocks.clear,
  }),
}))
vi.mock('../services/account', () => ({
  loadAccountLibrary: mocks.load,
  importAccountItems: mocks.importItems,
  saveAccountItem: mocks.save,
  removeAccountItem: mocks.remove,
  updateAccountItem: vi.fn(),
  saveTaste: mocks.taste,
  completeAccountItem: mocks.complete,
}))
vi.mock('../services/catalog', async (original) => ({
  ...(await original<object>()),
  getSavedCatalog: mocks.page,
}))
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.owner = 'owner'
})
test('rejects every library write without an account and hides legacy guest entries', async () => {
  mocks.owner = null
  const { result } = renderHook(() => useLibrary(), { wrapper })
  const item = toMediaItem(seed[0])
  await expect(result.current.toggleSaved(item)).rejects.toThrow(
    'Entre ou crie uma conta',
  )
  await expect(
    result.current.updateFeedback(item, { rating: 5 }),
  ).rejects.toThrow('Entre na sua conta')
  await expect(
    result.current.chooseTaste(item, { isFavorite: true }),
  ).rejects.toThrow('Entre na conta')
  await expect(result.current.markCompleted(item, 'liked')).rejects.toThrow(
    'Entre na conta',
  )
  expect(mocks.complete).not.toHaveBeenCalled()
  expect(result.current.saved).toEqual([])
  expect(mocks.save).not.toHaveBeenCalled()
  expect(mocks.taste).not.toHaveBeenCalled()
})
test('signed-in members can save and remove acknowledged works', async () => {
  const item = toMediaItem(seed[0])
  mocks.load.mockResolvedValue([])
  mocks.save.mockResolvedValue(item)
  mocks.remove.mockResolvedValue(undefined)
  const { result } = renderHook(() => useLibrary(), { wrapper })
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => result.current.toggleSaved(item))
  expect(mocks.save).toHaveBeenCalledWith(item, 'owner')
  expect(result.current.saved).toContain(item.id)
  await act(async () => result.current.toggleSaved(item))
  expect(mocks.remove).toHaveBeenCalledWith(item.id, 'owner')
  expect(result.current.saved).toEqual([])
})

test('completion adds the acknowledged work to the account library and can fail without changing it', async () => {
  const item = toMediaItem(seed[0])
  mocks.load.mockResolvedValue([])
  mocks.complete.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
    ...item,
    library: {
      status: 'completed',
      rating: null,
      isFavorite: false,
      reaction: 'liked',
    },
  })
  const { result } = renderHook(() => useLibrary(), { wrapper })
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => {
    await expect(result.current.markCompleted(item, 'liked')).rejects.toThrow(
      'offline',
    )
  })
  expect(result.current.saved).toEqual([])
  await act(async () => result.current.markCompleted(item, 'liked'))
  expect(mocks.complete).toHaveBeenCalledWith(item, 'liked', 'owner')
  expect(result.current.savedSnapshots[0]?.library).toMatchObject({
    status: 'completed',
    rating: null,
    reaction: 'liked',
  })
})
test('replaces the account cache only with acknowledged taste data', async () => {
  const item = toMediaItem(seed[0])
  mocks.load.mockResolvedValue([])
  mocks.taste.mockResolvedValue({
    ...item,
    library: { status: 'planned', rating: 4, isFavorite: false },
  })
  const { result } = renderHook(() => useLibrary(), { wrapper })
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => {
    await result.current.chooseTaste(item, { rating: 4 })
  })
  expect(mocks.taste).toHaveBeenCalledWith(item, { rating: 4 }, 'owner')
  expect(result.current.savedSnapshots[0]?.library?.rating).toBe(4)
})
test('preserves the browser list when the account copy cannot be verified', async () => {
  mocks.load.mockResolvedValue([])
  mocks.page.mockResolvedValue({ items: [toMediaItem(seed[0])] })
  mocks.importItems.mockResolvedValue(undefined)
  const { result } = renderHook(() => useLibrary(), { wrapper })
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => {
    await expect(result.current.importGuest()).rejects.toThrow(
      'lista local foi preservada',
    )
  })
  expect(mocks.clear).not.toHaveBeenCalled()
})
test('clears the browser copy only after the account confirms every title', async () => {
  const item = toMediaItem(seed[0])
  mocks.load.mockResolvedValueOnce([]).mockResolvedValue([item])
  mocks.page.mockResolvedValue({ items: [item] })
  mocks.importItems.mockResolvedValue(undefined)
  const { result } = renderHook(() => useLibrary(), { wrapper })
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => {
    await result.current.importGuest()
  })
  expect(mocks.importItems).toHaveBeenCalledWith([item], 'owner')
  expect(mocks.clear).toHaveBeenCalledTimes(1)
  expect(mocks.clear.mock.invocationCallOrder[0]!).toBeGreaterThan(
    mocks.load.mock.invocationCallOrder[1]!,
  )
})
