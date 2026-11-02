import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/auth-context'
import type { MediaItem } from '../data/selection'
import { deleteReview, getReview, saveReview } from '../services/community'
import type { Review } from '../services/community'
export function ReviewEditor({
  item,
  rating,
}: {
  item: MediaItem
  rating: number | null
}) {
  const { session } = useAuth()
  const user = session?.user.id
  const query = useQuery({
    queryKey: ['account-review', user, item.id],
    queryFn: ({ signal }) => getReview(user!, item.id, signal),
    enabled: !!user,
    retry: false,
  })
  if (!user) return null
  if (query.isPending)
    return (
      <div className="review-editor" role="status">
        Abrindo sua avaliação…
      </div>
    )
  if (query.isError)
    return (
      <div className="review-editor" role="alert">
        Não conseguimos abrir sua avaliação.{' '}
        <button className="text-button" onClick={() => void query.refetch()}>
          Tentar novamente
        </button>
      </div>
    )
  return (
    <ReviewForm
      key={`${user}:${item.id}`}
      user={user}
      item={item}
      rating={rating}
      initial={query.data ?? null}
    />
  )
}
function ReviewForm({
  user,
  item,
  rating,
  initial,
}: {
  user: string
  item: MediaItem
  rating: number | null
  initial: Review | null
}) {
  const client = useQueryClient()
  const [body, setBody] = useState(initial?.body ?? '')
  const [visibility, setVisibility] = useState<'private' | 'public'>(
    initial?.visibility ?? 'private',
  )
  const [spoiler, setSpoiler] = useState(initial?.spoiler ?? false)
  const [exists, setExists] = useState(!!initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function invalidate() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['account-library', user] }),
      client.invalidateQueries({ queryKey: ['account-recommendations', user] }),
      client.invalidateQueries({ queryKey: ['public-activity'] }),
    ])
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const saved = await saveReview(user, item, {
        body,
        rating,
        visibility,
        spoiler,
      })
      client.setQueryData(['account-review', user, item.id], saved)
      setExists(true)
      await invalidate()
      setMessage('Avaliação salva.')
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível salvar.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    setBusy(true)
    setError('')
    try {
      await deleteReview(user, item.id)
      client.setQueryData(['account-review', user, item.id], null)
      setBody('')
      setExists(false)
      await invalidate()
      setMessage('Texto excluído. Sua nota continua na lista.')
    } catch {
      setError('Não foi possível excluir. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="review-editor community-form" onSubmit={submit}>
      <h3>O que ficou com você?</h3>
      <p>
        Conte o que gostou e o que não funcionou. Sua nota ajuda a interpretar o
        texto nas sugestões.
      </p>
      <label>
        Sua avaliação
        <textarea
          rows={5}
          maxLength={4000}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Pode ser uma cena, um personagem, o final…"
        />
      </label>
      <span className="community-help">
        {body.length} / 4000 ·{' '}
        {rating === null ? 'Sem nota' : `${rating} de 5 estrelas`}
      </span>
      <fieldset className="review-visibility">
        <legend>Quem pode ler este texto?</legend>
        <label>
          <input
            type="radio"
            name={`visibility-${item.id}`}
            checked={visibility === 'private'}
            onChange={() => setVisibility('private')}
          />{' '}
          Só eu
        </label>
        <label>
          <input
            type="radio"
            name={`visibility-${item.id}`}
            checked={visibility === 'public'}
            onChange={() => setVisibility('public')}
          />{' '}
          Visitantes do meu perfil público
        </label>
      </fieldset>
      <label className="community-switch">
        <input
          type="checkbox"
          checked={spoiler}
          onChange={(e) => setSpoiler(e.target.checked)}
        />
        <span>Este texto contém spoilers</span>
      </label>
      <p className="community-help">
        Textos públicos só aparecem para visitantes quando você{' '}
        <Link to="/account?section=privacy">publica seu perfil</Link>. Textos
        privados nunca aparecem nele. Para notas 1 e 2, o texto conta como sinal
        negativo; para 4 e 5, positivo.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="community-actions">
        <button className="btn btn-primary" disabled={busy || !body.trim()}>
          {busy ? 'Salvando…' : 'Salvar avaliação'}
        </button>
        {exists && (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => void remove()}
          >
            Excluir texto
          </button>
        )}
      </div>
    </form>
  )
}
