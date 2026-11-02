import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { expect, test, vi } from 'vitest'
import seed from '../../../backend/app/data/catalog.json'
import { toMediaItem } from '../services/catalog'
import { LibraryEditor } from './LibraryEditor'
const item = toMediaItem(seed[0])
const initial = { status: 'planned' as const, rating: null, isFavorite: false }

test('an opinion can be changed and removed without changing a rating or favorite', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(
    <LibraryEditor
      item={item}
      entry={{
        status: 'completed',
        rating: 4,
        isFavorite: true,
        reaction: 'liked',
      }}
      saved
      signedIn
      pending={false}
      onSave={save}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Não gostei' }))
  await userEvent.click(
    screen.getByRole('button', { name: 'Salvar alterações' }),
  )
  expect(save).toHaveBeenLastCalledWith({
    status: 'completed',
    rating: 4,
    isFavorite: true,
    reaction: 'disliked',
  })
  await userEvent.click(screen.getByRole('button', { name: 'Sem opinião' }))
  await userEvent.click(
    screen.getByRole('button', { name: 'Salvar alterações' }),
  )
  expect(save).toHaveBeenLastCalledWith({
    status: 'completed',
    rating: 4,
    isFavorite: true,
    reaction: null,
  })
})
test('records status, rating and an explicit favorite only on save', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(
    <LibraryEditor
      item={item}
      entry={initial}
      saved
      signedIn
      pending={false}
      onSave={save}
    />,
  )
  await userEvent.selectOptions(
    screen.getByLabelText('Como está por aí?'),
    'completed',
  )
  await userEvent.click(screen.getByRole('button', { name: '4 estrelas' }))
  await userEvent.click(screen.getByRole('button', { name: 'Favorito' }))
  expect(save).not.toHaveBeenCalled()
  await userEvent.click(
    screen.getByRole('button', { name: 'Salvar alterações' }),
  )
  expect(save).toHaveBeenCalledWith({
    status: 'completed',
    rating: 4,
    isFavorite: true,
  })
})
test('keeps the draft after a failed save and allows clearing a rating', async () => {
  const save = vi
    .fn()
    .mockRejectedValue(new Error('Sem conexão. Tente novamente.'))
  render(
    <LibraryEditor
      item={item}
      entry={{ status: 'completed', rating: 5, isFavorite: true }}
      saved
      signedIn
      pending={false}
      onSave={save}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Tirar nota' }))
  await userEvent.click(
    screen.getByRole('button', { name: 'Salvar alterações' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão')
  expect(screen.getByText('Ainda sem nota')).toBeInTheDocument()
  expect(save).toHaveBeenCalledWith({
    status: 'completed',
    rating: null,
    isFavorite: true,
  })
})
test('invites a guest to sign in without submitting preferences', () => {
  render(
    <MemoryRouter>
      <LibraryEditor
        item={item}
        saved
        signedIn={false}
        pending={false}
        onSave={vi.fn()}
      />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: /Entrar no Nexo/ })).toHaveAttribute(
    'href',
    '/account',
  )
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})
