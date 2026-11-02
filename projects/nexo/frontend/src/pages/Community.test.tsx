import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AuthContext } from '../hooks/auth-context'
import { TasteSettingsPage } from './TasteSettingsPage'
import { ProfileSettingsPage, PublicProfilePage } from './ProfilePage'
import { ReviewEditor } from '../components/ReviewEditor'
import * as community from '../services/community'
import { toMediaItem } from '../services/catalog'
import seed from '../../../backend/app/data/catalog.json'
import type { useLibrary } from '../hooks/useLibrary'
vi.mock('../services/community', async () => ({
  ...(await vi.importActual('../services/community')),
  getTastes: vi.fn(),
  saveTastes: vi.fn(),
  getFeedback: vi.fn(),
  getOwnProfile: vi.fn(),
  saveProfile: vi.fn(),
  getPublicProfile: vi.fn(),
  getActivity: vi.fn(),
  getConnections: vi.fn(),
  getReview: vi.fn(),
  saveReview: vi.fn(),
}))
const item = toMediaItem(seed[0])
const another = toMediaItem(seed[1])
const profile: community.PublicProfile = {
  username: 'tester',
  display_name: 'Test Reader',
  bio: 'Leio de tudo.',
  is_public: true,
  show_ratings: false,
  top_fives: { movie: [item, another] },
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(community.getTastes).mockResolvedValue({
    categories: {},
    like_text: '',
    avoid_text: '',
  })
  vi.mocked(community.getFeedback).mockResolvedValue([])
  vi.mocked(community.getOwnProfile).mockResolvedValue(null)
  vi.mocked(community.getReview).mockResolvedValue(null)
})
function page(children: ReactNode, path = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <AuthContext
        value={{
          session: { user: { id: 'owner' } } as Session,
          configured: true,
          loading: false,
          signOut: vi.fn(),
        }}
      >
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
      </AuthContext>
    </QueryClientProvider>,
  )
}
test('taste categories keep their details separate and save private positive and negative text', async () => {
  const user = userEvent.setup()
  page(<TasteSettingsPage />)
  await screen.findByText('Seus gostos, com detalhes.')
  await user.type(
    screen.getByLabelText('Gêneros e subgêneros que gosto'),
    'suspense psicológico{Enter}',
  )
  await user.click(screen.getByRole('button', { name: 'Jogos' }))
  expect(
    screen.queryByRole('button', { name: 'Remover suspense psicológico' }),
  ).not.toBeInTheDocument()
  await user.type(
    screen.getByLabelText('O que gosto de encontrar'),
    'Mistérios sem pressa.',
  )
  await user.type(
    screen.getByLabelText('O que prefiro evitar'),
    'Competição esportiva.',
  )
  await user.click(screen.getByRole('button', { name: 'Salvar meus gostos' }))
  await waitFor(() =>
    expect(community.saveTastes).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({
        categories: expect.objectContaining({
          movie: expect.objectContaining({
            liked_genres: ['suspense psicológico'],
          }),
        }),
        like_text: 'Mistérios sem pressa.',
        avoid_text: 'Competição esportiva.',
      }),
    ),
  )
})
test('new profiles are private by default and Top 5 preserves chosen order', async () => {
  const user = userEvent.setup()
  const library = {
    savedSnapshots: [item, another],
    loading: false,
    error: null,
  } as unknown as ReturnType<typeof useLibrary>
  vi.mocked(community.saveProfile).mockImplementation(
    async (_user, data) => data,
  )
  page(<ProfileSettingsPage library={library} />)
  await screen.findByText('Seu perfil no Nexo.')
  expect(screen.getByLabelText(/Publicar meu perfil/)).not.toBeChecked()
  expect(screen.getByLabelText(/Mostrar também minhas notas/)).not.toBeChecked()
  expect(screen.getByLabelText(/Mostrar meus totais/)).not.toBeChecked()
  expect(screen.getByLabelText(/Mostrar meus seguidores/)).not.toBeChecked()
  expect(screen.getByLabelText(/Mostrar quem eu sigo/)).not.toBeChecked()
  await user.type(screen.getByLabelText('Nome no perfil'), 'Test Reader')
  await user.type(
    screen.getByRole('textbox', { name: /^Nome de usuário/ }),
    'tester',
  )
  await user.click(screen.getByRole('button', { name: new RegExp(item.title) }))
  await user.click(
    screen.getByRole('button', { name: new RegExp(another.title) }),
  )
  await user.click(
    screen.getByRole('button', { name: `Subir ${another.title}` }),
  )
  await user.click(
    screen.getByRole('button', { name: 'Salvar perfil e favoritos' }),
  )
  await waitFor(() =>
    expect(community.saveProfile).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({
        is_public: false,
        show_ratings: false,
        top_fives: { movie: [another, item] },
      }),
    ),
  )
})
test('public profile shows selected works and keeps spoilers folded', async () => {
  vi.mocked(community.getPublicProfile).mockResolvedValue(profile)
  vi.mocked(community.getActivity).mockResolvedValue({
    items: [
      {
        item,
        rating: 5,
        body: 'Spoiler escrito.',
        spoiler: true,
        updated_at: '2026-11-01T00:00:00Z',
      },
    ],
    total: 1,
    offset: 0,
    limit: 12,
  })
  page(
    <Routes>
      <Route
        path="/u/:username"
        element={<PublicProfilePage onOpen={vi.fn()} />}
      />
    </Routes>,
    '/u/tester',
  )
  await screen.findByRole('heading', { name: 'Test Reader' })
  const disclosure = await screen.findByText(
    'Contém spoilers · mostrar avaliação',
  )
  expect(disclosure.closest('details')).not.toHaveAttribute('open')
  expect(screen.queryByText('owner')).not.toBeInTheDocument()
  expect(community.getConnections).not.toHaveBeenCalled()
})
test('profile stats expose totals and load public connections only when requested', async () => {
  vi.mocked(community.getPublicProfile).mockResolvedValue({
    ...profile,
    show_stats: true,
    show_followers: true,
    show_following: false,
    stats: { explored: 19, favorites: 10, followers: 2, following: null },
  })
  vi.mocked(community.getActivity).mockResolvedValue({
    items: [],
    total: 0,
    limit: 12,
    offset: 0,
  })
  vi.mocked(community.getConnections).mockResolvedValue({
    items: [{ username: 'another', display_name: 'Outra pessoa', bio: '' }],
    total: 1,
    limit: 12,
    offset: 0,
  })
  page(
    <Routes>
      <Route
        path="/u/:username"
        element={<PublicProfilePage onOpen={vi.fn()} />}
      />
    </Routes>,
    '/u/tester',
  )
  await screen.findByText('obras exploradas')
  expect(screen.getByText('19')).toBeInTheDocument()
  expect(screen.getByText('10')).toBeInTheDocument()
  expect(screen.queryByText('seguindo')).not.toBeInTheDocument()
  expect(community.getConnections).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: /2 seguidores/ }))
  expect(
    await screen.findByRole('link', { name: /Outra pessoa/ }),
  ).toHaveAttribute('href', '/u/another')
  expect(community.getConnections).toHaveBeenCalledTimes(1)
})
test('written reviews default to private and submit the current library rating atomically', async () => {
  const user = userEvent.setup()
  vi.mocked(community.saveReview).mockResolvedValue({
    media_key: item.id,
    item,
    body: 'Gostei dos personagens.',
    rating: 4,
    visibility: 'private',
    spoiler: false,
    updated_at: '2026-11-01T00:00:00Z',
  })
  page(<ReviewEditor item={item} rating={4} />)
  await screen.findByText('O que ficou com você?')
  expect(screen.getByRole('radio', { name: 'Só eu' })).toBeChecked()
  await user.type(
    screen.getByLabelText('Sua avaliação'),
    'Gostei dos personagens.',
  )
  await user.click(screen.getByRole('button', { name: 'Salvar avaliação' }))
  await waitFor(() =>
    expect(community.saveReview).toHaveBeenCalledWith('owner', item, {
      body: 'Gostei dos personagens.',
      rating: 4,
      visibility: 'private',
      spoiler: false,
    }),
  )
})
