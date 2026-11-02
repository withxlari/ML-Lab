import type { MediaItem } from './selection'

export function coverSources(item: MediaItem) {
  return [
    item.image,
    item.type === 'book' && /^97[89][0-9]{10}$/.test(item.isbn13 ?? '')
      ? `https://covers.openlibrary.org/b/isbn/${item.isbn13}-L.jpg?default=false`
      : undefined,
    item.backdrop,
  ]
}
