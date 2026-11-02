import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/auth-context'
import type { useLibrary } from '../hooks/useLibrary'
import type { MediaItem, MediaType } from '../data/selection'
import { Cover } from '../components/MediaCard'
import { Icon } from '../components/Icon'
import { getRecommendations } from '../services/recommendations'
import { PeopleSuggestions } from './PeoplePage'
import { saveFeedback, deleteFeedback } from '../services/community'
import type { FeedbackAction } from '../services/community'
import type { LibraryReaction } from '../data/library'
type Library = ReturnType<typeof useLibrary>
const categories: {
  id: MediaType | 'all'
  label: string
}[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'movie', label: 'Filmes' },
  { id: 'series', label: 'Séries' },
  { id: 'book', label: 'Livros' },
  { id: 'manga', label: 'Mangás' },
  { id: 'game', label: 'Jogos' },
]
export function RecommendationsPage({
  library,
  onOpen,
  onSave,
  selection = [],
}: {
  library: Library
  onOpen: (item: MediaItem) => void
  onSave: (item: MediaItem) => Promise<void>
  selection?: MediaItem[]
}) {
  const auth = useAuth()
  const userId = auth.session?.user.id
  const client = useQueryClient()
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [notice, setNotice] = useState<{
    item: MediaItem
    action: FeedbackAction
  } | null>(null)
  const [feedbackError, setFeedbackError] = useState('')
  const [completedNotice, setCompletedNotice] = useState<{
    owner: string
    title: string
    reaction: LibraryReaction | null
  } | null>(null)
  async function complete(item: MediaItem, reaction: LibraryReaction | null) {
    if (!userId || library.pending || feedbackBusy) return
    setFeedbackError('')
    try {
      await library.markCompleted(item, reaction)
      setCompletedNotice({ owner: userId, title: item.title, reaction })
    } catch (cause) {
      setFeedbackError(
        cause instanceof Error
          ? cause.message
          : 'Não conseguimos registrar a obra. Tente novamente.',
      )
    }
  }
  async function adjust(item: MediaItem, action: FeedbackAction) {
    if (!userId || feedbackBusy) return
    setFeedbackBusy(true)
    setFeedbackError('')
    try {
      await saveFeedback(userId, item, action)
      setNotice({ item, action })
      requestedBatch.current = { scope, offset: 0 }
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['account-recommendations', userId],
        }),
        client.invalidateQueries({ queryKey: ['account-feedback', userId] }),
      ])
    } catch {
      setFeedbackError('Não conseguimos guardar esse ajuste. Tente novamente.')
    } finally {
      setFeedbackBusy(false)
    }
  }
  async function undo() {
    if (!userId || !notice || feedbackBusy) return
    setFeedbackBusy(true)
    setFeedbackError('')
    try {
      await deleteFeedback(userId, notice.item.id)
      setNotice(null)
      requestedBatch.current = { scope, offset: 0 }
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['account-recommendations', userId],
        }),
        client.invalidateQueries({ queryKey: ['account-feedback', userId] }),
      ])
    } catch {
      setFeedbackError('Não foi possível desfazer. Tente novamente.')
    } finally {
      setFeedbackBusy(false)
    }
  }
  const [category, setCategory] = useState<MediaType | 'all'>('all')
  const [showHow, setShowHow] = useState(false)
  const signature = library.savedSnapshots.map((item) => [
    item.id,
    item.library?.rating,
    item.library?.isFavorite,
    item.library?.status,
    item.library?.reaction,
  ])
  const scope = JSON.stringify([userId, category, signature])
  const requestedBatch = useRef({ scope: '', offset: 0 })
  const [refreshNotice, setRefreshNotice] = useState<{
    scope: string
    text: string
    error: boolean
  } | null>(null)
  const query = useQuery({
    queryKey: ['account-recommendations', userId, category, signature],
    queryFn: ({ signal }) => {
      const offset =
        requestedBatch.current.scope === scope
          ? requestedBatch.current.offset
          : 0
      requestedBatch.current = { scope, offset }
      return getRecommendations(
        userId!,
        category === 'all' ? undefined : category,
        signal,
        offset,
      )
    },
    enabled:
      Boolean(userId) && !library.loading && !library.error && !library.pending,
    retry: false,
    staleTime: 30000,
  })
  async function refreshSuggestions() {
    if (!query.data || query.isFetching || library.pending || feedbackBusy)
      return
    const previous = query.data
    const previousOffset = previous.offset ?? 0
    const hasMore =
      previous.hasMore ??
      previousOffset + previous.items.length < previous.total
    const offset = hasMore ? previousOffset + previous.items.length : 0
    requestedBatch.current = { scope, offset }
    setRefreshNotice(null)
    const result = await query.refetch()
    if (result.isError || !result.data) {
      if (requestedBatch.current.scope === scope) {
        requestedBatch.current = { scope, offset: previousOffset }
      }
      setRefreshNotice({
        scope,
        error: true,
        text: 'Não conseguimos atualizar agora. As sugestões anteriores continuam aqui. Tente novamente.',
      })
      return
    }
    const current = result.data
    let text = 'Novas sugestões carregadas.'
    if (current.status !== 'ready') {
      text = 'Sugestões atualizadas com seus gostos mais recentes.'
    } else if (
      (offset === 0 && previousOffset > 0) ||
      (offset > 0 && current.offset === 0)
    ) {
      text = 'Você percorreu as sugestões disponíveis. Voltamos às primeiras.'
    } else if (
      current.items.map((row) => row.item.id).join(',') ===
      previous.items.map((row) => row.item.id).join(',')
    ) {
      text =
        'Você já está vendo todas as sugestões disponíveis para este filtro.'
    }
    setRefreshNotice({ scope, error: false, text })
  }
  return (
    <section className="lv-page lv-recs" aria-labelledby="recommendation-title">
      <div className="recommendations-heading">
        <div>
          <p className="eyebrow text-primary">SUGESTÕES</p>
          <h1 id="recommendation-title">Para você</h1>
          <p>
            Algumas possibilidades para a próxima leitura, sessão ou partida.
          </p>
        </div>
        {userId && (
          <div className="recommendations-heading-actions">
            <Link className="text-button" to="/people">
              Conhecer pessoas <Icon name="arrow" size={16} />
            </Link>
            <Link className="text-button" to="/preferences">
              Rever meus gostos <Icon name="arrow" size={16} />
            </Link>
          </div>
        )}
      </div>
      {completedNotice && completedNotice.owner === userId && (
        <div className="feedback-notice" role="status">
          <span>
            {completedNotice.title} foi para sua lista como concluído
            {completedNotice.reaction === 'liked'
              ? '. Você marcou que gostou.'
              : completedNotice.reaction === 'disliked'
                ? '. Você marcou que não gostou.'
                : '.'}
          </span>
          <Link className="text-button" to="/library">
            Ver minha lista →
          </Link>
        </div>
      )}
      {notice && (
        <div className="feedback-notice" role="status">
          <span>
            {notice.item.title}:{' '}
            {
              {
                more_like_this: 'vamos buscar mais conexões assim.',
                not_interested: 'ajuste salvo; essa obra sai das sugestões.',
                already_known: 'essa obra sai das sugestões.',
              }[notice.action]
            }
          </span>
          <button
            className="btn btn-outline"
            disabled={feedbackBusy}
            onClick={() => void undo()}
          >
            Desfazer
          </button>
        </div>
      )}
      {feedbackError && <p role="alert">{feedbackError}</p>}
      {!auth.loading && !userId ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-xl bg-card p-8">
            <div>
              <h2 className="font-display text-2xl">
                Entre para ver as suas sugestões
              </h2>
              <p className="mt-3 text-muted-foreground">
                Elas partem dos favoritos e notas que você marcar. Não existe
                número mínimo.
              </p>
            </div>
            <Link
              className="btn btn-primary"
              to="/account"
              aria-label="Entrar para ver sugestões"
            >
              Entrar
            </Link>
          </div>
          {selection.length > 0 && (
            <div className="mt-14">
              <div className="flex items-baseline justify-between border-b pb-3">
                <h2 className="font-display text-2xl">
                  Como uma sugestão aparece
                </h2>
                <span className="rounded-full border px-3 py-1 text-xs">
                  Exemplo
                </span>
              </div>
              <p className="sr-only">
                Exemplos ilustrativos com obras públicas, sem usar seus gostos.
              </p>
              {[
                [
                  'dune-book',
                  'dune',
                  'Mesma história e o mesmo universo do filme.',
                ],
                [
                  'dark',
                  'severance',
                  'Suspense e ficção científica, como Ruptura.',
                ],
                [
                  'midnight-library',
                  'past-lives',
                  'Drama sobre escolhas e as vidas que poderíamos ter tido.',
                ],
              ].map(([target, source, description], index) => {
                const item = selection.find((i) => i.id === target)
                const from = selection.find((i) => i.id === source)
                return (
                  item &&
                  from && (
                    <SuggestionRow
                      key={item.id}
                      index={index}
                      item={item}
                      saved={library.saved.includes(item.id)}
                      busy={library.pending || library.loading}
                      onOpen={() => onOpen(item)}
                      onSave={() => void onSave(item)}
                      source={from}
                      description={
                        <>
                          <strong>Porque você gostou de {from.title}.</strong>{' '}
                          {description}
                        </>
                      }
                    />
                  )
                )
              })}
            </div>
          )}
        </>
      ) : auth.loading || library.loading ? (
        <div className="empty-state" role="status">
          Abrindo seus gostos…
        </div>
      ) : library.error ? (
        <div className="empty-state" role="alert">
          <h2>Não conseguimos abrir sua lista.</h2>
          <button
            className="outline-button"
            onClick={() => void library.refresh()}
          >
            Tentar novamente
          </button>
        </div>
      ) : query.isPending ? (
        <div className="recommendation-skeleton" role="status">
          <span>Encontrando novas possibilidades…</span>
          <div aria-hidden="true">
            {[1, 2, 3, 4].map((n) => (
              <i key={n} />
            ))}
          </div>
        </div>
      ) : query.isError && !query.data ? (
        <div className="empty-state" role="alert">
          <h2>As sugestões não carregaram agora.</h2>
          <p>Seus gostos continuam guardados. Você pode tentar de novo.</p>
          <button
            className="outline-button"
            onClick={() => void query.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        query.data && (
          <>
            <div className="recommendation-toolbar">
              <div
                className="lv-filter-group"
                role="group"
                aria-label="Filtrar sugestões por tipo"
              >
                {categories.map((option) => (
                  <button
                    key={option.id}
                    className={category === option.id ? 'filter-active' : ''}
                    aria-pressed={category === option.id}
                    onClick={() => setCategory(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {query.data.status === 'needs_tastes' ? (
              <div className="empty-state">
                <Icon name="heart" size={30} />
                <h2>Conte um pouco do que você gosta.</h2>
                <p>
                  Na Minha lista, marque um favorito ou dê 4 ou 5 estrelas a uma
                  obra. Para encontrar outros títulos, use o Explorar.
                </p>
                <Link className="primary-button" to="/library">
                  Abrir minha lista <Icon name="arrow" size={16} />
                </Link>
              </div>
            ) : query.data.status === 'no_matches' ? (
              <div className="empty-state">
                <h2>Ainda não encontramos uma boa conexão por aqui.</h2>
                <p>
                  Nossa seleção é pequena e seus gostos podem estar em outras
                  categorias. Experimente outro filtro ou acrescente mais
                  favoritos.
                </p>
                <Link className="outline-button" to="/explore">
                  Explorar a seleção
                </Link>
              </div>
            ) : (
              <>
                <div className="recommendation-caption">
                  <span>
                    {query.data.items.length}{' '}
                    {query.data.items.length === 1 ? 'sugestão' : 'sugestões'}{' '}
                    para explorar
                  </span>
                  <span>
                    Entre os {query.data.catalogSize} títulos da seleção do
                    Nexo.
                  </span>
                </div>
                <div aria-busy={query.isFetching || library.pending}>
                  {query.data.items.map((row, index) => (
                    <SuggestionRow
                      key={row.item.id}
                      index={index}
                      item={row.item}
                      saved={library.saved.includes(row.item.id)}
                      busy={library.pending || library.loading}
                      onOpen={() => onOpen(row.item)}
                      onSave={() => void onSave(row.item)}
                      onComplete={(reaction) =>
                        void complete(row.item, reaction)
                      }
                      source={
                        library.savedSnapshots.find(
                          (item) => item.id === row.reasons[0]?.sourceSlug,
                        ) ??
                        selection.find(
                          (item) => item.id === row.reasons[0]?.sourceSlug,
                        )
                      }
                      description={row.reasons[0]?.description}
                      feedbackBusy={feedbackBusy}
                      onFeedback={(action) => void adjust(row.item, action)}
                      extra={
                        row.reasons.length > 1
                          ? row.reasons[1]?.description
                          : undefined
                      }
                    />
                  ))}
                </div>
                <button
                  className="text-button recommendation-refresh"
                  disabled={query.isFetching || library.pending || feedbackBusy}
                  onClick={() => void refreshSuggestions()}
                >
                  {query.isFetching ? 'Atualizando…' : 'Atualizar sugestões'}{' '}
                  <Icon name="arrow" size={16} />
                </button>
              </>
            )}
          </>
        )
      )}
      {userId && refreshNotice?.scope === scope && (
        <div
          className="feedback-notice mt-4"
          role={refreshNotice.error ? 'alert' : 'status'}
        >
          {refreshNotice.text}
        </div>
      )}
      {userId && <PeopleSuggestions preview signature={signature} />}
      <div className="lv-how">
        <button onClick={() => setShowHow(!showHow)} aria-expanded={showHow}>
          Como escolhemos
          <Icon name="chevron" size={18} />
        </button>
        {showHow && (
          <div>
            {' '}
            <p>
              Comparamos o sentido das descrições com seus favoritos, Top 5,
              gêneros, temas e avaliações escritas usando um modelo multilíngue
              local. Notas 1 e 2 reduzem a afinidade; 3 é neutra quando a obra
              não é favorita. Se uma favorita tiver nota 1 ou 2, a nota baixa
              prevalece. Marcar “gostei” também ajuda a encontrar novas
              conexões; “não gostei” reduz a afinidade. Registrar apenas como
              concluído não significa que você gostou.
            </p>
            <p>
              A seleção cresce com as fontes do catálogo e obras relacionadas.
              Sua lista e os títulos que você dispensou ficam de fora. “Mais
              assim” aumenta a influência da obra; “não me interessa” a reduz;
              “já conheço” apenas a retira das sugestões. Você pode desfazer
              esses ajustes em Seus gostos. O modelo usa seus textos privados só
              no servidor do Nexo, sem enviá-los às fontes do catálogo.
              Semelhança não garante que você vá gostar, e temas evitados podem
              escapar do filtro.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
function SuggestionRow({
  item,
  index,
  saved,
  busy,
  onOpen,
  onSave,
  source,
  description,
  extra,
  onFeedback,
  feedbackBusy,
  onComplete,
}: {
  item: MediaItem
  index: number
  saved: boolean
  busy: boolean
  onOpen: () => void
  onSave: () => void
  source?: MediaItem
  description: ReactNode
  extra?: string
  onFeedback?: (action: FeedbackAction) => void
  feedbackBusy?: boolean
  onComplete?: (reaction: LibraryReaction | null) => void
}) {
  const [showCompletion, setShowCompletion] = useState(false)
  const completedLabel =
    item.type === 'game'
      ? 'Já joguei'
      : item.type === 'book' || item.type === 'manga'
        ? 'Já li'
        : 'Já assisti'
  const labels = {
    movie: 'filme',
    series: 'série',
    book: 'livro',
    manga: 'mangá',
    game: 'jogo',
  }
  return (
    <article className="lv-recommendation-row">
      <button
        className="row-cover"
        onClick={onOpen}
        aria-label={`Ver detalhes de ${item.title}, ${labels[item.type]}`}
      >
        <Cover item={item} />
      </button>
      <div>
        <span className="font-display text-base italic text-muted-foreground">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h2>
          <button onClick={onOpen}>{item.title}</button>
        </h2>
        <div className="reason">
          {source && <Cover item={source} />}
          <p>{description}</p>
        </div>
        {extra && (
          <details className="mt-2 text-sm text-muted-foreground">
            <summary>Mais uma conexão</summary>
            <p className="mt-2">{extra}</p>
          </details>
        )}
      </div>
      <div className="recommendation-feedback-actions">
        <button
          className="btn btn-outline"
          onClick={onSave}
          disabled={busy}
          aria-label={`${saved ? 'Remover' : 'Guardar'} ${item.title}, ${labels[item.type]}`}
          aria-pressed={saved}
        >
          {saved ? 'Na sua lista' : 'Guardar'}
        </button>
        {onComplete && (
          <button
            className="text-button completed-trigger"
            disabled={busy || feedbackBusy}
            aria-expanded={showCompletion}
            onClick={() => setShowCompletion(!showCompletion)}
          >
            {completedLabel}
          </button>
        )}
        {showCompletion && onComplete && (
          <div
            className="completed-choice"
            role="group"
            aria-label={`Você gostou de ${item.title}?`}
          >
            <p>Você gostou?</p>
            <button
              className="outline-button"
              disabled={busy || feedbackBusy}
              onClick={() => onComplete('liked')}
            >
              Gostei
            </button>
            <button
              className="outline-button"
              disabled={busy || feedbackBusy}
              onClick={() => onComplete('disliked')}
            >
              Não gostei
            </button>
            <button
              className="text-button"
              disabled={busy || feedbackBusy}
              onClick={() => onComplete(null)}
            >
              Só marcar como concluído
            </button>
          </div>
        )}
        {onFeedback && (
          <details>
            <summary>Ajustar sugestões</summary>
            <button
              disabled={feedbackBusy}
              onClick={() => onFeedback('more_like_this')}
            >
              Mais assim
            </button>
            <button
              disabled={feedbackBusy}
              onClick={() => onFeedback('not_interested')}
            >
              Não me interessa
            </button>
            <button
              disabled={feedbackBusy}
              onClick={() => onFeedback('already_known')}
            >
              Já conheço
            </button>
          </details>
        )}
      </div>
    </article>
  )
}
