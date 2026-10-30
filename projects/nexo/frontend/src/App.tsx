import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router'
import { HomePage } from './pages/HomePage'
import { ApiStatus } from './components/ApiStatus'
import { Icon } from './components/Icon'
import { MediaCard } from './components/MediaCard'
import { Modal } from './components/Modal'
import { mediaLabels, selection } from './data/selection'
import type { MediaItem, MediaType } from './data/selection'
import { useSavedMedia, useTheme } from './hooks/usePreferences'

type Filter = 'all' | MediaType
type Preferences = ReturnType<typeof useTheme> &
  ReturnType<typeof useSavedMedia>
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'movie', label: 'Filmes' },
  { id: 'series', label: 'Séries' },
  { id: 'book', label: 'Livros' },
]
const featured = selection[0]!
const book = selection.find((item) => item.id === 'dune-book')!

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function NexoApp({
  page,
  preferences,
}: {
  page: 'home' | 'explore' | 'library' | 'status' | 'not-found'
  preferences: Preferences
}) {
  const navigate = useNavigate()
  const isHome = page === 'home'
  const view = page === 'library' ? 'saved' : 'discover'
  const SelectionHeading = page === 'library' ? 'h1' : 'h2'
  const { theme, toggleTheme, saved, toggleSaved } = preferences
  const [filter, setFilter] = useState<Filter>(() => {
    const value = new URLSearchParams(window.location.search).get('type')
    return value === 'movie' || value === 'series' || value === 'book'
      ? value
      : 'all'
  })
  const [query, setQuery] = useState('')

  const [activeItem, setActiveItem] = useState<MediaItem | null>(null)
  const [showCredits, setShowCredits] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    document.title =
      page === 'home'
        ? 'Nexo — Filmes, séries e livros'
        : page === 'library'
          ? 'Minha lista — Nexo'
          : page === 'explore'
            ? 'Explorar — Nexo'
            : 'Nexo'
  }, [page])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 4000)
    return () => window.clearTimeout(timer)
  }, [message])

  const visibleItems = selection.filter(
    (item) =>
      (view === 'discover' || saved.includes(item.id)) &&
      (filter === 'all' || item.type === filter) &&
      normalize(
        `${item.title} ${item.originalTitle ?? ''} ${item.creator} ${item.genres.join(' ')}`,
      ).includes(normalize(query.trim())),
  )

  function save(item: MediaItem) {
    toggleSaved(item.id)
    setMessage(
      saved.includes(item.id)
        ? `${item.title} saiu da sua lista.`
        : `${item.title} ficou guardado para depois.`,
    )
  }

  function changeView(next: 'discover' | 'saved') {
    navigate(next === 'saved' ? '/library' : '/explore')
    setQuery('')
    setFilter('all')
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="Nexo, início">
          nexo<span className="wordmark-period">.</span>
        </Link>
        <nav aria-label="Navegação principal">
          <Link
            to="/"
            className={isHome ? 'nav-active' : ''}
            aria-current={isHome ? 'page' : undefined}
          >
            Início
          </Link>
          <Link
            to="/explore"
            className={page === 'explore' ? 'nav-active' : ''}
            aria-current={page === 'explore' ? 'page' : undefined}
          >
            Explorar
          </Link>
          {!isHome && (
            <Link
              to="/library"
              className={page === 'library' ? 'nav-active' : ''}
              aria-current={page === 'library' ? 'page' : undefined}
            >
              <Icon name="bookmark" size={17} />
              Minha lista
              {saved.length > 0 && (
                <span className="list-count">{saved.length}</span>
              )}
            </Link>
          )}
        </nav>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Ativar modo ${theme === 'dark' ? 'claro' : 'escuro'}`}
          title={`Ativar modo ${theme === 'dark' ? 'claro' : 'escuro'}`}
        >
          <Icon name="theme" size={19} />
          <span>Modo {theme === 'dark' ? 'claro' : 'escuro'}</span>
        </button>
      </header>

      <main id="conteudo">
        {isHome ? (
          <HomePage onOpen={setActiveItem} />
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
            {view === 'discover' && (
              <>
                <div className="page-intro">
                  <div>
                    <span className="eyebrow">FILMES, SÉRIES E LIVROS</span>
                    <h1>O que vai ser hoje?</h1>
                  </div>
                  <p>
                    Um filme, alguns episódios
                    <br />
                    ou só mais um capítulo.
                  </p>
                </div>
                <section
                  className="hero-grid"
                  aria-label="Destaques da seleção"
                >
                  <article className="feature">
                    <img
                      className="feature-image"
                      src="/images/interstellar-backdrop.jpg"
                      alt=""
                      fetchPriority="high"
                      width="1280"
                      height="720"
                    />
                    <div className="feature-shade" />
                    <div className="feature-top">
                      <span className="feature-kicker">
                        <span />
                        ESCOLHA DA VEZ
                      </span>
                      <span className="feature-number">FILME</span>
                    </div>
                    <div className="feature-copy">
                      <div className="feature-meta">
                        <span>Ficção científica</span>
                        <span>2014</span>
                        <span>Christopher Nolan</span>
                      </div>
                      <h2>Interestelar</h2>
                      <p>{featured.note}</p>
                      <div className="feature-actions">
                        <button
                          className="primary-button"
                          onClick={() => setActiveItem(featured)}
                        >
                          Conhecer o filme <Icon name="arrow" size={18} />
                        </button>
                        <button
                          className={`feature-save ${saved.includes(featured.id) ? 'is-saved' : ''}`}
                          onClick={() => save(featured)}
                          aria-pressed={saved.includes(featured.id)}
                        >
                          <Icon
                            name={
                              saved.includes(featured.id) ? 'check' : 'bookmark'
                            }
                            size={18}
                          />
                          {saved.includes(featured.id)
                            ? 'Na sua lista'
                            : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  </article>
                  <button
                    className="book-feature"
                    onClick={() => setActiveItem(book)}
                    aria-label="Conhecer o livro Duna"
                  >
                    <span className="eyebrow">DEPOIS DO FILME, UM LIVRO</span>
                    <h2>
                      Para ler depois
                      <br />
                      dos créditos.
                    </h2>
                    <div className="book-stage">
                      <div className="book-shadow" />
                      <img
                        src={book.image}
                        alt="Capa de Duna, de Frank Herbert"
                        width="160"
                        height="245"
                      />
                    </div>
                    <div className="book-feature-caption">
                      <div>
                        <strong>Duna</strong>
                        <span>Frank Herbert · 1965</span>
                      </div>
                      <span className="round-arrow">
                        <Icon name="arrow" size={20} />
                      </span>
                    </div>
                  </button>
                </section>
              </>
            )}

            <section
              id="selecao"
              className="selection-section"
              aria-labelledby="selection-title"
            >
              <div className="selection-heading">
                <div>
                  <span className="eyebrow">
                    {view === 'saved'
                      ? 'PARA OUTRA HORA'
                      : 'NA ESTANTE DO NEXO'}
                  </span>
                  <SelectionHeading id="selection-title">
                    {view === 'saved'
                      ? 'Sua próxima história está aqui.'
                      : 'Vale um lugar na sua lista.'}
                  </SelectionHeading>
                </div>
                <span className="selection-note">
                  {view === 'saved'
                    ? 'Sua lista fica salva neste navegador.'
                    : 'Uma pequena seleção, sem ordem de preferência.'}
                </span>
              </div>
              <div className="selection-toolbar">
                <div
                  className="filter-group"
                  role="group"
                  aria-label="Filtrar por tipo"
                >
                  {filters.map((option) => (
                    <button
                      key={option.id}
                      aria-pressed={filter === option.id}
                      className={filter === option.id ? 'filter-active' : ''}
                      onClick={() => setFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <label className="search-field">
                  <Icon name="search" size={18} />
                  <input
                    type="search"
                    placeholder="Tem algum título em mente?"
                    aria-label="Buscar título, autor ou gênero"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query && (
                    <button
                      aria-label="Limpar busca"
                      onClick={() => setQuery('')}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </label>
              </div>
              <span className="sr-only" role="status">
                {visibleItems.length} títulos encontrados
              </span>
              {visibleItems.length > 0 ? (
                <div className="media-grid">
                  {visibleItems.map((item) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      saved={saved.includes(item.id)}
                      onOpen={() => setActiveItem(item)}
                      onSave={() => save(item)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Icon
                    name={
                      view === 'saved' && !saved.length ? 'bookmark' : 'search'
                    }
                    size={32}
                  />
                  <h3>
                    {view === 'saved' && !saved.length
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
                      changeView('discover')
                    }}
                  >
                    {view === 'saved' && !saved.length
                      ? 'Ver a seleção'
                      : 'Limpar filtros'}
                    <Icon name="arrow" size={17} />
                  </button>
                </div>
              )}
            </section>

            {view === 'discover' && (
              <section className="surprise-section">
                <div className="surprise-mark" aria-hidden="true">
                  <span>?</span>
                </div>
                <div>
                  <span className="eyebrow">SEM IDEIA?</span>
                  <h2>Hoje você não precisa decidir.</h2>
                  <p>A gente tira um título da seleção para você.</p>
                </div>
                <button
                  className="outline-button"
                  onClick={() =>
                    setActiveItem(
                      selection[Math.floor(Math.random() * selection.length)] ??
                        featured,
                    )
                  }
                >
                  <Icon name="shuffle" size={18} />
                  Me surpreenda
                </button>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <Link className="wordmark" to="/" aria-label="Nexo, voltar ao início">
            nexo<span className="wordmark-period">.</span>
          </Link>
          <p>Para ver, ler e lembrar depois.</p>
          <button className="text-button" onClick={() => setShowCredits(true)}>
            Sobre o Nexo <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="footer-bottom">
          <span>Uma seleção do Nexo.</span>
          <span>Filmes · Séries · Livros</span>
        </div>
      </footer>

      {activeItem && (
        <Modal
          titleId="media-title"
          onClose={() => setActiveItem(null)}
          className="media-modal"
        >
          <img
            className="modal-poster"
            src={activeItem.image}
            alt={`Capa de ${activeItem.title}`}
            width="280"
            height="420"
          />
          <div className="modal-copy">
            <span className="eyebrow">
              {mediaLabels[activeItem.type]} · {activeItem.year}
            </span>
            <h2 id="media-title">{activeItem.title}</h2>
            <p className="modal-creator">{activeItem.creator}</p>
            <div className="genre-list">
              {activeItem.genres.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
            <p className="modal-description">{activeItem.description}</p>
            <p className="editorial-note">{activeItem.note}</p>
            <button
              className="primary-button"
              onClick={() => save(activeItem)}
              aria-pressed={saved.includes(activeItem.id)}
            >
              <Icon
                name={saved.includes(activeItem.id) ? 'check' : 'bookmark'}
                size={18}
              />
              {saved.includes(activeItem.id)
                ? 'Remover da minha lista'
                : 'Guardar para depois'}
            </button>
            <a
              className="source-link"
              href={activeItem.source}
              target="_blank"
              rel="noreferrer"
            >
              Mais sobre a obra
              <Icon name="external" size={14} />
            </a>
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
            O Nexo está começando com uma ideia simples: reunir filmes, séries e
            livros num lugar em que dê vontade de ficar. Por enquanto, esta é
            uma seleção editorial para experimentar a página. As recomendações
            pessoais vêm depois.
          </p>
          <p>
            Você já pode explorar os títulos e guardar os que quiser. Sua lista
            fica neste navegador, sem precisar criar uma conta.
          </p>
          <div className="credits">
            <h3>Imagens e fontes</h3>
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
              Capas dos livros:{' '}
              <a
                href="https://openlibrary.org"
                target="_blank"
                rel="noreferrer"
              >
                Open Library
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

export default function App() {
  const appearance = useTheme()
  const library = useSavedMedia()
  const preferences = { ...appearance, ...library }
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<NexoApp key="home" page="home" preferences={preferences} />}
        />
        <Route
          path="/explore"
          element={
            <NexoApp key="explore" page="explore" preferences={preferences} />
          }
        />
        <Route
          path="/library"
          element={
            <NexoApp key="library" page="library" preferences={preferences} />
          }
        />
        {import.meta.env.DEV && (
          <Route
            path="/dev/status"
            element={
              <NexoApp key="status" page="status" preferences={preferences} />
            }
          />
        )}
        <Route
          path="*"
          element={
            <NexoApp
              key="not-found"
              page="not-found"
              preferences={preferences}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
