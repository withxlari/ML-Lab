export type MediaType = 'movie' | 'series' | 'book'

export interface MediaItem {
  id: string
  title: string
  originalTitle?: string
  type: MediaType
  year: number
  creator: string
  genres: string[]
  image: string
  description: string
  note: string
  source: string
}

export const mediaLabels: Record<MediaType, string> = {
  movie: 'Filme',
  series: 'Série',
  book: 'Livro',
}

// A small editorial sample for interface development, not model recommendations.
export const selection: MediaItem[] = [
  {
    id: 'interstellar',
    title: 'Interestelar',
    originalTitle: 'Interstellar',
    type: 'movie',
    year: 2014,
    creator: 'Christopher Nolan',
    genres: ['Ficção científica', 'Drama'],
    image: '/images/interstellar.jpg',
    description:
      'Com a Terra se tornando inabitável, um grupo de astronautas parte em busca de um novo lar. Cooper deixa os filhos para trás e embarca numa viagem em que tempo e distância ganham outro peso.',
    note: 'Uma viagem pelo espaço que, no fundo, é sobre voltar para casa.',
    source: 'https://www.themoviedb.org/movie/157336',
  },
  {
    id: 'budapest',
    title: 'O Grande Hotel Budapeste',
    type: 'movie',
    year: 2014,
    creator: 'Wes Anderson',
    genres: ['Comédia', 'Aventura'],
    image: '/images/budapest.jpg',
    description:
      'Um concierge e seu jovem ajudante se envolvem numa disputa por uma herança. Entre fugas, doces e um quadro desaparecido, nasce uma amizade improvável.',
    note: 'Para reparar em cada cor, cenário e pequeno absurdo.',
    source: 'https://www.themoviedb.org/movie/120467',
  },
  {
    id: 'severance',
    title: 'Ruptura',
    originalTitle: 'Severance',
    type: 'series',
    year: 2022,
    creator: 'Dan Erickson',
    genres: ['Suspense', 'Ficção científica'],
    image: '/images/severance.jpg',
    description:
      'Funcionários de uma empresa passam por um procedimento que separa as memórias do trabalho das memórias pessoais. A rotina começa a desmoronar quando um deles tenta entender o que existe do outro lado.',
    note: 'O tipo de série que rende conversa depois de cada episódio.',
    source: 'https://www.themoviedb.org/tv/95396',
  },
  {
    id: 'dune-book',
    title: 'Duna',
    type: 'book',
    year: 1965,
    creator: 'Frank Herbert',
    genres: ['Ficção científica', 'Política'],
    image: '/images/dune-book.jpg',
    description:
      'A família Atreides assume o controle de Arrakis, um planeta desértico que produz a substância mais disputada do universo. Paul Atreides se vê no centro de conflitos políticos, religiosos e ecológicos.',
    note: 'Política, areia e um planeta inteiro em disputa.',
    source: 'https://openlibrary.org/isbn/9780441172719',
  },
  {
    id: 'past-lives',
    title: 'Vidas Passadas',
    originalTitle: 'Past Lives',
    type: 'movie',
    year: 2023,
    creator: 'Celine Song',
    genres: ['Drama', 'Romance'],
    image: '/images/past-lives.jpg',
    description:
      'Amigos de infância separados pela imigração se reencontram muitos anos depois. Em alguns dias em Nova York, conversam sobre as vidas que construíram e aquelas que poderiam ter vivido.',
    note: 'Para ver sem pressa e deixar a conversa continuar.',
    source: 'https://www.themoviedb.org/movie/666277',
  },
  {
    id: 'dark',
    title: 'Dark',
    type: 'series',
    year: 2017,
    creator: 'Baran bo Odar e Jantje Friese',
    genres: ['Mistério', 'Ficção científica'],
    image: '/images/dark.jpg',
    description:
      'O desaparecimento de uma criança expõe os segredos de quatro famílias de uma cidade alemã. A investigação atravessa gerações e coloca em dúvida a relação entre passado, presente e futuro.',
    note: 'Pode ser uma boa ideia ter papel e caneta por perto.',
    source: 'https://www.themoviedb.org/tv/70523',
  },
  {
    id: 'dune',
    title: 'Duna',
    type: 'movie',
    year: 2021,
    creator: 'Denis Villeneuve',
    genres: ['Ficção científica', 'Aventura'],
    image: '/images/dune.jpg',
    description:
      'Paul Atreides chega a Arrakis com a família e encontra um planeta marcado pela exploração de sua especiaria. Uma traição muda seu destino e o aproxima do povo que vive no deserto.',
    note: 'Um daqueles filmes que pedem a maior tela da casa.',
    source: 'https://www.themoviedb.org/movie/438631',
  },
  {
    id: 'midnight-library',
    title: 'A Biblioteca da Meia-Noite',
    type: 'book',
    year: 2020,
    creator: 'Matt Haig',
    genres: ['Ficção', 'Fantasia'],
    image: '/images/midnight-library.jpg',
    description:
      'Nora encontra uma biblioteca onde cada livro permite experimentar uma vida diferente. Ao abrir suas páginas, ela revisita escolhas e descobre os caminhos que não chegou a seguir.',
    note: 'Para quem já se pegou pensando: e se eu tivesse escolhido diferente?',
    source: 'https://openlibrary.org/isbn/9780525559474',
  },
]
