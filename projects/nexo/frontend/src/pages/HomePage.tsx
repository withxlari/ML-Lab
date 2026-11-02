import { Link } from 'react-router'
import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Cover } from '../components/MediaCard'
import { HeroFan, CoverMarquee } from '../components/HeroFan'
import type { MediaItem, MediaType } from '../data/selection'
import { isMatureGame } from '../hooks/useCoverGate'
const categoryLabels = {
  movie: 'Filmes',
  series: 'Séries',
  book: 'Livros',
  manga: 'Mangás',
  game: 'Jogos',
}
const categoryArtwork: Record<MediaType, string> = {
  movie: '/images/past-lives.jpg',
  series: '/images/dark.jpg',
  book: '/images/midnight-library.jpg',
  manga: '/images/boku-no-hero-academia.jpg',
  game: '/images/witcher-3.jpg',
}
export function HomePage({
  selection,
  examples = [],
}: {
  selection: MediaItem[]
  examples?: MediaItem[]
  onOpen: (item: MediaItem) => void
}) {
  const byId = (id: string) =>
    [...examples, ...selection].find((item) => item.id === id)
  const safeSelection = selection.filter((item) => !isMatureGame(item))
  const mediaTypes: MediaType[] = ['movie', 'series', 'book', 'manga', 'game']
  return (
    <div className="min-h-screen">
      <main>
        <section className="relative overflow-hidden grain">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
            <div className="animate-rise">
              <p className="eyebrow text-primary">
                Filmes · Séries · Livros · Mangás · Jogos
              </p>
              <h1 className="mt-5 font-display text-[clamp(2.75rem,7vw,5.5rem)] font-normal leading-[0.95] tracking-tight">
                O que vem <em className="text-primary">depois</em> daquilo que
                você amou?
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
                No Nexo você explora obras de cinco formatos, guarda o que quer
                ver, ler ou jogar, dá notas e recebe sugestões ligadas ao que
                você já gosta — inclusive de um formato para outro.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/explore" className="btn btn-primary">
                  Explorar obras <Icon name="arrow" className="size-4" />
                </Link>
                <Link to="/account?mode=signup" className="btn btn-outline">
                  Criar conta
                </Link>
              </div>
            </div>

            <HeroFan items={safeSelection} />
          </div>
        </section>

        <CoverMarquee items={safeSelection} />

        <section className="border-y bg-card">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[auto_1fr] md:items-center md:gap-14">
            <div className="flex items-center gap-3">
              <div className="w-24 overflow-hidden rounded shadow-cover">
                {byId('dune') && <Cover item={byId('dune')!} />}
              </div>
              <span className="font-display text-4xl italic text-primary">
                →
              </span>
              <div className="w-24 overflow-hidden rounded shadow-cover">
                {byId('dune-book') && <Cover item={byId('dune-book')!} />}
              </div>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Como funciona</p>
              <p className="mt-3 max-w-2xl font-display text-3xl leading-snug">
                Gostou do filme <em>Duna</em>? O livro de Frank Herbert pode ser
                o próximo. Cada sugestão vem com o motivo — gêneros ou palavras
                das descrições em comum com as obras que você marcou.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-4xl sm:text-5xl">
              Cinco estantes
            </h2>
            <Link
              to="/explore"
              className="text-sm font-semibold underline-offset-4 hover:underline"
            >
              Ver tudo
            </Link>
          </div>
          <ul className="home-shelves-grid">
            {mediaTypes.map((t) => (
              <li key={t}>
                <CategoryShelf
                  key={`${t}:${safeSelection.find((item) => item.type === t)?.image ?? ''}`}
                  type={t}
                  artwork={
                    safeSelection.find(
                      (item) =>
                        item.type === t &&
                        item.image &&
                        !item.image.endsWith('/poster-placeholder.svg'),
                    )?.image
                  }
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-wine text-paper">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-3">
            {[
              [
                'Guardar',
                'Crie uma conta para montar sua lista e registrar o andamento do que você vê, lê e joga.',
              ],
              [
                'Avaliar',
                'Com sua conta, dê notas de 1 a 5, marque favoritos e escreva o que achou de cada obra.',
              ],
              [
                'Para você',
                'Sugestões a partir dos seus gostos reais, sempre com o motivo da escolha ao lado.',
              ],
            ].map(([t, d], i) => (
              <div key={t}>
                <p className="font-display text-6xl italic opacity-40">
                  {i + 1}
                </p>
                <h3 className="mt-2 font-display text-3xl">{t}</h3>
                <p className="mt-3 leading-relaxed opacity-80">{d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
function CategoryShelf({
  type,
  artwork,
}: {
  type: MediaType
  artwork?: string
}) {
  const [failed, setFailed] = useState(false)
  const image = !failed && artwork ? artwork : categoryArtwork[type]
  return (
    <Link
      className={`home-shelf-card home-shelf-${type}`}
      to={`/explore?type=${type}`}
      aria-label={categoryLabels[type]}
    >
      {image && (
        <img
          className="home-shelf-art"
          src={image}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <span className="home-shelf-label">{categoryLabels[type]}</span>
    </Link>
  )
}
