import { Wordmark } from './SiteHeader'
export function SiteFooter({ onCredits }: { onCredits: () => void }) {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_2fr]">
        <div>
          <span className="text-primary">
            <Wordmark />
          </span>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Filmes, séries, livros, mangás e jogos num lugar só.
          </p>
          <p className="development-notice mt-4 max-w-sm text-sm">
            <strong>Em desenvolvimento.</strong> Esta ainda não é a versão final
            do Nexo. As funções e o visual podem mudar.
          </p>
        </div>
        <div className="space-y-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-2">
            <img src="/images/tmdb.svg" alt="TMDB" className="h-3" />
            Este produto usa a API do TMDB, mas não é endossado nem certificado
            pelo TMDB.
          </p>
          <p>
            Livros via Google Books e Open Library · Seleção brasileira:
            BookInfo · Mangás via Kitsu · Jogos via IGDB.
          </p>
          <p>
            Fontes: DM Sans e Newsreader (SIL Open Font License) —{' '}
            <a className="underline" href="/licenses/dm-sans.txt">
              licença DM Sans
            </a>
            ,{' '}
            <a className="underline" href="/licenses/newsreader.txt">
              licença Newsreader
            </a>
            .
          </p>
          <button className="underline" onClick={onCredits}>
            Sobre o Nexo
          </button>
        </div>
      </div>
    </footer>
  )
}
