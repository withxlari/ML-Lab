import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthContext } from '../hooks/auth-context'
import { PeopleSuggestions, FollowingPage } from './PeoplePage'
import { FollowButton } from '../components/FollowButton'
import * as people from '../services/people'
import type { ReactNode } from 'react'
vi.mock('../services/people', () => ({
  searchPeople: vi.fn(),
  getPeople: vi.fn(),
  getFollowing: vi.fn(),
  getFollowStatus: vi.fn(),
  followPerson: vi.fn(),
  unfollowPerson: vi.fn(),
}))
const person = {
  username: 'reader',
  display_name: 'Leitora',
  bio: 'Histórias que ficam.',
  avatar_url: null,
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(people.getFollowStatus).mockResolvedValue({
    following: false,
    followed_id: 'target',
    is_self: false,
  })
  vi.mocked(people.followPerson).mockResolvedValue({
    following: true,
    followed_id: 'target',
    is_self: false,
  })
  vi.mocked(people.unfollowPerson).mockResolvedValue(undefined)
  vi.mocked(people.getPeople).mockResolvedValue({
    status: 'ready',
    items: [
      {
        profile: person,
        reason: 'Vocês gostaram de Duna.',
        shared_items: [],
        shared_genres: [],
      },
    ],
    total: 1,
    limit: 12,
    offset: 0,
  })
})
function page(children: ReactNode, user: string | null = 'owner') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
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
        <MemoryRouter>{children}</MemoryRouter>
      </AuthContext>
    </QueryClientProvider>
  )
  const view = render(tree(user))
  return { ...view, changeUser: (id: string | null) => view.rerender(tree(id)) }
}
test('shows real connection reasons and a link to the public profile', async () => {
  page(<PeopleSuggestions />)
  await screen.findByRole('heading', { name: 'Leitora' })
  expect(screen.getByText('Vocês gostaram de Duna.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver perfil →' })).toHaveAttribute(
    'href',
    '/u/reader',
  )
  expect(screen.getByRole('link', { name: 'Perfis que sigo' })).toHaveAttribute(
    'href',
    '/following',
  )
})

test('guests can search public usernames without loading personal suggestions', async () => {
  vi.mocked(people.searchPeople).mockResolvedValue({
    status: undefined,
    items: [person],
    total: 1,
    limit: 12,
    offset: 0,
  })
  page(<PeopleSuggestions />, null)
  const user = userEvent.setup()
  const input = screen.getByRole('searchbox', {
    name: 'Buscar pessoas por nome ou usuário',
  })
  await user.type(input, '@r')
  expect(
    screen.getByText('Digite pelo menos dois caracteres.'),
  ).toBeInTheDocument()
  expect(people.searchPeople).not.toHaveBeenCalled()
  await user.type(input, 'eader')
  await screen.findByRole('heading', { name: 'Leitora' })
  expect(people.searchPeople).toHaveBeenCalledWith(
    'reader',
    0,
    expect.any(AbortSignal),
  )
  expect(people.getPeople).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'Ver perfil →' })).toHaveAttribute(
    'href',
    '/u/reader',
  )
  await user.clear(input)
  expect(
    screen.getByText('Encontre outras estantes para explorar.'),
  ).toBeInTheDocument()
})

test('public search pages and failures have usable controls', async () => {
  vi.mocked(people.searchPeople).mockResolvedValue({
    status: undefined,
    items: [person],
    total: 13,
    limit: 12,
    offset: 0,
  })
  page(<PeopleSuggestions />)
  await userEvent.type(screen.getByRole('searchbox'), 'reader')
  await screen.findByText('13 perfis encontrados')
  vi.mocked(people.searchPeople).mockRejectedValue(new Error('offline'))
  await userEvent.click(screen.getByRole('button', { name: 'Próximos' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não conseguimos buscar agora.',
  )
  expect(people.searchPeople).toHaveBeenLastCalledWith(
    'reader',
    12,
    expect.any(AbortSignal),
  )
})
test('following and unfollowing use the current account and update the button', async () => {
  page(<FollowButton username="reader" />)
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Seguir @reader' }),
  )
  await screen.findByRole('button', { name: 'Deixar de seguir @reader' })
  expect(people.followPerson).toHaveBeenCalledWith('owner', 'reader')
  await user.click(
    screen.getByRole('button', { name: 'Deixar de seguir @reader' }),
  )
  await waitFor(() =>
    expect(people.unfollowPerson).toHaveBeenCalledWith('owner', 'target'),
  )
})
test('does not request private recommendations for guests', () => {
  page(<PeopleSuggestions />, null)
  expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
    'href',
    '/account',
  )
  expect(people.getPeople).not.toHaveBeenCalled()
})
test('empty communities show an honest explanation without invented profiles', async () => {
  vi.mocked(people.getPeople).mockResolvedValue({
    status: 'no_matches',
    items: [],
    total: 0,
    limit: 12,
    offset: 0,
  })
  page(<PeopleSuggestions />)
  await screen.findByText('Ainda não encontramos uma conexão por aqui.')
  expect(
    screen.queryByRole('heading', { name: 'Leitora' }),
  ).not.toBeInTheDocument()
})
test('closed profiles remain removable without exposing private information', async () => {
  vi.mocked(people.getFollowing).mockResolvedValue({
    items: [{ followed_id: 'closed', profile: null }],
    total: 1,
    limit: 12,
    offset: 0,
  })
  page(<FollowingPage />)
  await screen.findByText('Perfil indisponível')
  await userEvent.click(
    screen.getByRole('button', { name: 'Deixar de seguir' }),
  )
  await waitFor(() =>
    expect(people.unfollowPerson).toHaveBeenCalledWith('owner', 'closed'),
  )
})
test('the follow action is hidden on the own public profile', async () => {
  vi.mocked(people.getFollowStatus).mockResolvedValue({
    following: false,
    followed_id: 'owner',
    is_self: true,
  })
  page(<FollowButton username="myself" />)
  await waitFor(() => expect(people.getFollowStatus).toHaveBeenCalled())
  await waitFor(() =>
    expect(screen.queryByRole('button')).not.toBeInTheDocument(),
  )
})
