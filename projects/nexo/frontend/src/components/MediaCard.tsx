import { useState } from 'react'
import { Icon } from './Icon'
import { statusLabel } from '../data/library'
import { mediaLabels, type MediaItem } from '../data/selection'
import { useCoverGate } from '../hooks/useCoverGate'
export function Cover({
  item,
  className = '',
}: {
  item: MediaItem
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const gate = useCoverGate(item)
  if (!item.image || failed) {
    return (
      <div
        className={`flex aspect-[2/3] flex-col justify-between bg-accent p-4 text-accent-foreground ${className}`}
        role="img"
        aria-label={`Capa indisponível: ${item.title}`}
      >
        <span className="eyebrow">{mediaLabels[item.type]}</span>
        <span className="font-display text-xl italic leading-tight line-clamp-4">
          {item.title}
        </span>
      </div>
    )
  }
  const image = (
    <img
      src={item.image}
      alt={`Capa de ${item.title}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`aspect-[2/3] w-full object-cover ${className} ${gate.blocked ? 'mature-image-blurred' : ''}`}
    />
  )
  return gate.blocked ? (
    <span className="protected-cover">
      {image}
      <span className="protected-cover-label" aria-hidden="true">
        +18
      </span>
    </span>
  ) : (
    image
  )
}
export function CoverReveal({ item }: { item: MediaItem }) {
  const gate = useCoverGate(item)
  if (!gate.blocked) return null
  return (
    <button
      type="button"
      className="cover-reveal"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        gate.reveal()
      }}
      aria-label={`Revelar capa +18 de ${item.title}`}
    >
      <strong>+18</strong>
      <span>Conteúdo adulto</span>
      <small>Clique para revelar a capa</small>
    </button>
  )
}
export function MediaCard({
  item,
  saved,
  onOpen,
  onSave,
  busy = false,
}: {
  item: MediaItem
  saved: boolean
  onOpen: () => void
  onSave: () => void
  busy?: boolean
}) {
  return (
    <article className="lv-card group relative">
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full text-left"
          aria-label={`Ver detalhes de ${item.title}, ${mediaLabels[item.type].toLowerCase()}`}
        >
          <div className="relative overflow-hidden rounded-md shadow-cover transition-transform duration-300 group-hover:-translate-y-1">
            <Cover
              item={item}
              className="transition-transform duration-700 group-hover:scale-[1.06]"
            />
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-ink/95 via-ink/60 to-transparent p-3 text-paper opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
              {item.genres.length > 0 && (
                <p className="eyebrow text-[0.62rem] opacity-80">
                  {item.genres.join(' · ')}
                </p>
              )}
              <p className="mt-1 text-xs leading-snug line-clamp-4">
                {item.note || item.description || 'Sem sinopse ainda.'}
              </p>
              <span className="mt-2 text-xs font-semibold underline underline-offset-4">
                Ver detalhes
              </span>
            </div>
          </div>
        </button>
        <CoverReveal item={item} />
      </div>
      <h3 className="mt-3 font-display text-lg leading-snug line-clamp-2 group-hover:text-primary">
        <button type="button" onClick={onOpen}>
          {item.title}
        </button>
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {mediaLabels[item.type]}
        {item.year ? ` · ${item.year}` : ''}
      </p>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        aria-pressed={saved}
        aria-label={`${saved ? 'Remover' : 'Guardar'} ${item.title}, ${mediaLabels[item.type].toLowerCase()}`}
        className="absolute right-2 top-2 inline-flex size-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-cover backdrop-blur transition active:scale-90 hover:bg-primary hover:text-primary-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
      >
        {saved ? (
          <Icon name="bookmark-check" size={20} />
        ) : (
          <Icon name="bookmark" size={20} />
        )}
      </button>
      {item.library && (
        <div className="library-card-meta">
          <span
            className="library-card-status"
            data-status={item.library.status}
          >
            {statusLabel(item.library.status, item.type)}
          </span>
          {item.library.rating !== null && (
            <span
              className="library-card-rating"
              aria-label={`Sua nota: ${item.library.rating} de 5`}
            >
              <Icon name="star" size={15} />
              <strong>{item.library.rating}</strong>
              <span className="library-rating-scale" aria-hidden="true">
                / 5
              </span>
            </span>
          )}
          {item.library.isFavorite && (
            <span
              className="library-card-favorite"
              aria-label="Favorito"
              title="Favorito"
            >
              <Icon name="heart" size={15} />
            </span>
          )}
          {item.library.reaction && (
            <span className="library-card-reaction">
              {item.library.reaction === 'liked' ? 'Gostei' : 'Não gostei'}
            </span>
          )}
        </div>
      )}
    </article>
  )
}
export function MediaCardSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="aspect-[2/3] rounded-md bg-muted" />
      <div className="mt-3 h-4 w-3/4 rounded bg-muted" />
      <div className="mt-2 h-3 w-1/3 rounded bg-muted" />
    </div>
  )
}
