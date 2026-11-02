import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mediaLabels, type MediaItem } from '../data/selection'
import { getMediaDetails } from '../services/catalog'
import { Icon } from './Icon'
import { CoverReveal } from './MediaCard'
import { useCoverGate } from '../hooks/useCoverGate'
export function ExploreHighlight({
  items,
  onOpen,
}: {
  items: MediaItem[]
  onOpen: (item: MediaItem) => void
}) {
  const [position, setPosition] = useState(() =>
    Math.floor(Math.random() * Math.max(1, items.length)),
  )
  const [paused, setPaused] = useState(false)
  const item = items[position % items.length]
  const details = useQuery({
    queryKey: ['media-details', item?.id, item?.isbn13],
    queryFn: ({ signal }) => getMediaDetails(item!, signal),
    enabled: Boolean(
      item?.provider &&
      !item.note &&
      item.description === 'Ainda não temos uma sinopse para este título.',
    ),
    staleTime: 24 * 3600000,
    retry: false,
  })
  const artwork = details.data ?? item
  const gate = useCoverGate(artwork)
  useEffect(() => {
    if (
      paused ||
      items.length < 2 ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return
    const timer = window.setInterval(() => {
      if (!document.hidden) setPosition((current) => current + 1)
    }, 45000)
    return () => window.clearInterval(timer)
  }, [items.length, paused])
  if (!item || !artwork) return null
  const image =
    artwork.backdrop ??
    (item.id === 'interstellar'
      ? '/images/interstellar-backdrop.jpg'
      : artwork.image)
  const text =
    item.note ||
    (artwork.description === 'Ainda não temos uma sinopse para este título.'
      ? ''
      : artwork.description)
  return (
    <div
      className="explore-highlight mt-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className={`explore-highlight-panel ${artwork.backdrop || item.id === 'interstellar' ? 'has-backdrop' : 'has-portrait'}`}
      >
        <div
          className={`explore-highlight-art ${artwork.backdrop || item.id === 'interstellar' ? 'has-backdrop' : ''}`}
        >
          <button
            type="button"
            className="highlight-art-open"
            onClick={() => onOpen(artwork)}
            aria-label={`Abrir destaque: ${item.title}`}
          >
            <img
              key={image}
              src={image}
              alt={`Capa de ${item.title}`}
              className={gate.blocked ? 'mature-image-blurred' : ''}
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = '/images/poster-placeholder.svg'
              }}
            />
          </button>
          <CoverReveal item={artwork} />
        </div>
        <div className="p-6 sm:p-8">
          <p className="eyebrow opacity-70">Em destaque</p>
          <h2 className="mt-3 font-display text-4xl">{item.title}</h2>
          <p className="mt-1 text-sm opacity-70">
            {[mediaLabels[item.type], item.year, item.creator]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {text && (
            <p className="mt-4 font-display text-xl italic leading-snug">
              {text.length > 240 ? `${text.slice(0, 237).trimEnd()}…` : text}
            </p>
          )}
          <button
            type="button"
            onClick={() => onOpen(artwork)}
            className="mt-6 inline-block text-sm font-semibold underline underline-offset-4"
          >
            Ver detalhes
          </button>
        </div>
      </div>
      {items.length > 1 && (
        <button
          className="text-button mt-3"
          onClick={() => setPosition((current) => current + 1)}
        >
          Outro destaque <Icon name="arrow" size={16} />
        </button>
      )}
    </div>
  )
}
