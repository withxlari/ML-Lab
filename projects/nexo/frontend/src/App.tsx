import { useEffect, useState } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  keepPreviousData,
} from '@tanstack/react-query'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import { HomePage } from './pages/HomePage'
import { ExploreHighlight } from './components/ExploreHighlight'
import { ApiStatus } from './components/ApiStatus'
import { Icon } from './components/Icon'
import { MediaCard, Cover, CoverReveal } from './components/MediaCard'
import { Modal } from './components/Modal'
import { mediaLabels } from './data/selection'
import {
  getCatalog,
  getSavedCatalog,
  getMediaDetails,
} from './services/catalog'
import type { MediaItem, MediaType } from './data/selection'
import { useTheme } from './hooks/usePreferences'
import { useLibrary } from './hooks/useLibrary'
import { useAuth } from './hooks/auth-context'
import { AuthProvider } from './components/AuthProvider'
import { AccountPage, AuthCallbackPage } from './pages/AccountPage'
import { LibraryEditor } from './components/LibraryEditor'
import { libraryPage, libraryStatuses, statusLabel } from './data/library'
import type { LibraryStatus } from './data/library'
import { RecommendationsPage } from './pages/RecommendationsPage'
import { TasteSettingsPage } from './pages/TasteSettingsPage'
import { PublicProfilePage } from './pages/ProfilePage'
import { ReviewEditor } from './components/ReviewEditor'
import { PeopleSuggestions, FollowingPage } from './pages/PeoplePage'
type Filter = 'all' | MediaType
type Preferences = ReturnType<typeof useTheme> & ReturnType<typeof useLibrary>
type NexoPage =
  | 'home'
  | 'explore'
  | 'library'
  | 'account'
  | 'recommendations'
  | 'preferences'
  | 'profile'
  | 'public-profile'
  | 'people'
  | 'following'
  | 'status'
  | 'not-found'
const filters: {
  id: Filter
  label: string
}[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'movie', label: 'Filmes' },
  { id: 'series', label: 'Séries' },
  { id: 'book', label: 'Livros' },
  { id: 'manga', label: 'Mangás' },
  { id: 'game', label: 'Jogos' },
]
function NexoApp({
  page,
  preferences,
}: {
  page: NexoPage
  preferences: Preferences
}) {
  const navigate = useNavigate()
  const auth = useAuth()
  const isHome = page === 'home'
  const view = page === 'library' ? 'saved' : 'discover'
  const { theme, toggleTheme, saved, savedSnapshots, toggleSaved } = preferences
  const [filter, setFilter] = useState<Filter>(() => {
    const value = new URLSearchParams(window.location.search).get('type')
    return value === 'movie' ||
      value === 'series' ||
      value === 'book' ||
      value === 'manga' ||
      value === 'game'
      ? value
      : 'all'
  })
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState<LibraryStatus | 'all'>('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const searchPlaceholder =
    view === 'saved' ? 'Buscar na lista' : 'Buscar por título ou autoria'
  const pageSize = 24
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 450)
    return () => window.clearTimeout(timer)
  }, [query])
  const [activeItem, setActiveItem] = useState<MediaItem | null>(null)
  const [showCredits, setShowCredits] = useState(false)
  const [message, setMessage] = useState('')
  const catalog = useQuery({
    queryKey: [
      view === 'saved' ? 'account-library-view' : 'catalog',
      view === 'saved' ? (auth.session?.user.id ?? 'guest') : null,
      view,
      filter,
      debouncedQuery,
      offset,
      view === 'saved' ? saved : null,
      view === 'saved' ? savedSnapshots : null,
      statusFilter,
      favoritesOnly,
    ],
    queryFn: ({ signal }) => {
      const options = {
        mediaType: filter === 'all' ? undefined : filter,
        query: debouncedQuery,
        limit: pageSize,
        offset,
        trending:
          (page === 'home' || page === 'explore') && !debouncedQuery.trim(),
      }
      if (view === 'saved' && preferences.signedIn)
        return Promise.resolve(
          libraryPage(savedSnapshots, {
            ...options,
            status: statusFilter,
            favoritesOnly,
          }),
        )
      return view === 'saved'
        ? getSavedCatalog(saved, options, signal, savedSnapshots)
        : getCatalog(options, signal)
    },
    enabled:
      page === 'home' ||
      page === 'explore' ||
      (page === 'library' && preferences.signedIn),
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval:
      (page === 'home' || page === 'explore') && !debouncedQuery
        ? 6 * 3600000
        : false,
    placeholderData: keepPreviousData,
  })
  const highlights = useQuery({
    queryKey: ['catalog-highlights'],
    queryFn: ({ signal }) =>
      getCatalog(
        {
          slugs: [
            'interstellar',
            'budapest',
            'severance',
            'dune-book',
            'past-lives',
            'dune',
            'dark',
            'midnight-library',
          ],
        },
        signal,
      ),
    enabled:
      page === 'home' ||
      page === 'explore' ||
      page === 'account' ||
      page === 'recommendations',
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const libraryCounts = useQuery({
    queryKey: ['guest-library-counts', saved, savedSnapshots],
    queryFn: ({ signal }) =>
      getSavedCatalog(
        saved,
        { limit: Math.max(1, saved.length) },
        signal,
        savedSnapshots,
      ),
    enabled: page === 'library' && !preferences.signedIn,
    staleTime: 60000,
    retry: false,
  })
  const countedItems = preferences.signedIn
    ? savedSnapshots
    : (libraryCounts.data?.items ?? [])
  const authScreen = page === 'account' && !auth.session
  const selection = catalog.data?.items ?? []
  const details = useQuery({
    queryKey: ['media-details', activeItem?.id, activeItem?.isbn13],
    queryFn: ({ signal }) => getMediaDetails(activeItem!, signal),
    enabled: Boolean(activeItem?.provider),
    staleTime: 600000,
    retry: false,
  })
  const shownItem = details.data ?? activeItem
  const needsCatalog =
    page === 'home' || page === 'explore' || page === 'library'
  useEffect(() => {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    document.title =
      page === 'home'
        ? 'Nexo — Filmes, séries, livros, mangás e jogos'
        : page === 'library'
          ? 'Minha lista — Nexo'
          : page === 'people'
            ? 'Pessoas — Nexo'
            : page === 'following'
              ? 'Perfis que sigo — Nexo'
              : page === 'preferences'
                ? 'Seus gostos — Nexo'
                : page === 'profile'
                  ? 'Meu perfil — Nexo'
                  : page === 'public-profile'
                    ? 'Perfil — Nexo'
                    : page === 'recommendations'
                      ? 'Para você — Nexo'
                      : page === 'explore'
                        ? 'Explorar — Nexo'
                        : 'Nexo'
  }, [page])
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 4000)
    return () => window.clearTimeout(timer)
  }, [message])
  const visibleItems = selection
  async function save(item: MediaItem) {
    if (!preferences.signedIn) {
      setActiveItem(null)
      navigate('/account?reason=library')
      return
    }
    const wasSaved = saved.includes(item.id)
    try {
      await toggleSaved(item)
      if (view === 'saved') setOffset(0)
      setMessage(
        wasSaved
          ? `${item.title} saiu da sua lista.`
          : `${item.title} ficou guardado para depois.`,
      )
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar. Tente novamente.',
      )
    }
  }
  function changeView(next: 'discover' | 'saved') {
    navigate(next === 'saved' ? '/library' : '/explore')
    setQuery('')
    setFilter('all')
    setOffset(0)
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      {!authScreen && (
        <SiteHeader
          page={page}
          signedIn={Boolean(auth.session)}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      )}

      <main id="conteudo">
        {page === 'people' ? (
          <PeopleSuggestions
            signature={savedSnapshots.map((item) => [
              item.id,
              item.library?.rating,
              item.library?.isFavorite,
              item.library?.reaction,
            ])}
          />
        ) : page === 'following' ? (
          <FollowingPage />
        ) : page === 'preferences' ? (
          <TasteSettingsPage />
        ) : page === 'public-profile' ? (
          <PublicProfilePage onOpen={setActiveItem} />
        ) : page === 'recommendations' ? (
          <RecommendationsPage
            library={preferences}
            selection={highlights.data?.items ?? []}
            onOpen={setActiveItem}
            onSave={save}
          />
        ) : page === 'account' ? (
          <AccountPage
            library={preferences}
            guestCount={preferences.guestCount}
            importGuest={preferences.importGuest}
            pending={preferences.pending}
            selection={highlights.data?.items ?? []}
          />
        ) : page === 'library' && !auth.loading && !preferences.signedIn ? (
          <section className="lv-page py-16">
            <p className="eyebrow text-primary">Sua coleção</p>
            <h1 className="mt-3 font-display text-5xl">Minha lista</h1>
            <div className="mt-8 rounded-xl bg-card p-8">
              <h2 className="font-display text-3xl">
                Sua lista começa com uma conta.
              </h2>
              <p className="mt-3 text-muted-foreground">
                Entre ou crie uma conta para guardar obras, dar notas e escrever
                avaliações.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="btn btn-primary" to="/account?mode=signup">
                  Criar conta
                </Link>
                <Link className="btn btn-outline" to="/account">
                  Entrar
                </Link>
              </div>
            </div>
          </section>
        ) : page === 'library' && preferences.loading ? (
          <section className="empty-state" role="status">
            Carregando sua lista…
          </section>
        ) : page === 'library' && preferences.error ? (
          <section className="empty-state" role="alert">
            <h1>Não conseguimos abrir sua lista.</h1>
            <button
              className="primary-button"
              onClick={() => void preferences.refresh()}
            >
              Tentar novamente
            </button>
          </section>
        ) : needsCatalog && catalog.isPending ? (
          <section className="empty-state" role="status">
            Carregando os títulos…
          </section>
        ) : needsCatalog && catalog.isError ? (
          <section className="empty-state" role="alert">
            <h1>Não conseguimos abrir o catálogo.</h1>
            <p>Tente de novo daqui a pouco.</p>
            <button
              className="primary-button"
              onClick={() => void catalog.refetch()}
            >
              Tentar novamente
            </button>
          </section>
        ) : isHome ? (
          <HomePage
            onOpen={setActiveItem}
            selection={selection}
            examples={highlights.data?.items ?? []}
          />
        ) : page === 'status' ? (
          <ApiStatus />
        ) : page === 'not-found' ? (
          <section className="empty-state">
            <h1>Essa página não está por aqui.</h1>
            <Link className="primary-button" to="/">
              Voltar ao início
            </Link>
          </section>
        ) : (
          <>
            <div className="lv-page" data-view={view}>
              <header className="grid gap-8 pb-8 pt-10 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <p className="eyebrow text-primary">
                    {view === 'saved'
                      ? preferences.signedIn
                        ? 'Sua conta'
                        : 'Neste navegador'
                      : 'Acervo'}
                  </p>
                  <h1 className="mt-3 font-display text-5xl sm:text-6xl">
                    {view === 'saved' ? 'Minha lista' : 'Explorar'}
                  </h1>
                </div>
                {view === 'discover' ? (
                  <label className="lv-search">
                    <Icon name="search" size={18} />
                    <input
                      type="search"
                      placeholder={searchPlaceholder}
                      aria-label="Buscar filmes, séries, livros, mangás ou jogos"
                      value={query}
                      maxLength={200}
                      onChange={(event) => {
                        setQuery(event.target.value)
                        setOffset(0)
                      }}
                    />
                    {query && (
                      <button
                        aria-label="Limpar busca"
                        onClick={() => {
                          setQuery('')
                          setOffset(0)
                        }}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </label>
                ) : (
                  <dl className="flex gap-6 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Total</dt>
                      <dd className="font-display text-3xl">{saved.length}</dd>
                    </div>
                    {filters
                      .filter((f) => f.id !== 'all')
                      .map((f) => (
                        <div className="hidden sm:block" key={f.id}>
                          <dt className="text-muted-foreground">{f.label}</dt>
                          <dd className="font-display text-3xl">
                            {
                              countedItems.filter((item) => item.type === f.id)
                                .length
                            }
                          </dd>
                        </div>
                      ))}
                  </dl>
                )}
              </header>
              <div
                className={
                  view === 'saved'
                    ? 'flex flex-wrap items-center justify-between gap-2'
                    : 'flex flex-wrap items-center justify-between gap-2 pb-2'
                }
              >
                <div
                  className="lv-filter-group"
                  role="group"
                  aria-label="Filtrar por tipo"
                >
                  {filters.map((option) => (
                    <button
                      key={option.id}
                      aria-pressed={filter === option.id}
                      className={filter === option.id ? 'filter-active' : ''}
                      onClick={() => {
                        setFilter(option.id)
                        setOffset(0)
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {view === 'saved' && (
                  <label className="lv-search">
                    <Icon name="search" size={18} />
                    <input
                      type="search"
                      placeholder={searchPlaceholder}
                      aria-label="Buscar filmes, séries, livros, mangás ou jogos"
                      value={query}
                      maxLength={200}
                      onChange={(event) => {
                        setQuery(event.target.value)
                        setOffset(0)
                      }}
                    />
                    {query && (
                      <button
                        aria-label="Limpar busca"
                        onClick={() => {
                          setQuery('')
                          setOffset(0)
                        }}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </label>
                )}
              </div>
              {view === 'discover' && !debouncedQuery && (
                <ExploreHighlight
                  key={filter}
                  items={visibleItems}
                  onOpen={setActiveItem}
                />
              )}
              <section
                id="selecao"
                className={view === 'discover' ? 'mt-10' : 'mt-8'}
                aria-label={
                  view === 'saved'
                    ? 'Obras da sua lista'
                    : 'Resultados do catálogo'
                }
              >
                {view === 'discover' && (
                  <div className="mb-6 flex items-baseline justify-between border-b pb-3">
                    <h2 className="font-display text-2xl">
                      {debouncedQuery
                        ? `Resultados para “${debouncedQuery}”`
                        : filter === 'all'
                          ? 'Seleção'
                          : filters.find((f) => f.id === filter)?.label}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {catalog.isFetching
                        ? 'Buscando…'
                        : `${catalog.data?.total ?? visibleItems.length} obras`}
                    </p>
                  </div>
                )}
                {view === 'discover' && !debouncedQuery && (
                  <p className="mb-6 text-sm text-muted-foreground">
                    {filter === 'book' && catalog.data?.bookSelection ? (
                      <>
                        {catalog.data.bookSelection.stale
                          ? 'Última seleção brasileira disponível'
                          : 'Seleção brasileira'}{' '}
                        · Primeiros {catalog.data.bookSelection.selectedCount}{' '}
                        títulos: ficção, infantojuvenil e não ficção.{' '}
                        <a
                          className="underline underline-offset-4"
                          href={catalog.data.bookSelection.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Lista BookInfo
                        </a>{' '}
                        de{' '}
                        {new Date(
                          catalog.data.bookSelection.from + 'T12:00:00',
                        ).toLocaleDateString('pt-BR')}{' '}
                        a{' '}
                        {new Date(
                          catalog.data.bookSelection.to + 'T12:00:00',
                        ).toLocaleDateString('pt-BR')}
                        .
                      </>
                    ) : (
                      'Em alta nas fontes do catálogo, com atualização automática.'
                    )}
                    {Boolean(catalog.data?.warnings?.length) &&
                      ' Algumas fontes estão indisponíveis; mantivemos as obras disponíveis.'}
                  </p>
                )}
                {view === 'saved' && preferences.signedIn && (
                  <>
                    <div
                      className="library-summary"
                      aria-label="Resumo da sua lista"
                    >
                      <span>
                        <strong>{saved.length}</strong> na lista
                      </span>
                      <span>
                        <strong>
                          {
                            savedSnapshots.filter(
                              (item) => item.library?.isFavorite,
                            ).length
                          }
                        </strong>{' '}
                        favoritos
                      </span>
                      <span>
                        <strong>
                          {
                            savedSnapshots.filter(
                              (item) => item.library?.status === 'completed',
                            ).length
                          }
                        </strong>{' '}
                        concluídos
                      </span>
                      <span>
                        <strong>
                          {
                            savedSnapshots.filter(
                              (item) => item.library?.rating != null,
                            ).length
                          }
                        </strong>{' '}
                        com nota
                      </span>
                    </div>
                    <div className="library-filters">
                      <label>
                        Andamento
                        <span className="status-select">
                          <Icon name="progress" size={18} />
                          <select
                            value={statusFilter}
                            onChange={(event) => {
                              setStatusFilter(
                                event.target.value as LibraryStatus | 'all',
                              )
                              setOffset(0)
                            }}
                          >
                            <option value="all">Todos os status</option>
                            {libraryStatuses.map((status) => (
                              <option key={status} value={status}>
                                {statusLabel(status)}
                              </option>
                            ))}
                          </select>
                          <Icon name="chevron" size={16} />
                        </span>
                      </label>
                      <button
                        className={`outline-button ${favoritesOnly ? 'is-favorite' : ''}`}
                        aria-pressed={favoritesOnly}
                        onClick={() => {
                          setFavoritesOnly(!favoritesOnly)
                          setOffset(0)
                        }}
                      >
                        <Icon name="heart" size={16} /> Só favoritos
                      </button>
                    </div>
                  </>
                )}
                <span className="sr-only" role="status">
                  {catalog.data?.externalSearch
                    ? `${visibleItems.length} resultados nesta página`
                    : `${catalog.data?.total ?? 0} títulos encontrados`}
                </span>
                {catalog.isFetching &&
                  !catalog.isPending &&
                  !catalog.data?.externalSearch && (
                    <p className="search-feedback" role="status">
                      Buscando os títulos…
                    </p>
                  )}
                {catalog.data?.externalSearch && (
                  <div className="search-feedback" role="status">
                    <span>
                      {catalog.isFetching
                        ? 'Buscando nas fontes…'
                        : `${visibleItems.length} resultados nesta página`}
                    </span>
                    {(catalog.data.warnings?.length ?? 0) > 0 && (
                      <span>
                        Não foi possível consultar{' '}
                        {catalog.data.warnings?.join(', ')} agora. Os outros
                        resultados continuam disponíveis.
                      </span>
                    )}
                  </div>
                )}
                {visibleItems.length > 0 ? (
                  <div className="lv-grid" aria-busy={catalog.isFetching}>
                    {visibleItems.map((item) => (
                      <MediaCard
                        key={item.id}
                        item={
                          view === 'saved' && preferences.signedIn
                            ? item
                            : { ...item, library: undefined }
                        }
                        saved={saved.includes(item.id)}
                        busy={preferences.pending || preferences.loading}
                        onOpen={() => setActiveItem(item)}
                        onSave={() => save(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Icon
                      name={
                        view === 'saved' && !saved.length
                          ? 'bookmark'
                          : 'search'
                      }
                      size={32}
                    />
                    <h3>
                      {view === 'saved' &&
                      saved.length > 0 &&
                      (statusFilter !== 'all' || favoritesOnly)
                        ? 'Nenhum título com esses filtros.'
                        : view === 'saved' && !saved.length
                          ? 'A lista é sua. Pode começar.'
                          : 'Esse título não apareceu por aqui.'}
                    </h3>
                    <p>
                      {view === 'saved' && !saved.length
                        ? 'Toque no marcador de uma capa para guardar o que chamou sua atenção.'
                        : 'Tente outro nome ou escolha um tipo diferente.'}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        if (view === 'saved' && saved.length) {
                          setStatusFilter('all')
                          setFavoritesOnly(false)
                          setFilter('all')
                          setQuery('')
                          setOffset(0)
                        } else changeView('discover')
                      }}
                    >
                      {view === 'saved' && !saved.length
                        ? 'Ver a seleção'
                        : 'Limpar filtros'}
                      <Icon name="arrow" size={17} />
                    </button>
                  </div>
                )}
                {((catalog.data?.total ?? 0) > pageSize ||
                  (catalog.data?.externalSearch &&
                    (catalog.data.hasMore || offset > 0))) && (
                  <nav
                    className="catalog-pagination"
                    aria-label="Páginas do catálogo"
                  >
                    <button
                      className="outline-button"
                      disabled={offset === 0 || catalog.isFetching}
                      onClick={() => setOffset(Math.max(0, offset - pageSize))}
                    >
                      Anterior
                    </button>
                    <span aria-live="polite">
                      Página {Math.floor(offset / pageSize) + 1}
                      {!catalog.data?.externalSearch &&
                        ` de ${Math.ceil((catalog.data?.total ?? 0) / pageSize)}`}
                    </span>
                    <button
                      className="outline-button"
                      disabled={
                        (catalog.data?.externalSearch
                          ? !catalog.data.hasMore
                          : offset + pageSize >= (catalog.data?.total ?? 0)) ||
                        catalog.isFetching
                      }
                      onClick={() => setOffset(offset + pageSize)}
                    >
                      Próxima
                    </button>
                  </nav>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {!authScreen && <SiteFooter onCredits={() => setShowCredits(true)} />}

      {shownItem && (
        <Modal
          titleId="media-title"
          onClose={() => setActiveItem(null)}
          className="media-modal"
        >
          <div className="modal-poster-frame">
            <Cover item={shownItem} className="modal-poster" />
            <CoverReveal item={shownItem} />
          </div>
          <div className="modal-copy">
            <span className="eyebrow">
              {mediaLabels[shownItem.type]} · {shownItem.year}
            </span>
            <h2 id="media-title">{shownItem.title}</h2>
            {shownItem.originalTitle &&
              shownItem.originalTitle !== shownItem.title && (
                <p className="modal-original">{shownItem.originalTitle}</p>
              )}
            {shownItem.creator && (
              <p className="modal-creator">
                por <strong>{shownItem.creator}</strong>
              </p>
            )}
            <div className="genre-list">
              {shownItem.genres.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
            <p className="modal-description">{shownItem.description}</p>
            {shownItem.type === 'book' &&
              (shownItem.isbn13 || shownItem.publisher) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {[
                    shownItem.publisher,
                    shownItem.language?.startsWith('pt')
                      ? 'Edição em português'
                      : undefined,
                    shownItem.isbn13 ? `ISBN ${shownItem.isbn13}` : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            {details.isFetching && (
              <p className="detail-status" role="status">
                Carregando detalhes…
              </p>
            )}
            {details.isError && (
              <p className="detail-status">
                Alguns detalhes não puderam ser carregados agora.
              </p>
            )}
            {(shownItem.platforms?.length ?? 0) > 0 && (
              <p className="modal-platforms">
                <strong>Plataformas:</strong> {shownItem.platforms?.join(', ')}
              </p>
            )}
            <p className="editorial-note">{shownItem.note}</p>
            <div className="modal-actions">
              <button
                className={
                  saved.includes(shownItem.id)
                    ? 'outline-button'
                    : 'primary-button'
                }
                disabled={preferences.pending || preferences.loading}
                onClick={() => save(shownItem)}
                aria-pressed={saved.includes(shownItem.id)}
              >
                <Icon
                  name={
                    saved.includes(shownItem.id) ? 'bookmark-check' : 'bookmark'
                  }
                  size={18}
                />
                {saved.includes(shownItem.id)
                  ? 'Na sua lista · remover'
                  : 'Guardar'}
              </button>
              <a
                className="source-link"
                href={shownItem.source}
                target="_blank"
                rel="noreferrer"
              >
                Ver na fonte
                <Icon name="external" size={14} />
              </a>
            </div>
            {!preferences.signedIn && (
              <p className="guest-detail-note">
                Entre ou crie uma conta para guardar, dar notas e escrever
                avaliações.
              </p>
            )}
            {preferences.signedIn && (
              <LibraryEditor
                key={`${shownItem.id}:${JSON.stringify(savedSnapshots.find((item) => item.id === shownItem.id)?.library)}`}
                item={shownItem}
                saved={saved.includes(shownItem.id)}
                signedIn={preferences.signedIn}
                entry={
                  savedSnapshots.find((item) => item.id === shownItem.id)
                    ?.library
                }
                pending={preferences.pending || preferences.loading}
                onSave={async (update) => {
                  await preferences.updateFeedback(shownItem, update)
                  setOffset(0)
                  setMessage('Suas alterações foram salvas.')
                }}
              />
            )}
            {preferences.signedIn && (
              <ReviewEditor
                item={shownItem}
                rating={
                  savedSnapshots.find((item) => item.id === shownItem.id)
                    ?.library?.rating ?? null
                }
              />
            )}
          </div>
        </Modal>
      )}

      {showCredits && (
        <Modal
          titleId="about-title"
          onClose={() => setShowCredits(false)}
          className="about-modal"
        >
          <span className="eyebrow">SOBRE O NEXO</span>
          <h2 id="about-title">
            O difícil é escolher.
            <br />O bom é descobrir.
          </h2>
          <p>
            O Nexo reúne filmes, séries, livros, mangás e jogos. Você pode
            buscar nas fontes do catálogo, conhecer uma obra e guardar o que
            quer ver, ler ou jogar depois. Na página Para você, seus favoritos e
            suas notas ajudam a encontrar novas escolhas.
          </p>
          <p>
            A busca é aberta a todos. Para guardar títulos, dar notas ou
            escrever avaliações, entre ou crie uma conta. Sua lista fica
            vinculada ao seu perfil para acessar em outros dispositivos.
          </p>
          <div className="credits">
            <h3>Imagens e fontes</h3>
            <p>
              Mangás:{' '}
              <a href="https://kitsu.app" target="_blank" rel="noreferrer">
                Kitsu
              </a>
              . Jogos:{' '}
              <a href="https://www.igdb.com" target="_blank" rel="noreferrer">
                IGDB
              </a>
              . Metadados e imagens pertencem às respectivas fontes e titulares.
            </p>
            <a
              href="https://www.themoviedb.org"
              target="_blank"
              rel="noreferrer"
            >
              <img src="/images/tmdb.svg" alt="TMDB" width="108" height="15" />
            </a>
            <p>
              This product uses the TMDB API but is not endorsed or certified by
              TMDB.
            </p>
            <p>
              Livros:{' '}
              <a
                href="https://books.google.com"
                target="_blank"
                rel="noreferrer"
              >
                Google Books
              </a>{' '}
              e{' '}
              <a
                href="https://openlibrary.org"
                target="_blank"
                rel="noreferrer"
              >
                Open Library
              </a>
              . Seleção brasileira e capas de apoio:{' '}
              <a
                href="https://www.bookinfo.com.br/maisvendidos"
                target="_blank"
                rel="noreferrer"
              >
                BookInfo
              </a>
              . Tipografia: DM Sans e Newsreader, distribuídas sob a licença SIL
              Open Font License.
            </p>
          </div>
        </Modal>
      )}

      {message && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {message}
          <button aria-label="Fechar aviso" onClick={() => setMessage('')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
function ApplicationRoutes() {
  const appearance = useTheme()
  const library = useLibrary()
  const auth = useAuth()
  const preferences = { ...appearance, ...library }
  const screen = (page: NexoPage) => (
    <NexoApp
      key={`${page}:${auth.session?.user.id ?? 'guest'}`}
      page={page}
      preferences={preferences}
    />
  )
  return (
    <Routes>
      <Route path="/" element={screen('home')} />
      <Route path="/explore" element={screen('explore')} />
      <Route path="/library" element={screen('library')} />
      <Route path="/account" element={screen('account')} />
      <Route path="/welcome" element={<Navigate to="/library" replace />} />
      <Route path="/recommendations" element={screen('recommendations')} />
      <Route path="/preferences" element={screen('preferences')} />
      <Route
        path="/profile"
        element={<Navigate to="/account?section=profile" replace />}
      />
      <Route path="/u/:username" element={screen('public-profile')} />
      <Route path="/people" element={screen('people')} />
      <Route path="/following" element={screen('following')} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      {import.meta.env.DEV && (
        <Route path="/dev/status" element={screen('status')} />
      )}
      <Route path="*" element={screen('not-found')} />
    </Routes>
  )
}
export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
            staleTime: 60000,
          },
        },
      }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ApplicationRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
