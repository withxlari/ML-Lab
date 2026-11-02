import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/auth-context'
import type { useLibrary } from '../hooks/useLibrary'
import type { MediaItem, MediaType } from '../data/selection'
import { Cover } from '../components/MediaCard'
import { Avatar } from '../components/Avatar'
import { FollowButton } from '../components/FollowButton'
import {
  categories,
  getOwnProfile,
  saveProfile,
  getPublicProfile,
  getActivity,
  getConnections,
} from '../services/community'
import type { PublicProfile } from '../services/community'
export function ProfileSettingsPage({
  library,
  embedded = false,
  activeSection = 'profile',
}: {
  library: ReturnType<typeof useLibrary>
  embedded?: boolean
  activeSection?: 'profile' | 'privacy' | 'favorites'
}) {
  const { session, loading } = useAuth()
  const user = session?.user.id
  const query = useQuery({
    queryKey: ['account-public-profile', user],
    queryFn: ({ signal }) => getOwnProfile(user!, signal),
    enabled: !!user,
  })
  if (loading || (user && (query.isPending || library.loading)))
    return (
      <section className="lv-page community-page" role="status">
        Abrindo seu perfil…
      </section>
    )
  if (!user)
    return (
      <section className="lv-page community-page">
        <h1>Seu perfil no Nexo</h1>
        <p>
          Entre para organizar seus favoritos e escolher o que compartilhar.
        </p>
        <Link className="btn btn-primary" to="/account">
          Entrar
        </Link>
      </section>
    )
  if (query.isError || library.error)
    return (
      <section className="lv-page community-page" role="alert">
        <p>Não conseguimos abrir suas informações.</p>
        <button
          className="btn btn-outline"
          onClick={() => {
            void query.refetch()
            void library.refresh()
          }}
        >
          Tentar novamente
        </button>
      </section>
    )
  return (
    <ProfileForm
      key={user}
      user={user}
      initial={
        query.data ?? {
          username: '',
          display_name: '',
          bio: '',
          is_public: false,
          show_ratings: false,
          top_fives: {},
        }
      }
      items={library.savedSnapshots}
      embedded={embedded}
      activeSection={activeSection}
    />
  )
}
function ProfileForm({
  user,
  initial,
  items,
  embedded,
  activeSection,
}: {
  user: string
  initial: PublicProfile
  items: MediaItem[]
  embedded: boolean
  activeSection: 'profile' | 'privacy' | 'favorites'
}) {
  const client = useQueryClient()
  const [data, setData] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [category, setCategory] = useState<MediaType>('movie')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const top = data.top_fives[category] ?? []
  function updateTop(next: MediaItem[]) {
    setData({ ...data, top_fives: { ...data.top_fives, [category]: next } })
  }
  function move(index: number, direction: number) {
    const next = [...top]
    const item = next[index]
    const other = next[index + direction]
    if (!item || !other) return
    next[index] = other
    next[index + direction] = item
    updateTop(next)
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await saveProfile(user, data)
      if (result) {
        setSaved(result)
        setData(result)
        client.setQueryData(['account-public-profile', user], result)
      }
      await client.invalidateQueries({
        queryKey: ['account-recommendations', user],
      })
      await client.invalidateQueries({ queryKey: ['account-people', user] })
      setMessage(
        data.is_public
          ? 'Perfil publicado. Só os dados escolhidos nesta página e suas avaliações públicas aparecem nele.'
          : 'Perfil salvo e fechado para visitantes.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível salvar.',
      )
    } finally {
      setBusy(false)
    }
  }
  const choices = items.filter(
    (item) =>
      item.type === category &&
      !top.some((t) => t.id === item.id) &&
      item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  return (
    <section
      className={
        embedded
          ? 'account-profile-editor community-page'
          : 'lv-page community-page'
      }
    >
      {!embedded && (
        <header className="community-heading">
          <div>
            <p className="eyebrow text-primary">SUA ESTANTE, SUA CARA</p>
            <h1>Seu perfil no Nexo.</h1>
            <p>
              Escolha cinco favoritos de cada formato e o que quer compartilhar.
            </p>
          </div>
          {saved.is_public && saved.username && (
            <Link className="btn btn-outline" to={`/u/${saved.username}`}>
              Ver perfil público →
            </Link>
          )}
        </header>
      )}
      <form className="community-form" onSubmit={submit}>
        {(!embedded || activeSection === 'profile') && (
          <section className="community-panel">
            <h2>Como você aparece</h2>
            <div className="community-columns">
              <label>
                Nome no perfil
                <input
                  required
                  maxLength={80}
                  value={data.display_name}
                  onChange={(e) =>
                    setData({ ...data, display_name: e.target.value })
                  }
                />
              </label>
              <label>
                Nome de usuário
                <input
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[a-z0-9][a-z0-9_-]{2,29}"
                  value={data.username}
                  onChange={(e) =>
                    setData({ ...data, username: e.target.value.toLowerCase() })
                  }
                  aria-describedby="username-help"
                />
                <span id="username-help" className="community-help">
                  Seu endereço: /u/{data.username || 'seu-nome'} · letras
                  minúsculas, números, _ ou -.
                </span>
              </label>
            </div>
            <label>
              Um pouco sobre você
              <textarea
                rows={3}
                maxLength={500}
                value={data.bio}
                onChange={(e) => setData({ ...data, bio: e.target.value })}
              />
            </label>
          </section>
        )}
        {(!embedded || activeSection === 'privacy') && (
          <section className="community-panel">
            <h2>Quem pode ver</h2>
            <label className="community-switch">
              <input
                type="checkbox"
                checked={data.is_public}
                onChange={(e) =>
                  setData({ ...data, is_public: e.target.checked })
                }
              />
              <span>
                <strong>Publicar meu perfil</strong>
                <small>
                  Qualquer pessoa com o endereço poderá ver seu nome, bio, Top 5
                  e avaliações marcadas como públicas. Desative para fechar o
                  perfil.
                </small>
              </span>
            </label>
            <label className="community-switch">
              <input
                type="checkbox"
                checked={data.show_ratings}
                onChange={(e) =>
                  setData({ ...data, show_ratings: e.target.checked })
                }
              />
              <span>
                <strong>Mostrar também minhas notas</strong>
                <small>
                  Inclui as obras que você avaliou só com estrelas. Os textos
                  privados das avaliações continuam privados.
                </small>
              </span>
            </label>
            {(
              [
                [
                  'show_stats',
                  'Mostrar meus totais',
                  'Quantidade de obras concluídas e de favoritos. A lista de favoritos continua privada.',
                ],
                [
                  'show_followers',
                  'Mostrar meus seguidores',
                  'Exibe o total de seguidores e os perfis públicos dessa lista.',
                ],
                [
                  'show_following',
                  'Mostrar quem eu sigo',
                  'Exibe quantos perfis sigo e quais deles são públicos.',
                ],
              ] as const
            ).map(([key, title, help]) => (
              <label className="community-switch" key={key}>
                <input
                  type="checkbox"
                  checked={data[key] ?? false}
                  onChange={(e) =>
                    setData({ ...data, [key]: e.target.checked })
                  }
                />
                <span>
                  <strong>{title}</strong>
                  <small>{help}</small>
                </span>
              </label>
            ))}
          </section>
        )}
        {(!embedded || activeSection === 'favorites') && (
          <section className="community-panel">
            <div className="community-section-heading">
              <div>
                <p className="eyebrow text-primary">ATÉ CINCO DE CADA</p>
                <h2>Os que têm um lugar especial.</h2>
              </div>
              <span>{top.length} / 5</span>
            </div>
            <div
              className="lv-filter-group community-tabs"
              role="group"
              aria-label="Categoria do Top 5"
            >
              {categories.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={category === c.id}
                  className={category === c.id ? 'filter-active' : ''}
                  onClick={() => {
                    setCategory(c.id)
                    setQuery('')
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <ol className="top-five-editor">
              {top.map((item, index) => (
                <li key={item.id}>
                  <span className="top-five-number">{index + 1}</span>
                  <Cover item={item} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.year}</span>
                  </div>
                  <div className="top-five-controls">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Subir ${item.title}`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === top.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Descer ${item.title}`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateTop(top.filter((t) => t.id !== item.id))
                      }
                      aria-label={`Remover ${item.title} do Top 5`}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {!top.length && (
              <p className="community-help">
                Seu Top 5 está aberto. Escolha uma obra da sua lista abaixo.
              </p>
            )}
            <label>
              Adicionar da minha lista
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar pelo título"
              />
            </label>
            <div className="top-five-choices">
              {choices.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={top.length >= 5}
                  onClick={() => updateTop([...top, item])}
                >
                  <Cover item={item} />
                  <span>{item.title}</span>
                  <span aria-hidden="true">+</span>
                </button>
              ))}
            </div>
            {!choices.length && (
              <p className="community-help">
                Nenhuma outra obra nesta categoria.{' '}
                <Link to="/explore">
                  Explore e guarde títulos na sua lista.
                </Link>
              </p>
            )}
          </section>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <div className="community-actions">
          <button
            className="btn btn-primary"
            disabled={
              busy ||
              (embedded && (!data.username.trim() || !data.display_name.trim()))
            }
          >
            {busy ? 'Salvando…' : 'Salvar perfil e favoritos'}
          </button>
          {!embedded && (
            <Link className="btn btn-outline" to="/preferences">
              Detalhar meus gostos
            </Link>
          )}
          {embedded && saved.is_public && saved.username && (
            <Link className="text-button" to={`/u/${saved.username}`}>
              Ver perfil público ↗
            </Link>
          )}
        </div>
        {embedded && (!data.username.trim() || !data.display_name.trim()) && (
          <p className="community-help">
            Preencha seu nome e nome de usuário na aba Perfil para salvar.
          </p>
        )}
      </form>
    </section>
  )
}
export function PublicProfilePage({
  onOpen,
}: {
  onOpen: (item: MediaItem) => void
}) {
  const { username = '' } = useParams()
  return (
    <PublicProfileView key={username} username={username} onOpen={onOpen} />
  )
}
function PublicProfileView({
  username,
  onOpen,
}: {
  username: string
  onOpen: (item: MediaItem) => void
}) {
  const [offset, setOffset] = useState(0)
  const [activityKind, setActivityKind] = useState<'reviews' | 'ratings'>(
    'reviews',
  )
  const [network, setNetwork] = useState<'followers' | 'following' | null>(null)
  const [networkOffset, setNetworkOffset] = useState(0)
  const query = useQuery({
    queryKey: ['public-profile', username],
    queryFn: ({ signal }) => getPublicProfile(username, signal),
    retry: false,
    staleTime: 0,
  })
  const activity = useQuery({
    queryKey: ['public-activity', username, activityKind, offset],
    queryFn: ({ signal }) =>
      getActivity(username, offset, signal, activityKind),
    enabled: !!query.data,
    retry: false,
    staleTime: 0,
  })
  const connections = useQuery({
    queryKey: ['public-connections', username, network, networkOffset],
    queryFn: ({ signal }) =>
      getConnections(username, network!, networkOffset, signal),
    enabled: !!network && !!query.data?.[`show_${network}`],
    staleTime: 0,
    retry: false,
  })
  if (query.isPending)
    return (
      <section className="lv-page community-page" role="status">
        Abrindo perfil…
      </section>
    )
  if (query.isError || !query.data)
    return (
      <section className="lv-page community-page">
        <h1>Este perfil não está disponível.</h1>
        <p>O endereço pode ter mudado ou a pessoa pode ter fechado o perfil.</p>
        <Link className="btn btn-outline" to="/explore">
          Explorar o Nexo
        </Link>
      </section>
    )
  const profile = query.data
  const recent = activity.data?.recent ?? activity.data?.items.slice(0, 4)
  return (
    <section className="lv-page community-page public-profile">
      <header className="community-heading">
        <div>
          <p className="eyebrow text-primary">@{profile.username}</p>
          <h1>{profile.display_name}</h1>
          {profile.bio && <p className="community-preserve">{profile.bio}</p>}
        </div>
        <div className="public-profile-actions">
          <Avatar
            src={profile.avatar_url}
            name={profile.display_name}
            className="community-profile-mark"
          />
          <FollowButton username={profile.username} />
        </div>
      </header>
      <dl className="profile-statistics" aria-label="Estatísticas do perfil">
        {profile.show_stats && (
          <>
            <div>
              <dt>obras exploradas</dt>
              <dd>{profile.stats?.explored ?? 0}</dd>
            </div>
            <div>
              <dt>favoritos</dt>
              <dd>{profile.stats?.favorites ?? 0}</dd>
            </div>
          </>
        )}
        {(['followers', 'following'] as const).map(
          (direction) =>
            profile[`show_${direction}`] && (
              <div key={direction}>
                <dt>{direction === 'followers' ? 'seguidores' : 'seguindo'}</dt>
                <dd>
                  <button
                    aria-label={`${profile.stats?.[direction] ?? 0} ${direction === 'followers' ? 'seguidores' : 'seguindo'}`}
                    onClick={() => {
                      setNetwork(network === direction ? null : direction)
                      setNetworkOffset(0)
                    }}
                    aria-expanded={network === direction}
                  >
                    {profile.stats?.[direction] ?? 0}
                  </button>
                </dd>
              </div>
            ),
        )}
      </dl>
      {network && profile[`show_${network}`] && (
        <section
          className="profile-network"
          aria-label={
            network === 'followers'
              ? 'Seguidores públicos'
              : 'Perfis públicos seguidos'
          }
        >
          <div className="community-section-heading">
            <h2>{network === 'followers' ? 'Seguidores' : 'Seguindo'}</h2>
            <button className="text-button" onClick={() => setNetwork(null)}>
              Fechar lista
            </button>
          </div>
          <p className="community-help">
            Apenas perfis públicos aparecem nesta lista.
          </p>
          {connections.isPending ? (
            <p role="status">Abrindo perfis…</p>
          ) : connections.isError ? (
            <p role="alert">
              Esta lista não está disponível.{' '}
              <button onClick={() => void connections.refetch()}>
                Tentar novamente
              </button>
            </p>
          ) : !connections.data?.items.length ? (
            <p>Nenhum perfil público para mostrar.</p>
          ) : (
            <div className="profile-network-grid">
              {connections.data.items.map((person) => (
                <Link
                  to={`/u/${person.username}`}
                  key={person.username}
                  className="profile-network-person"
                >
                  <Avatar src={person.avatar_url} name={person.display_name} />
                  <span>
                    <strong>{person.display_name}</strong>
                    <small>@{person.username}</small>
                  </span>
                </Link>
              ))}
            </div>
          )}
          {(networkOffset > 0 || (connections.data?.total ?? 0) > 12) && (
            <nav className="community-actions" aria-label="Páginas dos perfis">
              <button
                className="btn btn-outline"
                disabled={!networkOffset || connections.isFetching}
                onClick={() =>
                  setNetworkOffset(Math.max(0, networkOffset - 12))
                }
              >
                Anteriores
              </button>
              <button
                className="btn btn-outline"
                disabled={
                  networkOffset + 12 >= (connections.data?.total ?? 0) ||
                  connections.isFetching
                }
                onClick={() => setNetworkOffset(networkOffset + 12)}
              >
                Próximos
              </button>
            </nav>
          )}
        </section>
      )}
      {categories.map((c) => {
        const top = profile.top_fives[c.id] ?? []
        return (
          top.length > 0 && (
            <section className="public-top-section" key={c.id}>
              <div className="community-section-heading">
                <h2>
                  {c.label} {c.id === 'series' ? 'favoritas' : 'favoritos'}
                </h2>
                <span>TOP {top.length}</span>
              </div>
              <ol className="public-top-five">
                {top.map((item, index) => (
                  <li key={item.id}>
                    <button onClick={() => onOpen(item)}>
                      <Cover item={item} />
                      <span className="top-five-number">{index + 1}</span>
                      <h3>{item.title}</h3>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )
        )
      })}
      <section className="public-activity">
        {!!recent?.length && (
          <section className="profile-recent">
            <div className="community-section-heading">
              <h2>Atividade recente</h2>
            </div>
            <div className="profile-recent-grid">
              {recent.map((row) => (
                <article key={row.item.id}>
                  <button
                    onClick={() => onOpen(row.item)}
                    aria-label={`Abrir atividade: ${row.item.title}`}
                  >
                    <Cover item={row.item} />
                  </button>
                  <div className="profile-recent-meta">
                    <RatingStars rating={row.rating} />
                    <span>{row.item.title}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        <div className="community-section-heading">
          <h2>Avaliações{profile.show_ratings ? ' e notas' : ''}</h2>
          <span>{activity.data?.total ?? 0}</span>
        </div>
        <div
          className="lv-filter-group profile-activity-tabs"
          role="group"
          aria-label="Ver avaliações ou notas"
        >
          {(['reviews', 'ratings'] as const).map((kind) => (
            <button
              key={kind}
              className={`lv-filter ${activityKind === kind ? 'active' : ''}`}
              aria-pressed={activityKind === kind}
              onClick={() => {
                setActivityKind(kind)
                setOffset(0)
              }}
            >
              {kind === 'reviews' ? 'Avaliações escritas' : 'Notas'}
            </button>
          ))}
        </div>
        {activity.isPending ? (
          <p role="status">Abrindo avaliações…</p>
        ) : activity.isError ? (
          <p role="alert">
            Não conseguimos abrir as avaliações.{' '}
            <button onClick={() => void activity.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : !activity.data?.items.length ? (
          <p>
            {activityKind === 'reviews'
              ? 'Nenhuma avaliação escrita pública por enquanto.'
              : 'Nenhuma nota pública por enquanto.'}
          </p>
        ) : activityKind === 'ratings' ? (
          <div className="profile-ratings-grid">
            {activity.data.items.map((row) => (
              <article key={row.item.id}>
                <button onClick={() => onOpen(row.item)}>
                  <Cover item={row.item} />
                  <h3>{row.item.title}</h3>
                </button>
                <RatingStars rating={row.rating} />
              </article>
            ))}
          </div>
        ) : (
          activity.data.items.map((row) => (
            <article key={row.item.id} className="public-review">
              <button
                className="public-review-cover"
                onClick={() => onOpen(row.item)}
                aria-label={`Ver ${row.item.title}`}
              >
                <Cover item={row.item} />
              </button>
              <div>
                <h3>
                  <button onClick={() => onOpen(row.item)}>
                    {row.item.title}
                  </button>
                  {row.item.year && (
                    <span className="profile-review-year">{row.item.year}</span>
                  )}
                </h3>
                <p className="community-review-meta">
                  {row.rating !== null && <RatingStars rating={row.rating} />}
                  <time dateTime={row.updated_at}>
                    {new Date(row.updated_at).toLocaleDateString('pt-BR')}
                  </time>
                </p>
                {row.body &&
                  (row.spoiler ? (
                    <details className="spoiler-review">
                      <summary>Contém spoilers · mostrar avaliação</summary>
                      <p className="community-preserve">{row.body}</p>
                    </details>
                  ) : (
                    <p className="community-preserve">{row.body}</p>
                  ))}
              </div>
            </article>
          ))
        )}
        {(offset > 0 || (activity.data?.total ?? 0) > 12) && (
          <nav
            className="community-actions"
            aria-label="Páginas das avaliações"
          >
            <button
              className="btn btn-outline"
              disabled={offset === 0 || activity.isFetching}
              onClick={() => setOffset(Math.max(0, offset - 12))}
            >
              Anteriores
            </button>
            <span>
              {offset + 1}–{Math.min(offset + 12, activity.data?.total ?? 0)}
            </span>
            <button
              className="btn btn-outline"
              disabled={
                offset + 12 >= (activity.data?.total ?? 0) ||
                activity.isFetching
              }
              onClick={() => setOffset(offset + 12)}
            >
              Próximas
            </button>
          </nav>
        )}
      </section>
    </section>
  )
}
function RatingStars({ rating }: { rating: number | null }) {
  return (
    <span
      className="profile-rating-stars"
      aria-label={rating === null ? 'Sem nota' : `${rating} de 5 estrelas`}
    >
      <span aria-hidden="true">
        {rating === null ? '—' : '★'.repeat(rating)}
        <span className="profile-empty-stars">
          {rating === null ? '' : '★'.repeat(5 - rating)}
        </span>
      </span>
    </span>
  )
}
