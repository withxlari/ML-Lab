import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, test, vi } from 'vitest'
import { AvatarPicker } from './AvatarPicker'
import { changeAvatar, removeAvatar } from '../services/avatar'
import type { Profile } from '../services/account'
vi.mock('../services/avatar', () => ({
  changeAvatar: vi.fn(),
  removeAvatar: vi.fn(),
}))
const profile: Profile = {
  id: 'owner',
  display_name: 'Lari',
  created_at: '',
  updated_at: '',
  onboarding_status: 'completed',
  avatar_path: 'owner/old.webp',
  avatar_url: '/images/interstellar.jpg',
}
function page() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['account-profile', 'owner'], profile)
  render(
    <QueryClientProvider client={client}>
      <AvatarPicker user="owner" profile={profile} />
    </QueryClientProvider>,
  )
  return client
}
beforeEach(() => vi.resetAllMocks())
test('uploads a selected image and updates the account cache', async () => {
  const updated = {
    ...profile,
    avatar_path: 'owner/new.webp',
    avatar_url: '/images/dune.jpg',
  }
  vi.mocked(changeAvatar).mockResolvedValue(updated)
  const client = page()
  const file = new File(['image'], 'portrait.png', { type: 'image/png' })
  await userEvent.upload(
    screen.getByLabelText('Escolher imagem de perfil'),
    file,
  )
  await screen.findByText('Foto de perfil atualizada.')
  expect(changeAvatar).toHaveBeenCalledWith('owner', file, 'owner/old.webp')
  expect(client.getQueryData(['account-profile', 'owner'])).toEqual(updated)
})
test('failed uploads keep the previous account photo intact', async () => {
  vi.mocked(changeAvatar).mockRejectedValue(
    new Error('Não conseguimos enviar a foto.'),
  )
  const client = page()
  await userEvent.upload(
    screen.getByLabelText('Escolher imagem de perfil'),
    new File(['image'], 'portrait.png', { type: 'image/png' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não conseguimos enviar',
  )
  expect(client.getQueryData(['account-profile', 'owner'])).toEqual(profile)
})
test('removes the photo without changing the display name', async () => {
  vi.mocked(removeAvatar).mockResolvedValue({
    ...profile,
    avatar_path: null,
    avatar_url: null,
  })
  const client = page()
  await userEvent.click(screen.getByRole('button', { name: 'Remover' }))
  await waitFor(() =>
    expect(removeAvatar).toHaveBeenCalledWith('owner', 'owner/old.webp'),
  )
  await screen.findByText('Foto removida.')
  expect(
    client.getQueryData<Profile>(['account-profile', 'owner'])?.display_name,
  ).toBe('Lari')
})
