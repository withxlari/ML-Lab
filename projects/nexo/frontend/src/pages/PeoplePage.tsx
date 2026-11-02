import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/auth-context'
import { Avatar } from '../components/Avatar'
import { Cover } from '../components/MediaCard'
import { FollowButton } from '../components/FollowButton'
import { Icon } from '../components/Icon'
import {
  getPeople,
  getFollowing,
  unfollowPerson,
  searchPeople,
} from '../services/people'
import type { Person } from '../services/people'
function PersonIdentity({ person }: { person: Person }) {
  return (
    <Link className="person-identity" to={`/u/${person.username}`}>
      <Avatar name={person.display_name} src={person.avatar_url} />
      <div>
        <h3>{person.display_name}</h3>
        <span>@{person.username}</span>
      </div>
    </Link>
  )
}
export function PeopleSuggestions({
  preview = false,
  signature,
}: {
  preview?: boolean
  signature?: unknown
}) {
  const { session, loading } = useAuth()
  const user = session?.user.id
  const [offset, setOffset] = useState(0)
  const [notice, setNotice] = useState('')
  const [searchText, setSearchText] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const normalizedSearch = searchText.trim().replace(/^@+/, '').trim()
  const searching = !preview && !!searchText.trim()
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(normalizedSearch), 450)
    return () => window.clearTimeout(timer)
  }, [normalizedSearch])
  const search = useQuery({
    queryKey: ['public-people-search', searchTerm, offset],
    queryFn: ({ signal }) => searchPeople(searchTerm, offset, signal),
    enabled:
      searching && searchTerm.length >= 2 && searchTerm === normalizedSearch,
    retry: false,
    staleTime: 60_000,
  })
  const query = useQuery({
    queryKey: ['account-people', user, preview, offset, signature],
    queryFn: ({ signal }) => getPeople(user!, preview ? 4 : 12, offset, signal),
    enabled: !!user && !searching,
    retry: false,
    staleTime: 30000,
  })
  return (
    <section
      className={
        preview ? 'people-section' : 'lv-page community-page people-page'
      }
      id="recommended-people"
      aria-labelledby="people-title"
    >
      <header className="people-heading">
        <div>
          <p className="eyebrow text-primary">BOAS COMPANHIAS</p>
          {preview ? (
            <h2 id="people-title">Pessoas com gostos em comum</h2>
          ) : (
            <h1 id="people-title">Pessoas com gostos em comum</h1>
          )}
          <p>
            Conheça os favoritos e as avaliações públicas de quem pode ter boas
            indicações.
          </p>
        </div>
        <div className="people-links">
          {user && (
            <Link className="btn btn-outline" to="/following">
              Perfis que sigo
            </Link>
          )}
          {preview && (
            <Link className="text-button" to="/people">
              Ver mais perfis →
            </Link>
          )}
        </div>
      </header>
      {!preview && (
        <div className="people-search-bar">
          <label className="lv-search">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value)
                setOffset(0)
              }}
              maxLength={80}
              aria-label="Buscar pessoas por nome ou usuário"
              placeholder="Buscar por nome ou @usuário"
            />
          </label>
          {searchText && (
            <button
              className="text-button"
              onClick={() => {
                setSearchText('')
                setSearchTerm('')
                setOffset(0)
              }}
            >
              Limpar busca
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="feedback-notice" role="status">
          {notice}
        </p>
      )}
      {searching ? (
        normalizedSearch.length < 2 ? (
          <p className="people-empty">Digite pelo menos dois caracteres.</p>
        ) : search.isPending || searchTerm !== normalizedSearch ? (
          <p className="people-empty" role="status">
            Buscando perfis…
          </p>
        ) : search.isError ? (
          <div className="people-empty" role="alert">
            <p>Não conseguimos buscar agora.</p>
            <button
              className="btn btn-outline"
              onClick={() => void search.refetch()}
            >
              Tentar novamente
            </button>
          </div>
        ) : !search.data?.items.length ? (
          <div className="people-empty">
            <h3>Nenhum perfil público encontrado.</h3>
            <p>Tente outro nome ou nome de usuário.</p>
          </div>
        ) : (
          <>
            <p className="people-search-count" role="status">
              {search.data.total}{' '}
              {search.data.total === 1
                ? 'perfil encontrado'
                : 'perfis encontrados'}
            </p>
            <div className="people-grid">
              {search.data.items.map((person) => (
                <article className="person-card" key={person.username}>
                  <PersonIdentity person={person} />
                  {person.bio && <p className="person-bio">{person.bio}</p>}
                  <div className="person-card-actions">
                    <Link className="text-button" to={`/u/${person.username}`}>
                      Ver perfil →
                    </Link>
                    <FollowButton username={person.username} />
                  </div>
                </article>
              ))}
            </div>
          </>
        )
      ) : !loading && !user ? (
        <div className="community-panel people-empty">
          <h3>Encontre outras estantes para explorar.</h3>
          <p>Entre para ver pessoas com gostos parecidos com os seus.</p>
          <Link className="btn btn-primary" to="/account">
            Entrar
          </Link>
        </div>
      ) : loading || query.isPending ? (
        <div className="people-empty" role="status">
          Procurando gostos em comum…
        </div>
      ) : query.isError ? (
        <div className="people-empty" role="alert">
          <p>Não conseguimos abrir os perfis agora.</p>
          <button
            className="btn btn-outline"
            onClick={() => void query.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : query.data?.status === 'needs_tastes' ? (
        <div className="people-empty">
          <h3>Comece pelas histórias de que você gosta.</h3>
          <p>
            Dê notas ou marque favoritos na Minha lista. Essas escolhas ajudam a
            encontrar pessoas com gostos em comum.
          </p>
          <Link className="btn btn-outline" to="/library">
            Abrir minha lista
          </Link>
        </div>
      ) : !query.data?.items.length ? (
        <div className="people-empty">
          <h3>Ainda não encontramos uma conexão por aqui.</h3>
          <p>
            As sugestões aparecem conforme mais pessoas publicam seus favoritos
            e avaliações. Perfis que você já segue ficam na sua lista de
            seguidos.
          </p>
        </div>
      ) : (
        <div className="people-grid">
          {query.data.items.map((row) => (
            <article key={row.profile.username} className="person-card">
              <PersonIdentity person={row.profile} />
              {row.profile.bio && (
                <p className="person-bio">{row.profile.bio}</p>
              )}
              <div className="person-connection">
                <p>{row.reason}</p>
                {row.shared_items.length > 0 && (
                  <Link
                    className="person-shared-covers"
                    to={`/u/${row.profile.username}`}
                    aria-label={`Ver obras em comum com @${row.profile.username}`}
                  >
                    {row.shared_items.map((item) => (
                      <Cover key={item.id} item={item} />
                    ))}
                  </Link>
                )}
              </div>
              <div className="person-card-actions">
                <Link className="text-button" to={`/u/${row.profile.username}`}>
                  Ver perfil →
                </Link>
                <FollowButton
                  username={row.profile.username}
                  onChanged={(following) => {
                    setOffset(0)
                    setNotice(
                      following
                        ? `Você agora segue @${row.profile.username}. Encontre esse perfil em “Perfis que sigo”.`
                        : `Você deixou de seguir @${row.profile.username}.`,
                    )
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      {!preview &&
        (searching ? search.data : query.data) &&
        (offset > 0 ||
          ((searching ? search.data?.total : query.data?.total) ?? 0) > 12) && (
          <nav className="community-actions" aria-label="Páginas dos perfis">
            <button
              className="btn btn-outline"
              disabled={
                offset === 0 ||
                (searching ? search.isFetching : query.isFetching)
              }
              onClick={() => setOffset(Math.max(0, offset - 12))}
            >
              Anteriores
            </button>
            <button
              className="btn btn-outline"
              disabled={
                offset + 12 >=
                  ((searching ? search.data?.total : query.data?.total) ?? 0) ||
                (searching ? search.isFetching : query.isFetching)
              }
              onClick={() => setOffset(offset + 12)}
            >
              Próximos
            </button>
          </nav>
        )}
      <p className="people-privacy">
        Dos outros perfis, comparamos apenas Top 5 e notas publicadas. Sua
        biblioteca e seus textos privados continuam privados.
      </p>
    </section>
  )
}
export function FollowingPage() {
  const { session, loading } = useAuth()
  const user = session?.user.id
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['account-following', user, offset],
    queryFn: ({ signal }) => getFollowing(user!, offset, signal),
    enabled: !!user,
    retry: false,
    staleTime: 0,
  })
  async function remove(id: string) {
    if (!user || busy) return
    setBusy(true)
    setError('')
    try {
      await unfollowPerson(user, id)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['account-following', user] }),
        client.invalidateQueries({ queryKey: ['account-people', user] }),
        client.invalidateQueries({ queryKey: ['account-follow-status', user] }),
      ])
      setOffset(0)
      setMessage('Você deixou de seguir este perfil.')
    } catch {
      setError('Não foi possível deixar de seguir. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="lv-page community-page people-page">
      <header className="community-heading">
        <div>
          <p className="eyebrow text-primary">SUAS COMPANHIAS</p>
          <h1>Perfis que sigo</h1>
          <p>Outras estantes para voltar quando quiser uma indicação.</p>
        </div>
        <Link className="btn btn-outline" to="/people">
          Conhecer pessoas
        </Link>
      </header>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !user ? (
        <div className="people-empty">
          <p>Entre para acompanhar seus perfis favoritos.</p>
          <Link className="btn btn-primary" to="/account">
            Entrar
          </Link>
        </div>
      ) : loading || query.isPending ? (
        <p role="status">Abrindo os perfis que você segue…</p>
      ) : query.isError ? (
        <div className="people-empty" role="alert">
          <p>Não conseguimos abrir sua lista.</p>
          <button
            className="btn btn-outline"
            onClick={() => void query.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : !query.data?.items.length ? (
        <div className="people-empty">
          <h2>Sua próxima indicação pode vir de alguém.</h2>
          <p>Você ainda não segue nenhum perfil.</p>
          <Link className="btn btn-primary" to="/people">
            Encontrar perfis
          </Link>
        </div>
      ) : (
        <div className="people-grid">
          {query.data.items.map((row) => (
            <article key={row.followed_id} className="person-card">
              {row.profile ? (
                <>
                  <PersonIdentity person={row.profile} />
                  <p className="person-bio">{row.profile.bio}</p>
                  <Link
                    className="text-button"
                    to={`/u/${row.profile.username}`}
                  >
                    Ver perfil →
                  </Link>
                </>
              ) : (
                <>
                  <h3>Perfil indisponível</h3>
                  <p>
                    Este perfil foi fechado ou não está disponível no momento.
                  </p>
                </>
              )}
              <button
                className="btn btn-outline"
                disabled={busy}
                onClick={() => void remove(row.followed_id)}
              >
                Deixar de seguir
                {row.profile && (
                  <span className="sr-only"> @{row.profile.username}</span>
                )}
              </button>
            </article>
          ))}
        </div>
      )}
      {query.data && (offset > 0 || query.data.total > 12) && (
        <nav className="community-actions" aria-label="Páginas dos seguidos">
          <button
            className="btn btn-outline"
            disabled={!offset || query.isFetching}
            onClick={() => setOffset(Math.max(0, offset - 12))}
          >
            Anteriores
          </button>
          <button
            className="btn btn-outline"
            disabled={offset + 12 >= query.data.total || query.isFetching}
            onClick={() => setOffset(offset + 12)}
          >
            Próximos
          </button>
        </nav>
      )}
      <p className="people-privacy">
        A lista de quem você segue é privada. Fechar um perfil oculta suas
        informações, e você ainda pode deixar de segui-lo.
      </p>
    </section>
  )
}
