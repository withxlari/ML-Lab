import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import seed from '../../../backend/app/data/catalog.json'
import { toMediaItem } from '../services/catalog'
import { AuthContext } from '../hooks/auth-context'
import { getRecommendations } from '../services/recommendations'
import type { Recommendations } from '../services/recommendations'
import type { useLibrary } from '../hooks/useLibrary'
import type { MediaItem } from '../data/selection'
import { RecommendationsPage } from './RecommendationsPage'
import { saveFeedback, deleteFeedback } from '../services/community'
vi.mock('../services/recommendations', () => ({ getRecommendations: vi.fn() }))
vi.mock('./PeoplePage', () => ({ PeopleSuggestions: () => null }))
vi.mock('../services/community', () => ({
  saveFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
}))
const item = toMediaItem(seed[0])
const ready: Recommendations = {
  status: 'ready',
  catalogSize: 68,
  total: 1,
  items: [
    {
      item,
      score: 0.4,
      reasons: [
        {
          description:
            'Você deu 5 estrelas a Duna. Tem ficção científica em comum.',
          sourceSlug: 'dune-book',
          sourceTitle: 'Duna',
        },
      ],
    },
  ],
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getRecommendations).mockResolvedValue(ready)
  vi.mocked(saveFeedback).mockResolvedValue({
    item,
    media_key: item.id,
    action: 'already_known',
    updated_at: '2026-11-01T00:00:00Z',
  })
  vi.mocked(deleteFeedback).mockResolvedValue(undefined)
})

test('a missing source cover stays inside the thumbnail slot beside its reason', async () => {
  const source = {
    ...item,
    id: 'source-book',
    type: 'book' as const,
    title: 'Livro de origem',
    image: 'https://covers.openlibrary.org/b/id/missing.jpg',
  }
  vi.mocked(getRecommendations).mockResolvedValue({
    ...ready,
    items: [
      {
        ...ready.items[0]!,
        reasons: [
          {
            description: 'A partir do livro de origem.',
            sourceSlug: source.id,
            sourceTitle: source.title,
          },
        ],
      },
    ],
  })
  page({ resultLibrary: { savedSnapshots: [source] } })
  const image = await screen.findByAltText('Capa de Livro de origem')
  fireEvent.error(image)
  const fallback = screen.getByRole('img', {
    name: 'Capa indisponível: Livro de origem',
    hidden: true,
  })
  expect(fallback.parentElement).toHaveClass('reason-cover')
  expect(screen.getByText('A partir do livro de origem.')).toBeInTheDocument()
})

test.each([
  ['Gostei', 'liked'],
  ['Não gostei', 'disliked'],
  ['Só marcar como concluído', null],
])(
  'records completion with %s independently of recommendation feedback',
  async (label, reaction) => {
    const markCompleted = vi.fn().mockResolvedValue(undefined)
    page({ resultLibrary: { markCompleted } })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Já assisti' }),
    )
    await userEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() =>
      expect(markCompleted).toHaveBeenCalledWith(item, reaction),
    )
    expect(saveFeedback).not.toHaveBeenCalled()
    expect(await screen.findByRole('link', { name: /lista/i })).toHaveAttribute(
      'href',
      '/library',
    )
  },
)

test.each([
  ['book', 'Já li'],
  ['manga', 'Já li'],
  ['game', 'Já joguei'],
])(
  'uses the completion action for %s and preserves errors',
  async (type, label) => {
    vi.mocked(getRecommendations).mockResolvedValue({
      ...ready,
      items: [
        {
          ...ready.items[0]!,
          item: { ...item, type: type as MediaItem['type'] },
        },
      ],
    })
    const markCompleted = vi
      .fn()
      .mockRejectedValue(new Error('Falhou ao guardar.'))
    page({ resultLibrary: { markCompleted } })
    await userEvent.click(await screen.findByRole('button', { name: label }))
    await userEvent.click(screen.getByRole('button', { name: 'Gostei' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falhou ao guardar.',
    )
    expect(
      screen.getByRole('button', { name: 'Não gostei' }),
    ).toBeInTheDocument()
  },
)
test('feedback survives removal of a suggestion and can be undone', async () => {
  const user = userEvent.setup()
  page()
  await screen.findByText(ready.items[0]!.reasons[0]!.description)
  vi.mocked(getRecommendations).mockResolvedValue({
    ...ready,
    status: 'no_matches',
    items: [],
    total: 0,
  })
  await user.click(screen.getByText('Ajustar sugestões'))
  await user.click(screen.getByRole('button', { name: 'Já conheço' }))
  expect(saveFeedback).toHaveBeenCalledWith('owner', item, 'already_known')
  await screen.findByRole('button', { name: 'Desfazer' })
  await waitFor(() =>
    expect(screen.queryByText('Ajustar sugestões')).not.toBeInTheDocument(),
  )
  await user.click(screen.getByRole('button', { name: 'Desfazer' }))
  await waitFor(() =>
    expect(deleteFeedback).toHaveBeenCalledWith('owner', item.id),
  )
})
function page({
  userId = 'owner',
  resultLibrary = {},
  onOpen = vi.fn(),
  onSave = vi.fn().mockResolvedValue(undefined),
}: {
  userId?: string | null
  resultLibrary?: Partial<ReturnType<typeof useLibrary>>
  onOpen?: (item: MediaItem) => void
  onSave?: (item: MediaItem) => Promise<void>
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const library = {
    saved: [],
    savedSnapshots: [],
    pending: false,
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...resultLibrary,
  } as unknown as ReturnType<typeof useLibrary>
  const tree = (id: string | null) => (
    <QueryClientProvider client={client}>
      <AuthContext
        value={{
          session: id ? ({ user: { id } } as Session) : null,
          loading: false,
          configured: true,
          signOut: vi.fn(),
        }}
      >
        <MemoryRouter>
          <RecommendationsPage
            library={library}
            onOpen={onOpen}
            onSave={onSave}
          />
        </MemoryRouter>
      </AuthContext>
    </QueryClientProvider>
  )
  const view = render(tree(userId))
  return {
    ...view,
    changeUser: (id: string) => view.rerender(tree(id)),
    onOpen,
    onSave,
  }
}
test('guest is invited to sign in without requesting private suggestions', () => {
  page({ userId: null })
  expect(
    screen.getByRole('link', { name: /Entrar para ver sugestões/ }),
  ).toHaveAttribute('href', '/account')
  expect(getRecommendations).not.toHaveBeenCalled()
})
test('shows loading without displaying an old personal result', async () => {
  vi.mocked(getRecommendations).mockImplementation(() => new Promise(() => {}))
  page()
  expect(screen.getByRole('status')).toHaveTextContent(
    'Encontrando novas possibilidades',
  )
  expect(screen.queryByText(/Você deu 5 estrelas/)).not.toBeInTheDocument()
})
test('shows faithful reasons and uses the existing detail/save actions', async () => {
  const view = page()
  expect(
    await screen.findByText(ready.items[0]!.reasons[0]!.description),
  ).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', {
      name: `Ver detalhes de ${item.title}, filme`,
    }),
  )
  expect(view.onOpen).toHaveBeenCalledWith(item)
  await userEvent.click(
    screen.getByRole('button', { name: `Guardar ${item.title}, filme` }),
  )
  expect(view.onSave).toHaveBeenCalledWith(item)
  await userEvent.click(screen.getByRole('button', { name: 'Como escolhemos' }))
  expect(screen.getByText(/Notas 1 e 2 reduzem/)).toBeInTheDocument()
})
test('has a recovery action after a failed request', async () => {
  vi.mocked(getRecommendations)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(ready)
  page()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'As sugestões não carregaram',
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Tentar novamente' }),
  )
  expect(
    await screen.findByText(ready.items[0]!.reasons[0]!.description),
  ).toBeInTheDocument()
})
test.each(['needs_tastes', 'no_matches'] as const)(
  'handles empty results honestly: %s',
  async (status) => {
    vi.mocked(getRecommendations).mockResolvedValue({
      status,
      catalogSize: 68,
      total: 0,
      items: [],
    })
    page()
    expect(
      await screen.findByRole('heading', {
        name:
          status === 'needs_tastes'
            ? 'Conte um pouco do que você gosta.'
            : 'Ainda não encontramos uma boa conexão por aqui.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Ver detalhes/ }),
    ).not.toBeInTheDocument()
  },
)
test('filters games and pins each request to the current account', async () => {
  page()
  await screen.findByText(ready.items[0]!.reasons[0]!.description)
  await userEvent.click(screen.getByRole('button', { name: 'Jogos' }))
  await waitFor(() =>
    expect(getRecommendations).toHaveBeenLastCalledWith(
      'owner',
      'game',
      expect.any(AbortSignal),
      0,
    ),
  )
})
test('switching accounts immediately hides reasons from the previous account', async () => {
  const view = page()
  await screen.findByText(ready.items[0]!.reasons[0]!.description)
  vi.mocked(getRecommendations).mockImplementation(() => new Promise(() => {}))
  view.changeUser('other-owner')
  expect(
    screen.queryByText(ready.items[0]!.reasons[0]!.description),
  ).not.toBeInTheDocument()
  await waitFor(() =>
    expect(getRecommendations).toHaveBeenLastCalledWith(
      'other-owner',
      undefined,
      expect.any(AbortSignal),
      0,
    ),
  )
})
test('refresh loads the next suggestions and returns to the beginning after the final batch', async () => {
  const next = toMediaItem(seed[1])
  const first = { ...ready, offset: 0, total: 2, hasMore: true }
  const second = {
    ...ready,
    offset: 1,
    total: 2,
    hasMore: false,
    items: [{ ...ready.items[0]!, item: next }],
  }
  vi.mocked(getRecommendations)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second)
    .mockResolvedValue(first)
  page()
  await screen.findByRole('heading', { name: item.title })
  await userEvent.click(
    screen.getByRole('button', { name: 'Atualizar sugestões' }),
  )
  await screen.findByRole('heading', { name: next.title })
  expect(
    screen.queryByRole('heading', { name: item.title }),
  ).not.toBeInTheDocument()
  expect(getRecommendations).toHaveBeenLastCalledWith(
    'owner',
    undefined,
    expect.any(AbortSignal),
    1,
  )
  expect(screen.getByRole('status')).toHaveTextContent(
    'Novas sugestões carregadas.',
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Atualizar sugestões' }),
  )
  await screen.findByRole('heading', { name: item.title })
  expect(getRecommendations).toHaveBeenLastCalledWith(
    'owner',
    undefined,
    expect.any(AbortSignal),
    0,
  )
  expect(screen.getByRole('status')).toHaveTextContent('Voltamos às primeiras.')
})
test('refresh explains when all available suggestions are already visible', async () => {
  page()
  await screen.findByRole('heading', { name: item.title })
  await userEvent.click(
    screen.getByRole('button', { name: 'Atualizar sugestões' }),
  )
  expect(await screen.findByRole('status')).toHaveTextContent(
    'todas as sugestões disponíveis para este filtro',
  )
  expect(screen.getByRole('heading', { name: item.title })).toBeInTheDocument()
})
test('failed refresh keeps the previous suggestions and retries the same next batch', async () => {
  const next = toMediaItem(seed[1])
  vi.mocked(getRecommendations)
    .mockResolvedValueOnce({ ...ready, offset: 0, total: 2, hasMore: true })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({
      ...ready,
      offset: 1,
      total: 2,
      hasMore: false,
      items: [{ ...ready.items[0]!, item: next }],
    })
  page()
  await screen.findByRole('heading', { name: item.title })
  await userEvent.click(
    screen.getByRole('button', { name: 'Atualizar sugestões' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'As sugestões anteriores continuam aqui',
  )
  expect(screen.getByRole('heading', { name: item.title })).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Atualizar sugestões' }),
  )
  await screen.findByRole('heading', { name: next.title })
  expect(getRecommendations).toHaveBeenLastCalledWith(
    'owner',
    undefined,
    expect.any(AbortSignal),
    1,
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
test('filters and account switches start at the first batch after refreshing', async () => {
  vi.mocked(getRecommendations).mockResolvedValue({
    ...ready,
    offset: 0,
    total: 2,
    hasMore: true,
  })
  const view = page()
  await screen.findByRole('heading', { name: item.title })
  vi.mocked(getRecommendations).mockResolvedValue({
    ...ready,
    offset: 1,
    total: 2,
    hasMore: false,
  })
  await userEvent.click(
    screen.getByRole('button', { name: 'Atualizar sugestões' }),
  )
  await screen.findByRole('status')
  await userEvent.click(screen.getByRole('button', { name: 'Jogos' }))
  await waitFor(() =>
    expect(getRecommendations).toHaveBeenLastCalledWith(
      'owner',
      'game',
      expect.any(AbortSignal),
      0,
    ),
  )
  view.changeUser('other-owner')
  await waitFor(() =>
    expect(getRecommendations).toHaveBeenLastCalledWith(
      'other-owner',
      'game',
      expect.any(AbortSignal),
      0,
    ),
  )
  await screen.findByRole('heading', { name: item.title })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
