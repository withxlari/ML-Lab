import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.dataset.theme = 'dark'
  window.history.replaceState({}, '', '/explore')
})

test('switches theme, saves the preference and restores it after remounting', async () => {
  const view = render(<App />)
  await userEvent.click(
    screen.getByRole('button', { name: 'Ativar modo claro' }),
  )
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem('nexo:theme')).toBe('light')
  view.unmount()
  render(<App />)
  expect(
    screen.getByRole('button', { name: 'Ativar modo escuro' }),
  ).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Ativar modo escuro' }),
  )
  expect(document.documentElement.dataset.theme).toBe('dark')
})

test('filters media types and searches titles without accents', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Livros' }))
  expect(
    screen.getAllByRole('button', { name: /^Ver detalhes de/ }),
  ).toHaveLength(2)
  await userEvent.type(screen.getByRole('searchbox'), 'biblioteca')
  expect(
    screen.getAllByRole('button', { name: /^Ver detalhes de/ }),
  ).toHaveLength(1)
  expect(
    screen.getByRole('button', {
      name: 'A Biblioteca da Meia-Noite',
    }),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Limpar busca' }))
  await userEvent.click(screen.getByRole('button', { name: 'Tudo' }))
  await userEvent.type(screen.getByRole('searchbox'), 'ficcao')
  expect(
    screen.getAllByRole('button', { name: /^Ver detalhes de/ }),
  ).toHaveLength(6)
})

test('saves a title, restores the list and removes it', async () => {
  const view = render(<App />)
  await userEvent.click(
    screen.getByRole('button', { name: 'Guardar Ruptura, série' }),
  )
  expect(JSON.parse(localStorage.getItem('nexo:saved') ?? '[]')).toEqual([
    'severance',
  ])
  view.unmount()
  render(<App />)
  await userEvent.click(screen.getByRole('link', { name: /Minha lista/ }))
  expect(
    screen.getAllByRole('button', { name: /^Ver detalhes de/ }),
  ).toHaveLength(1)
  await userEvent.click(
    screen.getByRole('button', { name: 'Remover Ruptura, série' }),
  )
  expect(screen.getByText('A lista é sua. Pode começar.')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('nexo:saved') ?? '[]')).toEqual([])
})

test('shows a useful empty state and clears the filters', async () => {
  render(<App />)
  await userEvent.type(screen.getByRole('searchbox'), 'nenhum titulo assim')
  expect(
    screen.getByText('Esse título não apareceu por aqui.'),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
  expect(
    screen.getAllByRole('button', { name: /^Ver detalhes de/ }),
  ).toHaveLength(8)
})

test('keeps theme and list usable when browser storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  render(<App />)
  await userEvent.click(
    screen.getByRole('button', { name: 'Ativar modo claro' }),
  )
  expect(document.documentElement.dataset.theme).toBe('light')
  await userEvent.click(
    screen.getByRole('button', { name: 'Guardar Ruptura, série' }),
  )
  expect(
    screen.getByRole('button', { name: 'Remover Ruptura, série' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('ignores corrupt saved data and hides development diagnostics on the home page', () => {
  localStorage.setItem('nexo:saved', '{invalid')
  render(<App />)
  expect(
    screen.getAllByRole('button', { name: /^Ver detalhes de/ }),
  ).toHaveLength(8)
  expect(
    screen.queryByLabelText('Ambiente de desenvolvimento'),
  ).not.toBeInTheDocument()
})

test('introduces the product on the public home, then navigates to exploration', async () => {
  window.history.replaceState({}, '', '/')
  render(<App />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Gostou do filme?',
  )
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: /Minha lista/ }),
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'Explorar títulos' }))
  expect(window.location.pathname).toBe('/explore')
  expect(screen.getByRole('searchbox')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Minha lista/ })).toBeInTheDocument()
})

test('opens a media category from the public home', async () => {
  window.history.replaceState({}, '', '/')
  render(<App />)
  await userEvent.click(screen.getByRole('link', { name: 'Livros' }))
  expect(window.location.pathname).toBe('/explore')
  expect(screen.getByRole('button', { name: 'Livros' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(
    screen.getAllByRole('button', { name: /^Ver detalhes de/ }),
  ).toHaveLength(2)
})
