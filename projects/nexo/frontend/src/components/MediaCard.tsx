import type { MediaItem } from '../data/selection'
import { mediaLabels } from '../data/selection'
import { Icon } from './Icon'

export function MediaCard({
  item,
  saved,
  onOpen,
  onSave,
}: {
  item: MediaItem
  saved: boolean
  onOpen: () => void
  onSave: () => void
}) {
  return (
    <article className="media-card">
      <div className="poster-wrap">
        <button
          className="poster-button"
          onClick={onOpen}
          aria-label={`Ver detalhes de ${item.title}, ${mediaLabels[item.type].toLowerCase()}`}
        >
          <img
            src={item.image}
            alt={`Capa de ${item.title}`}
            loading="lazy"
            width="400"
            height="600"
          />
          <span className="poster-overlay">
            <span>
              Ver detalhes <Icon name="arrow" size={17} />
            </span>
          </span>
        </button>
        <button
          className={`save-button ${saved ? 'is-saved' : ''}`}
          aria-label={`${saved ? 'Remover' : 'Guardar'} ${item.title}, ${mediaLabels[item.type].toLowerCase()}`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Icon name={saved ? 'check' : 'bookmark'} size={18} />
        </button>
      </div>
      <div className="card-caption">
        <span>{mediaLabels[item.type]}</span>
        <span>{item.year}</span>
      </div>
      <h3>
        <button onClick={onOpen}>{item.title}</button>
      </h3>
      <p>{item.creator}</p>
    </article>
  )
}
