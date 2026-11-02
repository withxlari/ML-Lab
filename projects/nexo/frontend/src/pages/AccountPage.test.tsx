import { render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/auth-context'
import { AccountPage } from './AccountPage'
import { getSupabase } from '../services/supabase'
import { loadProfile } from '../services/account'
import { getOwnProfile, saveProfile } from '../services/community'
import type { useLibrary } from '../hooks/useLibrary'
import seed from '../../../backend/app/data/catalog.json'
import { toMediaItem } from '../services/catalog'
vi.mock('../services/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/community')>()),
  getOwnProfile: vi.fn(),
  saveProfile: vi.fn(),
}))
vi.mock('../services/account', () => ({
  loadProfile: vi.fn(),
  updateProfile: vi.fn(),
}))
vi.mock('../services/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/supabase')>()),
  getSupabase: vi.fn(),
}))
const auth = {
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getOwnProfile).mockResolvedValue(null)
  vi.mocked(getSupabase).mockReturnValue({ auth } as unknown as NonNullable<
    ReturnType<typeof getSupabase>
  >)
})
test('keeps the public profile action disabled until publishing and preserves preferences', async () => {
  vi.mocked(loadProfile).mockResolvedValue({
    id: 'owner',
    display_name: 'Lari',
    created_at: '',
    updated_at: '',
    onboarding_status: 'completed',
  })
  renderAccount('/account', true)
  expect(
    await screen.findByRole('button', { name: /Ver meu perfil público/ }),
  ).toBeDisabled()
  expect(
    screen.getByRole('link', { name: 'Gêneros, temas e gostos' }),
  ).toHaveAttribute('href', '/preferences')
  expect(screen.getByLabelText('Escolher imagem de perfil')).toHaveAttribute(
    'accept',
    'image/jpeg,image/png,image/webp',
  )
})
test('links directly to the saved public profile when published', async () => {
  vi.mocked(loadProfile).mockResolvedValue({
    id: 'owner',
    display_name: 'Lari',
    created_at: '',
    updated_at: '',
    onboarding_status: 'completed',
  })
  vi.mocked(getOwnProfile).mockResolvedValue({
    username: 'lari',
    display_name: 'Lari',
    bio: '',
    is_public: true,
    show_ratings: false,
    top_fives: {},
  })
  renderAccount('/account', true)
  expect(
    await screen.findByRole('link', { name: /Ver meu perfil público/ }),
  ).toHaveAttribute('href', '/u/lari')
})
function renderAccount(
  path = '/account',
  signedIn = false,
  library?: ReturnType<typeof useLibrary>,
) {
  window.history.replaceState({}, '', path)
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthContext
        value={{
          session: signedIn ? ({ user: { id: 'owner' } } as Session) : null,
          loading: false,
          configured: true,
          signOut: vi.fn(),
        }}
      >
        <BrowserRouter>
          <AccountPage
            guestCount={0}
            importGuest={vi.fn()}
            pending={false}
            library={library}
          />
        </BrowserRouter>
      </AuthContext>
    </QueryClientProvider>,
  )
}

test('edits profile, privacy and Top 5 within the account without losing pending changes', async () => {
  const user = userEvent.setup()
  const item = toMediaItem(seed[0])
  vi.mocked(loadProfile).mockResolvedValue({
    id: 'owner',
    display_name: 'Lari',
    created_at: '',
    updated_at: '',
    onboarding_status: 'completed',
  })
  vi.mocked(getOwnProfile).mockResolvedValue({
    username: 'lari',
    display_name: 'Lari',
    bio: '',
    is_public: false,
    show_ratings: false,
    top_fives: {},
  })
  vi.mocked(saveProfile).mockImplementation(async (_user, data) => data)
  const library = {
    savedSnapshots: [item],
    loading: false,
    error: null,
  } as unknown as ReturnType<typeof useLibrary>
  renderAccount('/account', true, library)
  await user.click(await screen.findByRole('tab', { name: 'Perfil' }))
  await user.type(
    await screen.findByLabelText('Um pouco sobre você'),
    'Minha bio.',
  )
  await user.click(screen.getByRole('tab', { name: 'Privacidade' }))
  await user.click(screen.getByLabelText(/Mostrar meus totais/))
  await user.click(screen.getByRole('tab', { name: 'Top 5' }))
  await user.click(screen.getByRole('button', { name: new RegExp(item.title) }))
  await user.click(screen.getByRole('tab', { name: 'Perfil' }))
  expect(screen.getByLabelText('Um pouco sobre você')).toHaveValue('Minha bio.')
  await user.click(
    screen.getByRole('button', { name: 'Salvar perfil e favoritos' }),
  )
  await waitFor(() =>
    expect(saveProfile).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({
        bio: 'Minha bio.',
        show_stats: true,
        top_fives: { movie: [item] },
      }),
    ),
  )
  expect(window.location.pathname).toBe('/account')
})
test('creates an account with an explicit local confirmation callback', async () => {
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
  renderAccount('/account?mode=signup')
  await userEvent.type(
    screen.getByLabelText('E-mail'),
    'reader@example.invalid',
  )
  await userEvent.type(
    screen.getByLabelText('Senha', { exact: true }),
    'test-password-123',
  )
  await userEvent.type(
    screen.getByLabelText('Repita a senha'),
    'test-password-123',
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Criar minha conta' }),
  )
  expect(
    await screen.findByText(/Confira seu e-mail para confirmar/),
  ).toBeInTheDocument()
  expect(auth.signUp).toHaveBeenCalledWith(
    expect.objectContaining({
      email: 'reader@example.invalid',
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    }),
  )
})
test('rejects mismatched passwords before sending credentials', async () => {
  renderAccount('/account?mode=signup')
  await userEvent.type(
    screen.getByLabelText('E-mail'),
    'reader@example.invalid',
  )
  await userEvent.type(
    screen.getByLabelText('Senha', { exact: true }),
    'test-password-123',
  )
  await userEvent.type(
    screen.getByLabelText('Repita a senha'),
    'different-password',
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Criar minha conta' }),
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'As senhas precisam ser iguais.',
  )
  expect(auth.signUp).not.toHaveBeenCalled()
})
test('recovery sends a callback and does not reveal whether an address has an account', async () => {
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  renderAccount('/account?mode=recover')
  await userEvent.type(
    screen.getByLabelText('E-mail'),
    'reader@example.invalid',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
  expect(
    await screen.findByText(/Se houver uma conta com esse e-mail/),
  ).toBeInTheDocument()
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
    'reader@example.invalid',
    { redirectTo: `${window.location.origin}/auth/callback?flow=recovery` },
  )
})
test('displays a human-readable login error', async () => {
  auth.signInWithPassword.mockResolvedValue({
    error: { code: 'invalid_credentials' },
  })
  renderAccount()
  await userEvent.type(
    screen.getByLabelText('E-mail'),
    'reader@example.invalid',
  )
  await userEvent.type(screen.getByLabelText('Senha'), 'wrong-password')
  await userEvent.click(screen.getByRole('button', { name: /^Entrar$/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'E-mail ou senha incorretos.',
  )
})
test.each(['not_started', 'skipped', 'completed'] as const)(
  'keeps post-login on the account regardless of the former onboarding state: %s',
  async (status) => {
    vi.mocked(loadProfile).mockResolvedValue({
      id: 'owner',
      display_name: null,
      created_at: '',
      updated_at: '',
      onboarding_status: status,
    })
    renderAccount('/account?welcome=1', true)
    await waitFor(() => expect(window.location.pathname).toBe('/account'))
    await waitFor(() => expect(window.location.search).toBe(''))
  },
)
test('password recovery keeps its destination when an old welcome query is present', async () => {
  vi.mocked(loadProfile).mockResolvedValue({
    id: 'owner',
    display_name: null,
    created_at: '',
    updated_at: '',
    onboarding_status: 'not_started',
  })
  renderAccount('/account?mode=password&welcome=1', true)
  expect(await screen.findByLabelText('Nova senha')).toBeInTheDocument()
  expect(window.location.pathname).toBe('/account')
})
