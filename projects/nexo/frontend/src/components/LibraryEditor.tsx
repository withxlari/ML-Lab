import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { MediaItem } from '../data/selection'
import { emptyFeedback, libraryStatuses, statusLabel } from '../data/library'
import type { LibraryFeedback, LibraryStatus } from '../data/library'
import { Icon } from './Icon'
export function LibraryEditor({
  item,
  saved,
  signedIn,
  entry,
  pending,
  onSave,
}: {
  item: MediaItem
  saved: boolean
  signedIn: boolean
  entry?: LibraryFeedback
  pending: boolean
  onSave: (update: LibraryFeedback) => Promise<void>
}) {
  const [draft, setDraft] = useState<LibraryFeedback>(() => ({
    ...(entry ?? emptyFeedback),
  }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const changed =
    draft.status !== (entry ?? emptyFeedback).status ||
    draft.rating !== (entry ?? emptyFeedback).rating ||
    draft.isFavorite !== (entry ?? emptyFeedback).isFavorite ||
    (draft.reaction ?? null) !== (entry?.reaction ?? null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSave(draft)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não conseguimos salvar. Tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }
  if (!signedIn)
    return (
      <div className="library-invite">
        <p>Já conhece? Guarde sua nota e seus favoritos na conta.</p>
        <Link to="/account">
          Entrar no Nexo <Icon name="arrow" size={15} />
        </Link>
      </div>
    )
  if (!saved)
    return (
      <p className="library-invite">
        Guarde na sua lista para marcar o andamento, dar uma nota ou escolher
        como favorito.
      </p>
    )
  return (
    <form
      className="library-editor"
      onSubmit={submit}
      aria-label={`Sua experiência com ${item.title}`}
    >
      <div className="library-editor-heading">
        <h3>Na sua lista</h3>
        <button
          type="button"
          className={`favorite-toggle ${draft.isFavorite ? 'is-favorite' : ''}`}
          aria-pressed={draft.isFavorite}
          onClick={() => setDraft({ ...draft, isFavorite: !draft.isFavorite })}
          disabled={busy || pending}
        >
          <Icon name="heart" size={18} /> Favorito
        </button>
      </div>
      <label className="progress-field">
        Como está por aí?
        <span className="status-select">
          <Icon name="progress" size={18} />
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft({
                ...draft,
                status: event.target.value as LibraryStatus,
              })
            }
            disabled={busy || pending}
          >
            {libraryStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status, item.type)}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={16} />
        </span>
      </label>
      {draft.status === 'completed' && (
        <fieldset className="library-reaction">
          <legend>Você gostou?</legend>
          <div className="library-reaction-options">
            {(
              [
                ['liked', 'Gostei'],
                ['disliked', 'Não gostei'],
                [null, 'Sem opinião'],
              ] as const
            ).map(([reaction, label]) => (
              <button
                key={label}
                type="button"
                className="outline-button"
                aria-pressed={(draft.reaction ?? null) === reaction}
                disabled={busy || pending}
                onClick={() => setDraft({ ...draft, reaction })}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="rating-heading">
        <span>Sua nota</span>
        <span>
          {draft.rating === null ? 'Ainda sem nota' : `${draft.rating} de 5`}
        </span>
      </div>
      <div
        className="rating-buttons"
        role="group"
        aria-label="Escolher nota de 1 a 5"
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={`rating-star ${draft.rating !== null && value <= draft.rating ? 'is-filled' : ''}`}
            aria-label={`${value} ${value === 1 ? 'estrela' : 'estrelas'}`}
            aria-pressed={draft.rating === value}
            disabled={busy || pending}
            onClick={() => setDraft({ ...draft, rating: value })}
          >
            <Icon name="star" size={25} />
          </button>
        ))}
        {draft.rating !== null && (
          <button
            type="button"
            className="text-button clear-rating"
            disabled={busy || pending}
            onClick={() => setDraft({ ...draft, rating: null })}
          >
            Tirar nota
          </button>
        )}
      </div>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      <button className="outline-button" disabled={busy || pending || !changed}>
        {busy || pending ? 'Salvando…' : 'Salvar alterações'}
      </button>
      <p className="library-private">Só você vê sua nota e seus favoritos.</p>
    </form>
  )
}
