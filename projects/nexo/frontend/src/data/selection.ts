import type { LibraryFeedback } from './library'
export type MediaType = 'movie' | 'series' | 'book' | 'manga' | 'game'
export interface MediaItem {
  id: string
  apiId?: string
  title: string
  originalTitle?: string
  type: MediaType
  year: number | null
  creator: string
  creators?: string[]
  genres: string[]
  image: string
  backdrop?: string
  isAdult?: boolean
  ageRating?: string
  isbn13?: string
  language?: string
  publisher?: string
  editionDate?: string
  description: string
  note: string
  source: string
  provider?: 'tmdb' | 'open_library' | 'google_books' | 'kitsu' | 'igdb'
  entityType?: string
  externalId?: string
  platforms?: string[]
  aliases?: string[]
  library?: LibraryFeedback
}
export const mediaLabels: Record<MediaType, string> = {
  movie: 'Filme',
  series: 'Série',
  book: 'Livro',
  manga: 'Mangá',
  game: 'Jogo',
}
