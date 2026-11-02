import { afterEach, expect, test, vi } from 'vitest'
import seed from '../../../backend/app/data/catalog.json'
import {
  getCatalog,
  getMediaDetails,
  getSavedCatalog,
  toMediaItem,
} from './catalog'
afterEach(() => vi.unstubAllGlobals())
test('adapts API fields, multiple creators and existing browser list identifiers', () => {
  const dark = seed.find((item) => item.slug === 'dark')!
  expect(toMediaItem(dark)).toMatchObject({
    id: 'dark',
    creator: 'Baran bo Odar e Jantje Friese',
  })
  expect(
    toMediaItem({
      ...dark,
      release_year: null,
      creators: [],
      description: null,
      poster_path: null,
    }),
  ).toMatchObject({ year: null, image: '/images/poster-placeholder.svg' })
})
test('rejects malformed data and unsafe links', () => {
  expect(() =>
    toMediaItem({ ...seed[0], source_url: 'javascript:alert(1)' }),
  ).toThrow()
  expect(() =>
    toMediaItem({ ...seed[0], poster_path: '//another-host/image.jpg' }),
  ).toThrow()
  expect(() => toMediaItem({ ...seed[0], release_year: true })).toThrow()
})
test('loads catalog from the API and handles server failures', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ items: seed, total: 8, offset: 0, limit: 24 }),
      ),
    )
  vi.stubGlobal('fetch', fetchMock)
  expect((await getCatalog()).items).toHaveLength(8)
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/v1/media?limit=24&offset=0',
    expect.any(Object),
  )
  fetchMock.mockResolvedValue(new Response('', { status: 503 }))
  await expect(getCatalog()).rejects.toThrow('Não foi possível carregar')
})
test('loads provider-ranked discovery without using the all-time popular search route', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        items: seed.slice(0, 1),
        total: 1,
        limit: 24,
        offset: 0,
        sources: [{ provider: 'tmdb', status: 'ok' }],
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  const result = await getCatalog({ mediaType: 'movie', trending: true })
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/v1/discover?limit=24&offset=0&media_type=movie',
    expect.anything(),
  )
  expect(result.items[0]!.id).toBe(seed[0]!.slug)
})
test('rejects incomplete pagination instead of silently losing titles', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [], total: 2, offset: 0, limit: 24 }),
        ),
      ),
  )
  await expect(getCatalog()).rejects.toThrow('página incompleta')
})
test('requests only the selected page, with server filters, even for a large catalog', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        items: seed.slice(0, 2),
        total: 5000,
        offset: 100,
        limit: 2,
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  const page = await getCatalog({
    mediaType: 'movie',
    query: 'ficção',
    limit: 2,
    offset: 100,
    external: false,
  })
  expect(page.total).toBe(5000)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/v1/media?limit=2&offset=100&media_type=movie&q=fic%C3%A7%C3%A3o',
    expect.any(Object),
  )
})
test('searches external providers instead of limiting a title query to saved catalog data', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [{ ...seed[0], media_type: 'manga', slug: 'kitsu-manga-35' }],
        sources: [
          { provider: 'kitsu', status: 'ok' },
          { provider: 'igdb', status: 'unavailable' },
        ],
        page: 1,
        has_more: true,
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  const page = await getCatalog({ query: 'Naruto', mediaType: 'manga' })
  expect(page.total).toBeNull()
  expect(page.hasMore).toBe(true)
  expect(page.warnings).toEqual(['IGDB'])
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/v1/search?q=Naruto&page=1&media_type=manga',
    expect.any(Object),
  )
})
test('keeps external saved titles available even if they are not imported into the database', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [], total: 0, offset: 0, limit: 100 }),
        ),
      ),
  )
  const external = {
    ...toMediaItem(seed[0]),
    id: 'kitsu-manga-35',
    title: 'Naruto',
    type: 'manga' as const,
  }
  expect(
    (await getSavedCatalog([external.id], {}, undefined, [external])).items,
  ).toEqual([external])
})
test('loads saved items by slug without requiring them on the first catalog page', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ items: [seed[2]], total: 1, offset: 0, limit: 100 }),
      ),
    )
  vi.stubGlobal('fetch', fetchMock)
  expect((await getSavedCatalog(['severance'], {})).items[0]?.id).toBe(
    'severance',
  )
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/v1/media?limit=100&offset=0&slugs=severance',
    expect.any(Object),
  )
})
test('accepts official provider posters and rejects host lookalikes', () => {
  expect(
    toMediaItem({
      ...seed[0],
      poster_path: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    }).image,
  ).toContain('image.tmdb.org')
  expect(() =>
    toMediaItem({
      ...seed[0],
      poster_path: 'https://image.tmdb.org.evil/t/p/w500/abc.jpg',
    }),
  ).toThrow()
})
test('reads Brazilian selection provenance and edition metadata', async () => {
  const book = {
    ...seed[0],
    slug: 'book-isbn-9788501117847',
    media_type: 'book',
    provider: 'google_books',
    provider_entity_type: 'volume',
    external_id: 'AbC_123',
    isbn_13: '9788501117847',
    language: 'pt',
    publisher: 'Galera',
    edition_date: '2022',
    poster_path: 'https://books.google.com/books/content?id=AbC_123&zoom=1',
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [book],
          total: 1,
          limit: 24,
          offset: 0,
          book_selection: {
            source: 'BookInfo',
            source_url: 'https://www.bookinfo.com.br/maisvendidos',
            period_start: '2026-10-19',
            period_end: '2026-10-25',
            checked_at: '2026-10-26T10:00:00Z',
            stale: false,
            selected_count: 1,
          },
        }),
      ),
    ),
  )
  const page = await getCatalog({ mediaType: 'book', trending: true })
  expect(page.bookSelection).toMatchObject({
    source: 'BookInfo',
    from: '2026-10-19',
    selectedCount: 1,
  })
  expect(page.items[0]).toMatchObject({
    provider: 'google_books',
    isbn13: '9788501117847',
    publisher: 'Galera',
  })
})
test('opening Open Library fallback details preserves the exact Brazilian edition and cover', async () => {
  const chosen = {
    ...toMediaItem(seed[3]),
    type: 'book' as const,
    provider: 'open_library' as const,
    entityType: 'work',
    externalId: 'OL123W',
    isbn13: '9788501117847',
    language: 'pt',
    publisher: 'Galera',
    year: 2022,
    image:
      'https://bookinfo-imagens-prod.s3.amazonaws.com/9788501117847-180x240.jpg',
    description: 'Sinopse da edição brasileira.',
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...seed[3],
          release_year: 1965,
          poster_path:
            'https://covers.openlibrary.org/b/id/123-L.jpg?default=false',
          description: 'Older English work description.',
        }),
      ),
    ),
  )
  const result = await getMediaDetails(chosen)
  expect(result).toMatchObject({
    image: chosen.image,
    isbn13: chosen.isbn13,
    year: 2022,
    publisher: 'Galera',
    description: chosen.description,
  })
})
test('details from a different ISBN cannot replace a saved edition', async () => {
  const chosen = {
    ...toMediaItem(seed[3]),
    type: 'book' as const,
    provider: 'google_books' as const,
    entityType: 'volume',
    externalId: 'AbC',
    isbn13: '9788501117847',
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...seed[3],
          isbn_13: '9780441172719',
        }),
      ),
    ),
  )
  await expect(getMediaDetails(chosen)).rejects.toThrow('outra edição')
})
