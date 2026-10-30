import { Link } from 'react-router'
import type { MediaItem } from '../data/selection'
import { selection } from '../data/selection'
import { Icon } from '../components/Icon'

const covers = [
  { id: 'interstellar', label: 'Filmes', className: 'cover-film' },
  { id: 'severance', label: 'Séries', className: 'cover-series' },
  { id: 'dune-book', label: 'Livros', className: 'cover-book' },
]

export function HomePage({ onOpen }: { onOpen: (item: MediaItem) => void }) {
  return (
    <>
      <section className="landing-hero" aria-labelledby="home-title">
        <div className="landing-copy">
          <span className="eyebrow">FILMES, SÉRIES E LIVROS. JUNTOS.</span>
          <h1 id="home-title">
            Gostou do filme?
            <br />O próximo pode
            <br />
            ser um livro.
          </h1>
          <p>
            O Nexo reúne histórias para você descobrir o que ver e ler a seguir.
            Explore os títulos e guarde os que chamarem sua atenção.
          </p>
          <div className="landing-actions">
            <Link className="primary-button" to="/explore">
              Explorar títulos <Icon name="arrow" size={18} />
            </Link>
            <a className="text-button" href="#como-funciona">
              Conhecer o Nexo <Icon name="chevron" size={16} />
            </a>
          </div>
          <span className="landing-footnote">
            Pode entrar. Não precisa de conta.
          </span>
        </div>
        <div
          className="landing-art"
          aria-label="Um pouco do que você encontra no Nexo"
        >
          <span className="art-index">NA TELA & NO PAPEL</span>
          {covers.map((cover) => {
            const item = selection.find((entry) => entry.id === cover.id)!
            return (
              <button
                key={item.id}
                className={`landing-cover ${cover.className}`}
                aria-label={`Conhecer ${item.title}, ${cover.label.toLowerCase()}`}
                onClick={() => onOpen(item)}
              >
                <img
                  src={item.image}
                  alt={`Capa de ${item.title}`}
                  width="230"
                  height="345"
                />
                <span>{cover.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="landing-types" aria-labelledby="types-title">
        <h2 id="types-title">
          Seu gosto não precisa
          <br />
          caber num formato.
        </h2>
        <Link to="/explore?type=movie">
          <span aria-hidden="true">01</span>
          <strong>Filmes</strong>
          <Icon name="arrow" size={19} />
        </Link>
        <Link to="/explore?type=series">
          <span aria-hidden="true">02</span>
          <strong>Séries</strong>
          <Icon name="arrow" size={19} />
        </Link>
        <Link to="/explore?type=book">
          <span aria-hidden="true">03</span>
          <strong>Livros</strong>
          <Icon name="arrow" size={19} />
        </Link>
      </section>

      <section
        id="como-funciona"
        className="landing-how"
        aria-labelledby="how-title"
      >
        <div className="how-intro">
          <span className="eyebrow">UM POUCO SOBRE O NEXO</span>
          <h2 id="how-title">
            Menos abas abertas.
            <br />
            Mais coisas boas
            <br />
            na sua lista.
          </h2>
          <p>
            Aquele filme que alguém comentou. O livro que você não quer
            esquecer. A série que ficou para depois. Aqui, eles podem ficar
            juntos.
          </p>
          <Link className="text-button" to="/explore">
            Dar uma olhada <Icon name="arrow" size={17} />
          </Link>
        </div>
        <ol className="how-steps">
          <li>
            <span aria-hidden="true">01</span>
            <div>
              <h3>Comece pelo que dá vontade.</h3>
              <p>
                Passe pelas capas, busque um título ou escolha entre filmes,
                séries e livros.
              </p>
            </div>
          </li>
          <li>
            <span aria-hidden="true">02</span>
            <div>
              <h3>Conheça antes de escolher.</h3>
              <p>
                Leia a sinopse e veja os gêneros, o ano e quem está por trás da
                obra.
              </p>
            </div>
          </li>
          <li>
            <span aria-hidden="true">03</span>
            <div>
              <h3>Guarde para a hora certa.</h3>
              <p>
                Marque o que interessar e volte quando quiser. Por enquanto, sua
                lista fica salva neste navegador.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="landing-cta">
        <span className="eyebrow">COMECE PELA SELEÇÃO</span>
        <h2>
          O que você anda
          <br />
          com vontade de descobrir?
        </h2>
        <Link className="primary-button" to="/explore">
          Vamos encontrar <Icon name="arrow" size={18} />
        </Link>
      </section>
    </>
  )
}
