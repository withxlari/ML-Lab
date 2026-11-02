import { expect, test } from 'vitest'
import seed from '../../../backend/app/data/catalog.json'
import { toMediaItem } from '../services/catalog'
import { libraryPage, statusLabel } from './library'
test('combines personal filters with title/type search before pagination', () => {
  const items = seed.map((row, index) => ({
    ...toMediaItem(row),
    library: {
      status: 'completed' as const,
      rating: index % 2 ? 4 : null,
      isFavorite: index % 2 === 0,
    },
  }))
  const expected = items.filter(
    (item) => item.library.isFavorite && item.type === 'movie',
  )
  const page = libraryPage(items, {
    status: 'completed',
    favoritesOnly: true,
    mediaType: 'movie',
    limit: 1,
    offset: 1,
  })
  expect(page.total).toBe(expected.length)
  expect(page.items).toEqual(expected.slice(1, 2))
  expect(
    libraryPage(items, {
      status: 'paused',
      favoritesOnly: false,
      limit: 24,
      offset: 0,
    }).items,
  ).toEqual([])
})
test('finds accented titles in saved snapshots without querying providers', () => {
  const page = libraryPage(seed.map(toMediaItem), {
    status: 'all',
    favoritesOnly: false,
    query: 'ficcao',
    limit: 24,
    offset: 0,
  })
  expect(page.total).toBe(6)
})
test('uses natural progress labels for each category', () => {
  expect(statusLabel('planned', 'movie')).toBe('Quero ver')
  expect(statusLabel('in_progress', 'manga')).toBe('Lendo')
  expect(statusLabel('in_progress', 'game')).toBe('Jogando')
})
