import { beforeEach, expect, test, vi } from 'vitest'
import seed from '../../../backend/app/data/catalog.json'
import { accountRequest } from './account'
import { getRecommendations } from './recommendations'
vi.mock('./account', () => ({ accountRequest: vi.fn() }))
const result = {
  status: 'ready',
  catalog_size: 68,
  total: 1,
  items: [
    {
      item: seed[0],
      score: 0.4,
      reasons: [
        {
          description: 'Ficção científica em comum.',
          source_slug: 'dune-book',
          source_title: 'Duna',
        },
      ],
    },
  ],
}
beforeEach(() => vi.resetAllMocks())
test('uses the authenticated request and validates the complete suggestion', async () => {
  vi.mocked(accountRequest).mockResolvedValue(result)
  const data = await getRecommendations('owner', 'game')
  expect(accountRequest).toHaveBeenCalledWith(
    '/recommendations?limit=12&strategy=personalized&media_type=game',
    'GET',
    undefined,
    undefined,
    'owner',
  )
  expect(data.items[0]!.item.id).toBe(seed[0]!.slug)
  expect(data.items[0]!.reasons[0]!.sourceTitle).toBe('Duna')
})
test('rejects a score that could be mistaken for a probability outside the contract', async () => {
  vi.mocked(accountRequest).mockResolvedValue({
    ...result,
    items: [{ ...result.items[0], score: 200 }],
  })
  await expect(getRecommendations('owner')).rejects.toThrow()
})
test('requests the next batch and reads the server position and remaining results', async () => {
  vi.mocked(accountRequest).mockResolvedValue({
    ...result,
    total: 25,
    offset: 12,
    has_more: true,
  })
  const signal = new AbortController().signal
  const data = await getRecommendations('owner', 'game', signal, 12)
  expect(accountRequest).toHaveBeenCalledWith(
    '/recommendations?limit=12&strategy=personalized&media_type=game&offset=12',
    'GET',
    undefined,
    signal,
    'owner',
  )
  expect(data).toMatchObject({ offset: 12, hasMore: true })
})
test.each([
  { offset: -1 },
  { offset: 0.5 },
  { has_more: 'yes' },
  { offset: 12, total: 1 },
  { has_more: true },
])('rejects invalid pagination metadata: %j', async (metadata) => {
  vi.mocked(accountRequest).mockResolvedValue({ ...result, ...metadata })
  await expect(getRecommendations('owner')).rejects.toThrow()
})
test('rejects ready results with no explanation or duplicated suggestions', async () => {
  vi.mocked(accountRequest).mockResolvedValue({
    ...result,
    items: [{ ...result.items[0], reasons: [] }],
  })
  await expect(getRecommendations('owner')).rejects.toThrow()
  vi.mocked(accountRequest).mockResolvedValue({
    ...result,
    total: 2,
    items: [result.items[0], result.items[0]],
  })
  await expect(getRecommendations('owner')).rejects.toThrow()
})
