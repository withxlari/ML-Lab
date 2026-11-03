import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import seed from '../../backend/app/data/catalog.json'
import { getCatalog, getSavedCatalog, toMediaItem } from './services/catalog'
import type { CatalogOptions } from './services/catalog'
vi.mock('./services/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./services/catalog')>()),
  getCatalog: vi.fn(),
  getSavedCatalog: vi.fn(),
}))
function fixturePage(options: CatalogOptions = {}) {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  const items = seed
    .map(toMediaItem)
    .filter(
      (item) =>
        (!options.mediaType || item.type === options.mediaType) &&
        (!options.slugs || options.slugs.includes(item.id)) &&
        normalize(
          `${item.title} ${item.creator} ${item.genres.join(' ')}`,
        ).includes(normalize(options.query ?? '')),
    )
  const limit = options.limit ?? 24
  const offset = options.offset ?? 0
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  }
}
async function expectCards(count: number) {
  await waitFor(
    () =>
      expect(
        screen.getAllByRole('button', { name: /^Ver detalhes de/ }),
      ).toHaveLength(count),
    { timeout: 3000 },
  )
}
async function renderApp() {
  const view = render(<App />)
  await screen.findByRole('heading', { level: 1 })
  // The header renders before the titles now; wait for the first page too.
  await waitFor(() =>
    expect(
      screen.queryByText('Carregando os títulos…'),
    ).not.toBeInTheDocument(),
  )
  return view
}
beforeEach(() => {
  vi.mocked(getCatalog).mockImplementation(async (options) =>
    fixturePage(options),
  )
  vi.mocked(getSavedCatalog).mockImplementation(async (slugs, options) =>
    fixturePage({ ...options, slugs }),
  )
  localStorage.clear()
  document.documentElement.dataset.theme = 'dark'
  window.history.replaceState({}, '', '/explore')
})
test('shows catalog loading, then lets the visitor retry a failed request', async () => {
  let offline = true
  vi.mocked(getCatalog).mockImplementation(async (options) => {
    if (offline) throw new Error('offline')
    return fixturePage(options)
  })
  render(<App />)
  expect(screen.getByText('Carregando os títulos…')).toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não conseguimos abrir o catálogo.',
  )
  offline = false
  await userEvent.click(
    screen.getByRole('button', { name: 'Tentar novamente' }),
  )
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
    'Explorar',
  )
})

test('the home shows the stored catalog while the trending sources are still loading', async () => {
  window.history.replaceState({}, '', '/')
  vi.mocked(getCatalog).mockImplementation((options) =>
    options?.trending
      ? new Promise(() => {})
      : Promise.resolve(fixturePage(options)),
  )
  await renderApp()
  expect(
    await screen.findByRole('heading', { name: /O que vem/ }),
  ).toBeInTheDocument()
  expect(
    screen.queryByText('Não conseguimos abrir o catálogo.'),
  ).not.toBeInTheDocument()
})
test('the search field stays usable while a search is still loading', async () => {
  // Trending never arrives and searches never finish: before the fix the whole page
  // switched to a loading screen and the field vanished in the middle of typing.
  vi.mocked(getCatalog).mockImplementation((options) =>
    options?.trending || options?.query
      ? new Promise(() => {})
      : Promise.resolve(fixturePage(options)),
  )
  await renderApp()
  const field = screen.getByRole('searchbox', {
    name: 'Buscar filmes, séries, livros, mangás ou jogos',
  })
  await userEvent.type(field, 'du')
  // Wait until the 450 ms debounce has fired and the search for "du" is in flight.
  expect(
    await screen.findByRole(
      'heading',
      { name: 'Resultados para “du”' },
      { timeout: 2000 },
    ),
  ).toBeInTheDocument()
  expect(field).toBeInTheDocument()
  expect(field).toHaveFocus()
  await userEvent.type(field, 'na')
  expect(field).toHaveValue('duna')
})

test('switches theme, saves the preference and restores it after remounting', async () => {
  const view = await renderApp()
  await userEvent.click(
    screen.getByRole('button', { name: 'Ativar modo claro' }),
  )
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem('nexo:theme')).toBe('light')
  view.unmount()
  await renderApp()
  expect(
    screen.getByRole('button', { name: 'Ativar modo escuro' }),
  ).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Ativar modo escuro' }),
  )
  expect(document.documentElement.dataset.theme).toBe('dark')
})
test('filters media types and searches titles without accents', async () => {
  await renderApp()
  await userEvent.click(screen.getByRole('button', { name: 'Livros' }))
  await expectCards(2)
  await userEvent.type(screen.getByRole('searchbox'), 'biblioteca')
  await expectCards(1)
  expect(
    screen.getByRole('button', {
      name: 'A Biblioteca da Meia-Noite',
    }),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Limpar busca' }))
  await userEvent.click(screen.getByRole('button', { name: 'Tudo' }))
  await userEvent.type(screen.getByRole('searchbox'), 'ficcao')
  await expectCards(6)
})
test('requires an account before saving a work and never writes a guest save', async () => {
  await renderApp()
  await userEvent.click(
    screen.getByRole('button', { name: 'Guardar Ruptura, série' }),
  )
  expect(window.location.pathname).toBe('/account')
  expect(
    await screen.findByText(
      'Entre ou crie uma conta para guardar obras, dar notas e escrever avaliações.',
    ),
  ).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('nexo:saved') ?? '[]')).toEqual([])
})
test('old welcome links require sign-in and preserve old saves only for later import', async () => {
  localStorage.setItem('nexo:saved', JSON.stringify(['severance']))
  window.history.replaceState({}, '', '/welcome')
  await renderApp()
  await waitFor(() => expect(window.location.pathname).toBe('/library'))
  expect(
    await screen.findByText('Sua lista começa com uma conta.'),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /^Ver detalhes de/ }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Minha lista',
  )
  expect(JSON.parse(localStorage.getItem('nexo:saved') ?? '[]')).toEqual([
    'severance',
  ])
})
test('shows a useful empty state and clears the filters', async () => {
  await renderApp()
  await userEvent.type(screen.getByRole('searchbox'), 'nenhum titulo assim')
  expect(
    await screen.findByText('Esse título não apareceu por aqui.', undefined, {
      timeout: 3000,
    }),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
  await expectCards(8)
})
test('keeps theme and the sign-in requirement working when browser storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  await renderApp()
  await userEvent.click(
    screen.getByRole('button', { name: 'Ativar modo claro' }),
  )
  expect(document.documentElement.dataset.theme).toBe('light')
  await userEvent.click(
    screen.getByRole('button', { name: 'Guardar Ruptura, série' }),
  )
  expect(window.location.pathname).toBe('/account')
  expect(
    screen.queryByRole('button', { name: 'Remover Ruptura, série' }),
  ).not.toBeInTheDocument()
})
test('ignores corrupt saved data and hides development diagnostics on the home page', async () => {
  localStorage.setItem('nexo:saved', '{invalid')
  await renderApp()
  await expectCards(8)
  expect(
    screen.queryByLabelText('Ambiente de desenvolvimento'),
  ).not.toBeInTheDocument()
})
test('introduces the product on the public home, then navigates to exploration', async () => {
  window.history.replaceState({}, '', '/')
  await renderApp()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'O que vem',
  )
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: /Minha lista/ }),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'Explorar obras' }))
  expect(window.location.pathname).toBe('/explore')
  expect(screen.getByRole('searchbox')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Minha lista/ })).toBeInTheDocument()
})
test('opens a media category from the public home', async () => {
  window.history.replaceState({}, '', '/')
  await renderApp()
  await userEvent.click(screen.getByRole('link', { name: 'Livros' }))
  expect(window.location.pathname).toBe('/explore')
  expect(screen.getByRole('button', { name: 'Livros' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expectCards(2)
})
test('requests the next catalog page without downloading everything', async () => {
  vi.mocked(getCatalog).mockImplementation(async (options = {}) => ({
    items: options.slugs
      ? fixturePage(options).items
      : [toMediaItem(seed[options.offset ? 2 : 0])],
    total: options.slugs ? 3 : 25,
    limit: options.limit ?? 24,
    offset: options.offset ?? 0,
  }))
  await renderApp()
  await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
  await waitFor(() =>
    expect(getCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 24, limit: 24 }),
      expect.anything(),
    ),
  )
  expect(await screen.findByText('Página 2 de 2')).toBeInTheDocument()
})
test('requires an account for saving external manga too', async () => {
  const manga = {
    ...toMediaItem(seed[0]),
    id: 'kitsu-manga-35',
    title: 'Naruto',
    type: 'manga' as const,
    source: 'https://kitsu.app/manga/naruto',
  }
  vi.mocked(getCatalog).mockImplementation(async (options = {}) =>
    options.mediaType === 'manga'
      ? {
          items: [manga],
          total: null,
          limit: 24,
          offset: 0,
          externalSearch: true,
          hasMore: false,
        }
      : fixturePage(options),
  )
  vi.mocked(getSavedCatalog).mockImplementation(
    async (_slugs, options, _signal, snapshots = []) => ({
      items: snapshots,
      total: snapshots.length,
      limit: options.limit ?? 24,
      offset: 0,
    }),
  )
  await renderApp()
  await userEvent.click(screen.getByRole('button', { name: 'Mangás' }))
  await userEvent.click(
    await screen.findByRole('button', { name: 'Guardar Naruto, mangá' }),
  )
  expect(window.location.pathname).toBe('/account')
  expect(JSON.parse(localStorage.getItem('nexo:saved-items') ?? '[]')).toEqual(
    [],
  )
})
test('shows the development notice and varies the exploration highlight without extra requests', async () => {
  await renderApp()
  expect(
    screen.getByText(/Esta ainda não é a versão final do Nexo/),
  ).toBeInTheDocument()
  const first = document.querySelector('.explore-highlight h2')!.textContent
  const calls = vi.mocked(getCatalog).mock.calls.length
  await userEvent.click(screen.getByRole('button', { name: 'Outro destaque' }))
  expect(document.querySelector('.explore-highlight h2')!.textContent).not.toBe(
    first,
  )
  expect(vi.mocked(getCatalog).mock.calls.length).toBe(calls)
  expect(getCatalog).toHaveBeenCalledWith(
    expect.objectContaining({ trending: true }),
    expect.anything(),
  )
})
test('shows partial source failures while retaining available search results', async () => {
  vi.mocked(getCatalog).mockImplementation(async (options = {}) =>
    options.query
      ? {
          items: [toMediaItem(seed[0])],
          total: null,
          limit: 24,
          offset: 0,
          externalSearch: true,
          hasMore: false,
          warnings: ['IGDB'],
        }
      : fixturePage(options),
  )
  await renderApp()
  await userEvent.type(screen.getByRole('searchbox'), 'naruto')
  expect(
    await screen.findByText(/Não foi possível consultar IGDB agora/),
  ).toBeInTheDocument()
  await expectCards(1)
})
test('offers all five categories on the home page', async () => {
  window.history.replaceState({}, '', '/')
  await renderApp()
  expect(screen.getByRole('link', { name: 'Mangás' })).toHaveAttribute(
    'href',
    '/explore?type=manga',
  )
  expect(screen.getByRole('link', { name: 'Jogos' })).toHaveAttribute(
    'href',
    '/explore?type=game',
  )
})
test('home fan, moving strip and shelves use the current trending works', async () => {
  const types = ['movie', 'series', 'book', 'manga', 'game'] as const
  const fresh = types.map((type, i) => ({
    ...toMediaItem(seed[i]),
    id: `fresh-${type}`,
    title: `Em alta ${type}`,
    type,
    image: `/images/current-${type}.jpg`,
  }))
  vi.mocked(getCatalog).mockImplementation(async (options = {}) =>
    options.trending
      ? { items: fresh, total: 5, limit: 24, offset: 0 }
      : fixturePage(options),
  )
  window.history.replaceState({}, '', '/')
  await renderApp()
  await screen.findByRole('button', {
    name: 'Trazer Em alta movie para a frente',
  })
  for (const type of types) {
    expect(document.querySelector(`.home-shelf-${type} img`)).toHaveAttribute(
      'src',
      `/images/current-${type}.jpg`,
    )
    expect(
      document.querySelector(
        `.cover-marquee-track img[src="/images/current-${type}.jpg"]`,
      ),
    ).not.toBeNull()
  }
  expect(
    screen.queryByRole('button', { name: /Animar capas|Pausar capas/ }),
  ).not.toBeInTheDocument()
})
