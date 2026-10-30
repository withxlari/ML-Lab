> Especificação fornecida pelo usuário, com o nome atualizado para Nexo. Descreve o produto planejado; não é um registro de funcionalidades concluídas.

# Nexo
## Documentação de Produto, Arquitetura e Desenvolvimento

**Nome do projeto:** Nexo  
**Tipo:** Aplicação Web — Sistema Inteligente de Recomendação de Mídias  
**Categoria:** Artificial Intelligence, Machine Learning, Recommendation Systems, Full-Stack Development  
**Status:** Planejamento e desenvolvimento inicial  
**Ambiente de desenvolvimento:** Windows + Visual Studio Code  
**Objetivo:** Construir uma aplicação funcional e um projeto de portfólio de alto nível para Engenharia de Inteligência Artificial.

---

# 1. Visão geral do projeto

## 1.1. O que é o Nexo?

O Nexo é uma plataforma web de descoberta e recomendação personalizada de conteúdos de entretenimento, inicialmente focada em:

- Filmes;
- Séries de televisão;
- Livros.

Futuramente, a plataforma poderá ser expandida para animes, mangás e outras categorias.

O principal diferencial do Nexo será seu sistema de recomendação baseado em Machine Learning, capaz de aprender os gostos de cada usuário, identificar similaridades entre diferentes obras e sugerir novos conteúdos de maneira personalizada.

Diferentemente de catálogos tradicionais, o Nexo não pretende apenas mostrar os títulos mais populares ou separar obras por gênero.

O objetivo é construir um sistema capaz de compreender relações mais profundas entre conteúdos, como:

- Temas narrativos;
- Atmosfera e estilo;
- Gêneros e subgêneros;
- Elementos psicológicos e filosóficos;
- Similaridade entre histórias;
- Preferências individuais;
- Padrões de comportamento dos usuários.

Um dos diferenciais será a recomendação entre diferentes categorias de mídia, também conhecida como *Cross-Domain Recommendation*.

Por exemplo, uma pessoa que gosta de filmes cyberpunk e histórias sobre consciência artificial poderá receber recomendações de livros e séries que exploram conceitos semelhantes.

## 1.2. Qual problema o projeto resolve?

Atualmente, conteúdos de entretenimento estão distribuídos entre diferentes plataformas, catálogos e serviços.

Encontrar algo interessante pode exigir várias pesquisas e comparações.

Além disso, recomendações baseadas apenas em popularidade ou gênero podem ser repetitivas e pouco personalizadas.

O Nexo busca resolver os seguintes problemas:

1. Dificuldade para descobrir novas obras alinhadas aos gostos individuais.
2. Fragmentação das informações entre diferentes tipos de mídia.
3. Recomendações pouco contextualizadas.
4. Repetição constante de conteúdos populares.
5. Dificuldade para explorar obras de categorias diferentes, mas com temas semelhantes.
6. Falta de uma representação organizada dos interesses pessoais.

## 1.3. Objetivo principal

Construir uma plataforma web que integre catálogos de mídias, perfis de usuários e algoritmos de Machine Learning para gerar recomendações personalizadas.

O projeto deve demonstrar competências em:

- Engenharia de Software;
- Desenvolvimento Back-end;
- Machine Learning;
- Sistemas de Recomendação;
- Processamento de Linguagem Natural;
- Bancos de Dados Relacionais e Vetoriais;
- Engenharia de Dados;
- APIs REST;
- Avaliação de Modelos;
- MLOps;
- Integração entre IA e aplicações web.

O foco técnico principal deve ser a Engenharia de Inteligência Artificial, e não somente a criação de uma interface visual.

---

# 2. Escopo e decisões fundamentais

## 2.1. Tipo de aplicação

O Nexo será um **site web responsivo**, não um aplicativo mobile nativo.

A aplicação deverá funcionar nos seguintes ambientes:

- Navegadores desktop;
- Notebooks;
- Tablets;
- Navegadores de smartphones.

O desenvolvimento será feito utilizando React e TypeScript para o front-end, Python para o back-end e para os algoritmos de Machine Learning.

Não utilizar React Native, Expo, Flutter, Swift ou Kotlin neste projeto.

## 2.2. Idioma

- Interface inicial: português brasileiro (pt-BR).
- Nomes de variáveis, funções, classes e componentes: inglês.
- Documentação técnica e README público: preferencialmente inglês.
- Comunicação durante o desenvolvimento: português brasileiro.

A arquitetura deve permitir internacionalização futuramente, mas não é necessário implementar vários idiomas no MVP.

## 2.3. O que o Nexo NÃO será

O Nexo não será:

- Um serviço de streaming;
- Uma plataforma para assistir filmes;
- Um aplicativo para ler livros completos;
- Um marketplace de conteúdo;
- Um sistema de downloads;
- Uma plataforma de distribuição de obras protegidas.

O sistema oferecerá informações, descoberta e recomendações.

Quando permitido pelas fontes de dados, poderá apresentar links externos para páginas oficiais.

Não implementar reprodução ou distribuição não autorizada de conteúdo protegido por direitos autorais.

---

# 3. Público-alvo

O Nexo é destinado principalmente a:

- Pessoas que gostam de descobrir filmes e séries;
- Leitores interessados em novas recomendações;
- Usuários que consomem diferentes tipos de entretenimento;
- Pessoas interessadas em histórias de gêneros específicos;
- Usuários que desejam organizar conteúdos favoritos;
- Pessoas que procuram recomendações mais personalizadas.

O projeto também terá como público indireto desenvolvedores, recrutadores e profissionais de tecnologia que poderão avaliar sua arquitetura, qualidade de código e modelos de Machine Learning.

---

# 4. Conceito central: Cross-Media Recommendation

Uma das principais características do projeto será a capacidade de recomendar conteúdos de categorias diferentes.

Considere o seguinte exemplo:

Um usuário gosta das obras:

- Serial Experiments Lain;
- Ghost in the Shell;
- Neuromancer;
- Blade Runner.

O sistema poderá identificar características como:

- Ficção científica;
- Cyberpunk;
- Inteligência artificial;
- Identidade;
- Consciência;
- Filosofia;
- Distopias;
- Narrativas psicológicas.

A partir desse perfil, poderá encontrar outras obras com características semelhantes.

Essas relações não deverão ser definidas exclusivamente por regras manuais.

A proposta é utilizar modelos de representação semântica, embeddings e algoritmos de similaridade.

Entretanto, similaridade temática não garante que o usuário gostará de uma obra. Por isso, o sistema também deverá incorporar feedback individual e avaliar suas recomendações.

---

# 5. Funcionalidades do sistema

## 5.1. Autenticação e gerenciamento de usuários

A plataforma deverá permitir:

- Criar conta;
- Fazer login;
- Fazer logout;
- Recuperar acesso à conta;
- Visualizar o próprio perfil;
- Editar preferências;
- Excluir a conta;
- Excluir os próprios dados pessoais, respeitando as regras aplicáveis.

A autenticação será implementada utilizando Supabase Auth.

Não desenvolver um sistema próprio de armazenamento de senhas.

## 5.2. Onboarding de preferências

Após criar uma conta, o usuário poderá realizar um pequeno processo de configuração inicial.

O objetivo será coletar informações suficientes para gerar recomendações antes que exista um histórico extenso de interações.

O onboarding poderá solicitar:

- Gêneros favoritos;
- Tipos de mídia preferidos;
- Temas de interesse;
- Obras de que o usuário gosta;
- Obras que o usuário não aprecia;
- Preferências opcionais de idioma.

O sistema deverá solicitar que a pessoa selecione algumas obras conhecidas, preferencialmente entre cinco e dez.

Essas informações serão utilizadas para inicializar seu perfil de recomendação.

O onboarding deverá ser simples, rápido e poderá ser atualizado posteriormente.

## 5.3. Catálogo de mídias

O sistema possuirá um catálogo unificado de filmes, séries e livros.

Cada obra poderá conter os seguintes atributos, quando disponíveis:

- Identificador interno;
- Identificador da fonte externa;
- Título;
- Título original;
- Tipo de mídia;
- Sinopse;
- Gêneros;
- Temas;
- Ano de lançamento;
- Idioma;
- Criadores, diretores ou autores;
- Imagem de capa ou pôster;
- Avaliações provenientes de fontes autorizadas;
- Link para fonte oficial;
- Data de atualização dos metadados.

Informações ausentes não deverão ser inventadas.

O sistema deverá permitir que campos opcionais sejam nulos.

## 5.4. Pesquisa de conteúdos

O usuário poderá pesquisar obras por:

- Título;
- Tipo de mídia;
- Gênero;
- Ano;
- Autor ou criador, quando disponível.

Inicialmente, a pesquisa utilizará filtros e consultas convencionais ao banco de dados.

Posteriormente, será implementada busca semântica por embeddings.

Exemplo de pesquisa semântica:

"Quero uma história futurista e melancólica que explore o significado de ser humano."

O mecanismo deverá procurar obras semanticamente relacionadas à descrição, utilizando informações autorizadas do catálogo.

## 5.5. Avaliações e interações

O Nexo deverá permitir que usuários interajam com as obras.

Interações principais:

- Adicionar aos favoritos;
- Marcar como concluído;
- Marcar como quero assistir ou ler;
- Avaliar com uma nota;
- Marcar como não tenho interesse;
- Remover uma obra da biblioteca.

Essas interações alimentarão o sistema de personalização.

Na primeira versão, utilizar uma escala de avaliação de 1 a 5 estrelas.

O banco deverá registrar quando a interação foi realizada, pois essa informação será útil para treinamento e avaliação temporal.

## 5.6. Biblioteca pessoal

Cada usuário terá uma biblioteca própria.

Ela será dividida em categorias como:

- Favoritos;
- Quero assistir;
- Quero ler;
- Assistidos;
- Lidos;
- Avaliados.

A interface deverá apresentar filtros por tipo de mídia.

O usuário deverá conseguir alterar ou remover registros sem dificuldade.

## 5.7. Recomendações personalizadas

O sistema deverá possuir uma área específica para recomendações.

Exemplos de seções:

**Recomendados para você**

Lista personalizada com base no perfil de interesses.

**Porque você gostou de...**

Obras semanticamente relacionadas a um conteúdo previamente avaliado.

**Explore outros universos**

Recomendações de uma categoria de mídia diferente daquela que o usuário costuma consumir.

**Descobertas inesperadas**

Conteúdos que mantêm alguma relevância para o perfil, mas ampliam a diversidade das recomendações.

**Mais populares**

Recomendações gerais usadas como fallback e para novos usuários.

## 5.8. Explicações das recomendações

O usuário deverá poder visualizar por que uma obra foi recomendada.

Exemplos:

- "Compartilha temas de ficção científica e identidade com seus favoritos."
- "Possui características semelhantes a obras que você avaliou positivamente."
- "Selecionado por suas preferências por narrativas psicológicas."

As explicações deverão ser fundamentadas nas características e nos métodos realmente utilizados pelo sistema.

Não gerar explicações falsas ou apresentar uma suposição como fato.

## 5.9. Mood-Based Discovery

Funcionalidade de descoberta por atmosfera, tema ou intenção.

O usuário poderá descrever o tipo de experiência que procura.

Exemplo:

"Quero um filme filosófico, triste, com atmosfera futurista e bastante suspense."

O sistema deverá transformar essa descrição em uma representação semântica e pesquisar obras semelhantes.

Para o MVP, essa funcionalidade não exige uma API paga de modelos generativos.

Ela poderá funcionar utilizando Sentence Transformers e busca vetorial.

## 5.10. Taste DNA

O Taste DNA será uma representação personalizada dos interesses do usuário.

O sistema poderá identificar tendências entre as obras avaliadas positivamente e apresentar um resumo dos gêneros, temas e estilos recorrentes.

Exemplo:

**Principais interesses identificados:**

- Ficção científica;
- Cyberpunk;
- Suspense psicológico;
- Filosofia;
- Narrativas distópicas.

O perfil deverá ser calculado com base nos dados efetivamente disponíveis.

Não classificar características pessoais sensíveis nem tentar inferir atributos íntimos dos usuários.

## 5.11. Taste Graph

Funcionalidade avançada para uma etapa posterior.

O Taste Graph será uma visualização interativa das conexões entre:

- Obras favoritas;
- Gêneros;
- Temas;
- Autores;
- Características narrativas;
- Recomendações relacionadas.

Exemplo de relação:

Ghost in the Shell → Cyberpunk → Inteligência Artificial → Neuromancer.

O grafo deverá utilizar relações fundamentadas em metadados ou similaridade calculada.

Inicialmente, não será necessário utilizar Neo4j. Um grafo visual poderá ser construído a partir de relações armazenadas no PostgreSQL.

---

# 6. MVP — Primeira versão funcional

O projeto deverá ser desenvolvido por etapas.

A primeira versão não deve tentar implementar todas as funcionalidades simultaneamente.

## 6.1. Funcionalidades obrigatórias do MVP

- Interface web funcional;
- Cadastro e autenticação;
- Catálogo de filmes, séries e livros;
- Pesquisa por título;
- Página de detalhes;
- Onboarding básico;
- Avaliação de obras;
- Favoritos;
- Biblioteca pessoal;
- Recomendação inicial baseada em conteúdo;
- Recomendações gerais para novos usuários;
- API de recomendação;
- Banco de dados persistente;
- Testes fundamentais;
- Documentação;
- Tratamento de erros e estados de carregamento.

## 6.2. Fora do MVP

As seguintes funcionalidades deverão ser desenvolvidas posteriormente:

- Collaborative Filtering avançado;
- Learning to Rank;
- Taste Graph;
- Mood-Based Discovery;
- Sistema avançado de diversidade;
- Pipeline automatizado de retreinamento;
- Monitoramento avançado de drift;
- Experimentos A/B;
- Recomendações em tempo real;
- Aplicativos mobile nativos.

O MVP deverá ser pequeno o suficiente para ser concluído, mas estruturado para permitir evolução.

---

# 7. Stack tecnológica

A arquitetura será dividida em front-end, back-end, banco de dados, Machine Learning e infraestrutura.

## 7.1. Front-end

### React

**Função:** construir a interface web.

React será utilizado para desenvolver componentes reutilizáveis como:

- Cards de mídias;
- Menus;
- Formulários;
- Páginas de detalhes;
- Listas personalizadas;
- Componentes de avaliação;
- Elementos de navegação.

**Motivo da escolha:** oferece uma arquitetura baseada em componentes, ecossistema consolidado e boa integração com APIs REST.

### TypeScript

**Função:** linguagem principal do front-end.

Será utilizado para:

- Tipar dados recebidos da API;
- Definir interfaces;
- Desenvolver componentes;
- Reduzir erros de tipos;
- Melhorar manutenção e refatoração.

Utilizar TypeScript com verificação estrita de tipos.

Evitar `any` desnecessário.

### Vite

**Função:** ferramenta de desenvolvimento e build.

Será responsável por:

- Inicializar o projeto React;
- Disponibilizar servidor de desenvolvimento;
- Realizar builds de produção;
- Oferecer atualização rápida durante o desenvolvimento.

### Tailwind CSS

**Função:** estilização da interface.

Será utilizado para:

- Layouts responsivos;
- Espaçamentos;
- Tipografia;
- Cores;
- Estados interativos;
- Componentes visuais.

Criar padrões reutilizáveis, evitando interfaces inconsistentes.

### React Router

**Função:** navegação entre páginas.

Permitirá criar rotas como:

- `/`;
- `/explore`;
- `/media/:id`;
- `/recommendations`;
- `/library`;
- `/profile`;
- `/login`;
- `/register`.

### TanStack Query

**Função:** gerenciamento das requisições e do estado de dados do servidor.

Será utilizado para:

- Buscar dados da API;
- Gerenciar cache;
- Controlar loading e erros;
- Atualizar informações após mutações;
- Evitar requisições desnecessárias.

### Bibliotecas adicionais

Poderemos utilizar:

- Zod para validação de dados;
- React Hook Form para formulários;
- Lucide para ícones;
- Uma biblioteca acessível de componentes, se houver necessidade.

Evitar instalar bibliotecas sem justificativa.

---

# 8. Back-end

## 8.1. Python

Python será a linguagem principal do back-end e de todo o sistema de Machine Learning.

Ele será responsável por:

- Processar dados;
- Executar modelos;
- Criar pipelines;
- Gerar embeddings;
- Calcular recomendações;
- Implementar regras de negócio;
- Construir serviços de inferência.

## 8.2. FastAPI

**Função:** framework principal da API REST.

O FastAPI será responsável por conectar a interface ao banco de dados e aos modelos de Machine Learning.

Principais responsabilidades:

- Receber requisições;
- Validar entradas;
- Consultar dados;
- Aplicar autenticação;
- Verificar autorização;
- Executar serviços de recomendação;
- Retornar respostas estruturadas;
- Disponibilizar documentação OpenAPI.

**Motivo da escolha:** sua integração com Python facilita a utilização dos modelos de ML dentro de uma arquitetura de serviços.

## 8.3. Pydantic

Será utilizado para definir e validar contratos da API.

Exemplos:

- Dados recebidos do front-end;
- Estrutura de avaliações;
- Preferências dos usuários;
- Filtros de pesquisa;
- Estrutura das recomendações.

Não confiar em dados de entrada sem validação.

## 8.4. SQLAlchemy

Será utilizado para mapear entidades e realizar operações com o PostgreSQL.

Suas responsabilidades incluem:

- Consultas;
- Inserções;
- Atualizações;
- Relacionamentos;
- Transações.

Evitar espalhar consultas diretamente por rotas da API.

## 8.5. Alembic

Ferramenta para controle de versões do esquema do banco de dados.

Toda mudança importante nas tabelas deverá possuir uma migration versionada.

Não alterar manualmente tabelas de produção sem controle de migração.

---

# 9. Banco de dados

## 9.1. PostgreSQL

O PostgreSQL será o banco relacional principal.

Armazenará:

- Perfis;
- Mídias;
- Metadados;
- Avaliações;
- Favoritos;
- Listas;
- Histórico de interações;
- Dados necessários para recomendações.

## 9.2. Supabase

O Supabase será utilizado inicialmente para simplificar a infraestrutura.

Serviços previstos:

- PostgreSQL gerenciado;
- Supabase Auth;
- Extensão pgvector, quando habilitada e compatível com o projeto.

**Por que utilizar?**

Porque permite trabalhar com um banco PostgreSQL real e autenticação gerenciada sem precisar construir toda a infraestrutura do zero.

O front-end utilizará Supabase principalmente para autenticação.

As operações de negócio deverão passar pela API FastAPI.

A API deverá validar a identidade do usuário e garantir que ele só consiga acessar seus próprios dados privados.

Credenciais administrativas não poderão ser expostas no navegador.

Verificar limites, preços e condições atuais do Supabase antes de configurar serviços de produção.

## 9.3. pgvector

O pgvector será utilizado para armazenar representações vetoriais das mídias.

Esses vetores permitirão:

- Busca por similaridade;
- Recuperação semântica;
- Comparação entre obras;
- Recomendação baseada em conteúdo.

A dimensão dos vetores dependerá do modelo de embeddings escolhido.

Não misturar vetores gerados por modelos incompatíveis na mesma pesquisa sem uma estratégia explícita de versionamento.

---

# 10. Modelo inicial do banco de dados

As tabelas abaixo representam a estrutura lógica inicial. A IA desenvolvedora deverá elaborar o esquema SQL completo, incluindo chaves, índices, constraints e relacionamentos.

## 10.1. `profiles`

Armazenará informações públicas e preferências básicas dos usuários.

Campos principais:

- `id`;
- `username`;
- `display_name`;
- `onboarding_completed`;
- `created_at`;
- `updated_at`.

O identificador deverá estar associado ao usuário do Supabase Auth.

Não armazenar senhas nessa tabela.

## 10.2. `media_items`

Tabela principal do catálogo.

Campos principais:

- `id`;
- `media_type`;
- `title`;
- `original_title`;
- `description`;
- `release_year`;
- `language`;
- `poster_url`;
- `metadata_source`;
- `created_at`;
- `updated_at`.

Valores iniciais de `media_type`:

- `movie`;
- `series`;
- `book`.

## 10.3. `media_external_ids`

Relaciona itens internos com identificadores de plataformas externas.

Campos:

- `id`;
- `media_id`;
- `provider`;
- `external_id`.

Implementar restrição de unicidade por provedor e identificador externo.

Essa tabela será importante para integrar dados como os IDs de MovieLens e TMDB.

## 10.4. `genres` e `media_genres`

Representarão os gêneros associados às obras.

Exemplos:

- Science Fiction;
- Horror;
- Drama;
- Mystery;
- Fantasy;
- Thriller.

Utilizar tabela de relacionamento para permitir múltiplos gêneros por obra.

## 10.5. `media_tags`

Armazenará temas e atributos adicionais quando houver fontes confiáveis.

Exemplos:

- Cyberpunk;
- Artificial Intelligence;
- Psychological;
- Dystopian;
- Existentialism.

A origem de cada tag deverá ser conhecida.

Não tratar classificações inferidas automaticamente como fatos incontestáveis.

## 10.6. `user_interactions`

Registrará eventos de interação.

Campos:

- `id`;
- `user_id`;
- `media_id`;
- `event_type`;
- `rating`;
- `created_at`.

Tipos possíveis de evento:

- `rating`;
- `favorite`;
- `completed`;
- `watchlist`;
- `dislike`.

As regras de unicidade e atualização precisam considerar que o usuário pode alterar avaliações ou remover favoritos.

É permitido utilizar tabelas separadas para avaliações e listas se isso simplificar o modelo relacional.

## 10.7. `user_lists` e `user_list_items`

Permitirão organizar coleções de conteúdos.

Listas iniciais poderão representar:

- Favoritos;
- Quero consumir;
- Concluídos.

## 10.8. `media_embeddings`

Armazenará os embeddings gerados para cada mídia.

Campos:

- `id`;
- `media_id`;
- `model_name`;
- `model_version`;
- `embedding`;
- `created_at`.

Os modelos e versões deverão ser registrados para garantir reprodutibilidade.

## 10.9. `recommendation_events`

Tabela futura para análise de desempenho.

Poderá registrar:

- Usuário;
- Conteúdo recomendado;
- Modelo utilizado;
- Posição no ranking;
- Horário;
- Interação posterior.

A coleta deverá respeitar requisitos de privacidade, finalidade e retenção de dados.

---

# 11. Fontes de dados e APIs externas

## 11.1. TMDB API

**Documentação:** https://developer.themoviedb.org/

Fonte prevista para metadados de filmes e séries.

Poderá fornecer, conforme disponibilidade e permissões:

- Títulos;
- Sinopses;
- Gêneros;
- Imagens;
- Datas;
- Informações sobre elenco e produção.

O Nexo deverá implementar um serviço específico de integração com TMDB.

Não realizar chamadas diretamente do navegador contendo credenciais privadas.

Implementar tratamento de erros, timeout e limites de requisição.

## 11.2. Open Library API

**Documentação:** https://openlibrary.org/developers/api

Fonte prevista para livros.

Poderá fornecer:

- Títulos;
- Autores;
- Obras;
- Edições;
- Capas;
- Informações bibliográficas.

É importante diferenciar uma obra literária de suas edições.

A aplicação deverá evitar duplicações desnecessárias.

## 11.3. MovieLens

**Fonte:** https://grouplens.org/datasets/movielens/

Dataset para experimentos iniciais de recomendação.

Contém avaliações de usuários sobre filmes.

Será utilizado para:

- Estudar Collaborative Filtering;
- Construir baselines;
- Comparar algoritmos;
- Avaliar modelos;
- Trabalhar com interações reais.

Começar com um conjunto pequeno, adequado ao hardware disponível.

Quando disponíveis, utilizar os identificadores relacionados a TMDB para associar filmes aos metadados do catálogo.

MovieLens não fornece, por si só, avaliações reais dos mesmos usuários para livros e séries.

Portanto, não apresentar resultados de MovieLens como prova de qualidade de recomendações entre diferentes mídias.

## 11.4. Regras para integração de dados

Antes de implementar cada integração:

1. Consultar a documentação oficial atualizada.
2. Verificar requisitos de autenticação.
3. Verificar permissões e restrições de uso.
4. Verificar exigências de atribuição.
5. Verificar regras de armazenamento e cache.
6. Verificar licenciamento de datasets.
7. Implementar tratamento de falhas.
8. Evitar consultas excessivas.

Não utilizar scraping não autorizado.

Não inventar informações para preencher campos ausentes.

---

# 12. Arquitetura geral do sistema

O Nexo terá as seguintes camadas:

**1. Front-end**

React + TypeScript.

Responsável pela interface e interação com o usuário.

**2. API**

FastAPI.

Responsável por autenticação validada, regras de negócio e disponibilização dos serviços.

**3. Banco de dados**

PostgreSQL + pgvector.

Responsável por persistência e consulta de dados relacionais e vetoriais.

**4. Data Pipeline**

Python + Pandas.

Responsável pela importação, transformação, normalização e preparação dos dados.

**5. Machine Learning Engine**

Scikit-learn, Sentence Transformers e algoritmos de recomendação.

Responsável pela geração de candidatos e personalização.

**6. Ranking Engine**

Responsável por ordenar as obras candidatas, considerando relevância e restrições.

**7. Experiment Tracking**

MLflow, em uma etapa posterior.

Responsável por registrar experimentos e métricas.

## 12.1. Fluxo geral

Usuário acessa o site.

O front-end envia uma requisição para o FastAPI.

O back-end identifica o usuário e recupera suas preferências e interações.

O Recommendation Engine gera candidatos a partir do catálogo.

O Ranking Engine organiza os candidatos.

A API devolve uma lista de obras com informações e explicações.

O front-end apresenta as recomendações.

## 12.2. Princípios arquiteturais

- Separação de responsabilidades;
- Componentes reutilizáveis;
- Baixo acoplamento;
- Contratos de API bem definidos;
- Código testável;
- Serviços de Machine Learning independentes da interface;
- Banco de dados com migrations;
- Configurações por variáveis de ambiente;
- Dependências versionadas;
- Possibilidade de substituir fontes externas;
- Possibilidade de substituir modelos de ML.

O objetivo é ter uma arquitetura modular, mas evitar a complexidade desnecessária de microsserviços logo no início.

A primeira versão poderá utilizar um back-end monolítico modular.

---

# 13. Machine Learning — Núcleo principal

Esta é a parte mais importante do Nexo.

O projeto não deverá depender apenas de regras fixas ou chamadas para uma API de IA generativa.

Ele deverá possuir algoritmos de recomendação reais, implementados, testados e avaliados.

## 13.1. Modelo inicial — Popularity Baseline

O primeiro recomendador será uma baseline simples.

Funcionamento:

- Identificar conteúdos populares no conjunto de treinamento;
- Gerar uma lista geral;
- Excluir itens já consumidos, quando apropriado;
- Usar essa lista como referência para comparação.

Esse algoritmo é importante porque modelos sofisticados precisam demonstrar vantagens sobre soluções simples.

## 13.2. Content-Based Filtering

O segundo método será recomendação baseada nas características das obras.

O sistema analisará informações como:

- Título;
- Sinopse;
- Gêneros;
- Tags e temas disponíveis.

A partir dessas informações, calculará similaridades entre conteúdos.

Exemplo:

Um usuário que gosta de ficção científica filosófica poderá receber sugestões de livros com características semelhantes às de filmes que avaliou positivamente.

## 13.3. Embeddings

Embeddings são representações numéricas de conteúdos.

O projeto utilizará um modelo pré-treinado de linguagem para transformar descrições textuais em vetores.

Tecnologia prevista:

**Sentence Transformers**

Biblioteca: `sentence-transformers`.

Preferir inicialmente um modelo multilíngue relativamente pequeno, adequado para execução em CPU.

A escolha final dependerá de testes de qualidade, consumo de memória e velocidade.

O mesmo modelo compatível deverá ser utilizado para gerar os vetores dos diferentes tipos de mídia, permitindo comparações no espaço vetorial compartilhado.

## 13.4. Similaridade de cosseno

A similaridade de cosseno será utilizada para medir proximidade entre vetores.

Isso permitirá encontrar obras semanticamente próximas.

Os valores calculados representarão similaridade matemática entre representações, e não uma garantia de que o usuário gostará da obra.

## 13.5. Construção do perfil vetorial do usuário

Cada usuário terá um perfil construído a partir de suas interações.

Uma abordagem inicial será:

1. Recuperar obras avaliadas positivamente.
2. Recuperar os embeddings dessas obras.
3. Aplicar pesos com base nas preferências.
4. Combinar os vetores para produzir uma representação do perfil.
5. Encontrar novos conteúdos próximos a essa representação.

Os pesos deverão ser definidos e avaliados experimentalmente.

Avaliações negativas deverão ser consideradas para reduzir recomendações inadequadas, sem assumir que simplesmente inverter embeddings representa corretamente uma preferência contrária.

O sistema também deverá tratar usuários sem histórico suficiente.

## 13.6. Collaborative Filtering

Em uma segunda etapa, implementar recomendação colaborativa.

Esse método analisa interações entre usuários e itens.

O objetivo é descobrir padrões coletivos de preferência.

Poderemos experimentar:

- Item-based Collaborative Filtering;
- Matrix Factorization;
- Alternating Least Squares para feedback implícito, quando apropriado;
- Outros modelos adequados ao tipo de feedback disponível.

A biblioteca `implicit` poderá ser utilizada para experimentos com feedback implícito.

É necessário distinguir feedback explícito, como notas de 1 a 5, de feedback implícito, como cliques e visualizações.

Não utilizar um algoritmo incompatível com os dados apenas por ser popular.

## 13.7. Hybrid Recommendation System

A etapa seguinte será combinar diferentes estratégias.

Possíveis fontes de candidatos:

- Similaridade semântica;
- Filtragem colaborativa;
- Conteúdos populares;
- Preferências por gênero;
- Novidades e descobertas.

As contribuições de cada modelo deverão ser normalizadas e combinadas de maneira controlada.

Pesos iniciais poderão ser definidos experimentalmente, mas precisam ser avaliados.

Não assumir que uma combinação híbrida é melhor sem medições.

Para categorias sem dados colaborativos suficientes, o sistema deverá utilizar estratégias alternativas baseadas em conteúdo.

## 13.8. Learning to Rank

Funcionalidade avançada.

O objetivo será desenvolver um modelo capaz de ordenar candidatos utilizando diferentes características.

Possíveis features:

- Similaridade semântica;
- Preferência por gênero;
- Popularidade;
- Interações anteriores;
- Tipo de mídia;
- Relevância contextual.

Tecnologias que poderão ser utilizadas:

- LightGBM;
- XGBoost.

Essa funcionalidade só deverá ser introduzida quando houver dados e uma estratégia de avaliação adequados.

Não treinar um modelo de ranking utilizando rótulos inventados e apresentá-lo como validado com comportamento real de usuários.

## 13.9. Cold Start

O sistema deverá resolver dois problemas:

**Novo usuário:** ainda não possui histórico.

Soluções:

- Onboarding;
- Seleção de obras favoritas;
- Preferências iniciais;
- Recomendações populares.

**Nova obra:** ainda não possui avaliações.

Solução:

- Utilizar metadados;
- Gerar embedding;
- Recomendar por similaridade de conteúdo.

## 13.10. Diversidade e exploração

Um recomendador que mostra sempre conteúdos muito parecidos pode se tornar repetitivo.

Em uma etapa posterior, implementar mecanismos que equilibrem:

- Relevância;
- Diversidade;
- Novidade;
- Exploração.

Uma possibilidade é utilizar Maximal Marginal Relevance para diversificar o ranking.

A diversidade deverá ser avaliada junto da relevância.

## 13.11. Explicabilidade

O sistema deverá gerar explicações simples e fundamentadas.

Exemplos:

- Gêneros compartilhados;
- Tags relacionadas;
- Proximidade semântica;
- Obras que influenciaram a recomendação.

Não utilizar explicações genéricas que apenas aparentam ser personalizadas.

---

# 14. Pipeline de Machine Learning

O fluxo de treinamento e inferência deverá ser reproduzível.

## 14.1. Aquisição

Obter dados das fontes autorizadas.

Salvar somente dados cujo armazenamento seja permitido.

## 14.2. Preparação

Executar:

- Tratamento de valores ausentes;
- Remoção de duplicações;
- Normalização de campos;
- Associação de identificadores;
- Padronização de gêneros;
- Validação de integridade.

## 14.3. Engenharia de features

Criar representações relevantes para os modelos.

Exemplos:

- Representação textual da obra;
- Vetores semânticos;
- Gêneros codificados;
- Histórico de preferências;
- Popularidade;
- Características de interação.

## 14.4. Separação de dados

Separar dados de treinamento, validação e teste.

Para recomendação baseada em interações, utilizar uma estratégia apropriada de avaliação temporal ou por usuário.

Prevenir vazamento de informações futuras.

Não usar informações de teste para ajustar hiperparâmetros.

## 14.5. Treinamento

Executar experimentos com diferentes modelos.

Registrar:

- Algoritmo;
- Hiperparâmetros;
- Versão do dataset;
- Métricas;
- Tempo de treinamento;
- Artefatos.

## 14.6. Avaliação

Comparar os modelos contra baselines.

Não selecionar um modelo apenas pela impressão subjetiva de algumas recomendações.

## 14.7. Versionamento

Os modelos deverão possuir identificadores e versões.

A aplicação precisa saber qual versão está produzindo recomendações.

## 14.8. Inferência

O treinamento não deverá acontecer a cada requisição de usuário.

O sistema deverá utilizar modelos e embeddings previamente preparados.

Durante uma requisição, poderá:

1. Recuperar o perfil do usuário.
2. Recuperar candidatos.
3. Calcular características necessárias.
4. Ordenar resultados.
5. Aplicar filtros.
6. Retornar recomendações.

## 14.9. Atualização de modelos

Inicialmente, os modelos poderão ser atualizados manualmente.

A automação de treinamento poderá ser implementada posteriormente.

Não criar infraestrutura complexa de treinamento contínuo antes de validar a qualidade do sistema inicial.

---

# 15. Métricas de avaliação

O Nexo deverá possuir uma seção específica de experimentos e métricas.

## 15.1. Métricas de recomendação

**Precision@K**

Avalia a proporção de recomendações relevantes entre os K resultados apresentados.

**Recall@K**

Avalia a proporção de itens relevantes encontrados pelo recomendador.

**NDCG@K**

Avalia a qualidade da ordenação, considerando a posição dos itens relevantes.

**Hit Rate@K**

Avalia a proporção de casos em que pelo menos um item relevante aparece na lista.

**Catalog Coverage**

Mede quanto do catálogo aparece nas recomendações.

**Diversity**

Mede a variedade de itens recomendados.

## 15.2. Métricas de engenharia

Também acompanhar:

- Tempo de resposta da API;
- Latência da geração de recomendações;
- Consumo de memória;
- Tempo de geração dos embeddings;
- Falhas de integração;
- Taxa de erro das requisições.

## 15.3. Avaliação entre domínios

O MovieLens permite avaliar algoritmos utilizando interações de filmes.

Entretanto, avaliar recomendações de filmes para livros ou séries exige evidências específicas.

No início, essa parte poderá utilizar avaliações qualitativas e testes com usuários voluntários.

Posteriormente, deverá incorporar feedback real coletado no Nexo, com consentimento adequado.

Nunca apresentar métricas obtidas exclusivamente com filmes como validação comprovada de recomendações entre filmes, séries e livros.

---

# 16. Design e experiência do usuário

## 16.1. Direção visual

O Nexo deverá ter uma identidade visual própria.

Direção proposta:

- Tema predominantemente escuro;
- Estética cinematográfica;
- Interface moderna e minimalista;
- Tipografia legível;
- Espaçamento consistente;
- Cards com imagens das obras;
- Animações discretas;
- Navegação intuitiva.

O objetivo é criar uma experiência visual agradável, sem prejudicar performance ou acessibilidade.

Não copiar diretamente o design de Netflix, Letterboxd, Goodreads ou outras plataformas.

## 16.2. Páginas principais

### Home

Apresentará:

- Recomendações principais;
- Descobertas;
- Obras em destaque;
- Acesso à biblioteca;
- Navegação para explorar o catálogo.

### Explorar

Permitirá:

- Pesquisar;
- Filtrar;
- Navegar por categorias;
- Encontrar filmes, séries e livros.

### Detalhes da obra

Apresentará:

- Capa ou pôster;
- Título;
- Sinopse;
- Ano;
- Gêneros;
- Informações principais;
- Avaliação do usuário;
- Botão de favorito;
- Obras relacionadas.

### Recomendações

Apresentará listas personalizadas e explicações.

### Biblioteca

Permitirá visualizar e organizar conteúdos salvos.

### Perfil

Permitirá:

- Editar dados;
- Alterar preferências;
- Visualizar histórico;
- Gerenciar conta;
- Visualizar Taste DNA futuramente.

### Login e cadastro

Formulários de autenticação integrados ao Supabase Auth.

## 16.3. Responsividade

O Nexo será um site, mas deverá ser totalmente responsivo.

Considerar:

- Navegação mobile;
- Grades adaptativas;
- Imagens proporcionais;
- Textos legíveis;
- Botões acessíveis por toque.

Não exigir gestos exclusivos de aplicativos nativos.

## 16.4. Acessibilidade

Implementar:

- HTML semântico;
- Navegação por teclado;
- Contraste adequado;
- Estados de foco visíveis;
- Textos alternativos;
- Feedback de formulários;
- Estados de erro compreensíveis;
- Respeito à preferência por movimento reduzido.

---

# 17. API REST — Endpoints iniciais

A API deverá ser versionada.

Prefixo principal: `/api/v1`.

## 17.1. Catálogo

`GET /api/v1/media`

Lista conteúdos com paginação e filtros.

`GET /api/v1/media/{id}`

Retorna detalhes de uma obra.

`GET /api/v1/media/search`

Pesquisa por título e filtros.

`GET /api/v1/media/{id}/similar`

Retorna conteúdos semanticamente relacionados.

## 17.2. Usuário

`GET /api/v1/me/profile`

Recupera informações do usuário autenticado.

`PATCH /api/v1/me/profile`

Atualiza informações permitidas.

`POST /api/v1/me/onboarding`

Salva preferências iniciais.

`GET /api/v1/me/library`

Recupera a biblioteca pessoal.

## 17.3. Interações

`POST /api/v1/me/interactions`

Registra avaliação, favorito ou outra interação.

`DELETE /api/v1/me/interactions/{id}`

Remove uma interação permitida.

## 17.4. Recomendações

`GET /api/v1/recommendations`

Retorna recomendações personalizadas.

Parâmetros possíveis:

- Tipo de mídia;
- Quantidade;
- Estratégia;
- Filtros.

`GET /api/v1/recommendations/explore`

Retorna recomendações orientadas à descoberta.

Implementar endpoints adicionais apenas quando houver uma necessidade real.

## 17.5. Saúde da aplicação

`GET /health`

Verifica o funcionamento básico da API.

Posteriormente, poderá existir um endpoint de prontidão que valide dependências essenciais.

## 17.6. Padronização

Todas as rotas deverão seguir convenções consistentes de:

- Métodos HTTP;
- Códigos de status;
- Validação;
- Paginação;
- Autorização;
- Tratamento de erros;
- Documentação.

---

# 18. Estrutura inicial de pastas

A organização deverá ser modular e separar responsabilidades.

Estrutura sugerida:

**`nexo/`**

- `frontend/` — aplicação React + TypeScript.
  - `src/components/` — componentes reutilizáveis.
  - `src/pages/` — páginas.
  - `src/features/` — módulos por funcionalidade.
  - `src/services/` — cliente de API.
  - `src/hooks/` — hooks compartilhados.
  - `src/types/` — definições de tipos.
  - `src/styles/` — estilos e tokens.
  - `src/routes/` — rotas.
  - `src/lib/` — utilitários e integrações.

- `backend/` — API Python.
  - `app/main.py` — entrada da aplicação.
  - `app/api/` — roteadores.
  - `app/core/` — configurações e segurança.
  - `app/models/` — modelos de banco.
  - `app/schemas/` — contratos Pydantic.
  - `app/services/` — regras de negócio.
  - `app/repositories/` — acesso a dados.
  - `app/integrations/` — clientes de APIs externas.
  - `app/ml/` — serviços de inferência.
  - `alembic/` — migrations.
  - `tests/` — testes automatizados.

- `ml/` — experimentos e treinamento.
  - `data/` — scripts de preparação.
  - `notebooks/` — exploração.
  - `training/` — treinamento.
  - `evaluation/` — avaliação.
  - `embeddings/` — geração de vetores.
  - `artifacts/` — artefatos locais ignorados pelo Git.

- `docs/` — documentação técnica.
- `scripts/` — automação de tarefas.
- `.github/workflows/` — CI.
- `.env.example` — exemplo de variáveis de ambiente.
- `.gitignore` — arquivos ignorados.
- `README.md` — apresentação pública.
- `LICENSE` — licença escolhida para o código.

Essa estrutura poderá ser refinada durante a implementação.

Evitar criar dezenas de diretórios vazios apenas para simular uma arquitetura complexa.

---

# 19. Segurança e privacidade

## 19.1. Autenticação

Utilizar Supabase Auth.

A API deverá verificar os tokens recebidos de maneira segura e conforme a configuração atual do serviço.

## 19.2. Autorização

Um usuário não poderá:

- Acessar a biblioteca privada de outro usuário;
- Alterar avaliações de terceiros;
- Excluir dados de outras contas;
- Consultar informações internas administrativas.

A API deverá verificar o usuário autenticado em operações privadas.

Configurar políticas de Row Level Security quando aplicáveis.

Não confiar apenas no fato de que o front-end esconde uma funcionalidade.

## 19.3. Credenciais

Todas as credenciais sensíveis deverão ser armazenadas em variáveis de ambiente apropriadas.

Nunca publicar:

- Tokens privados;
- Senhas;
- Chaves administrativas;
- Strings de conexão sensíveis.

Nunca enviar uma chave `service_role` do Supabase ao navegador.

## 19.4. Proteção da API

Implementar:

- Validação de entradas;
- Tratamento seguro de erros;
- Configuração restrita de CORS;
- Limites de requisição quando necessários;
- Timeout para serviços externos;
- Logs sem exposição desnecessária de dados pessoais.

## 19.5. Privacidade

Como o projeto utilizará históricos de preferência, deverá considerar boas práticas de proteção de dados e requisitos aplicáveis da LGPD.

Adotar:

- Minimização de dados;
- Transparência sobre personalização;
- Possibilidade de exclusão;
- Controles de acesso;
- Política de retenção;
- Coleta de eventos apenas com finalidade definida.

Não utilizar dados reais de usuários para experimentos públicos sem autorização.

---

# 20. Testes e qualidade de software

O projeto deverá possuir testes desde as primeiras etapas.

## 20.1. Back-end

Ferramenta: Pytest.

Testar:

- Validação de entradas;
- Serviços;
- Endpoints;
- Regras de autorização;
- Operações no banco;
- Tratamento de erros;
- Casos sem resultados;
- Integração entre módulos.

## 20.2. Front-end

Ferramentas previstas:

- Vitest;
- React Testing Library.

Testar componentes e interações essenciais.

Para fluxos completos, considerar Playwright posteriormente.

## 20.3. Machine Learning

Criar testes para:

- Integridade dos datasets;
- Formato das features;
- Dimensão dos embeddings;
- Ordenação dos resultados;
- Ausência de itens inválidos;
- Exclusão de itens bloqueados;
- Funcionamento com usuário novo;
- Funcionamento com catálogo incompleto;
- Reprodutibilidade dos experimentos.

## 20.4. Qualidade de código

Front-end:

- TypeScript strict;
- ESLint;
- Formatação consistente;
- Verificação de build.

Back-end:

- Ruff;
- Pytest;
- Type hints;
- Formatação consistente.

Evitar utilizar `try/except` genérico para ocultar erros.

Não desabilitar verificações apenas para fazer o projeto compilar.

---

# 21. Infraestrutura e deploy

## 21.1. Ambiente de desenvolvimento

O projeto será desenvolvido no Windows, utilizando Visual Studio Code.

Ferramentas principais:

- Python;
- Node.js LTS;
- npm;
- Git;
- GitHub;
- VS Code;
- Docker, conforme necessidade.

Verificar versões compatíveis antes da instalação.

## 21.2. Ambiente virtual Python

O back-end e os experimentos deverão utilizar ambientes Python isolados.

Registrar dependências e suas versões.

Não instalar bibliotecas globalmente sem necessidade.

## 21.3. Docker

O Docker será utilizado para facilitar a execução reproduzível, especialmente do back-end.

Na primeira etapa, não é obrigatório containerizar absolutamente tudo.

A containerização deve ser introduzida quando os serviços básicos já estiverem funcionando.

## 21.4. Deploy

A arquitetura deverá permitir publicar:

- Front-end em hospedagem estática;
- Back-end em serviço compatível com Python;
- Banco no Supabase.

O provedor final de hospedagem será escolhido de acordo com custos e necessidades.

Não assumir que hospedagem gratuita inclui execução permanente, GPU ou armazenamento ilimitado.

## 21.5. CI/CD

Utilizar GitHub Actions para:

- Executar testes;
- Verificar lint;
- Validar build;
- Impedir que mudanças problemáticas sejam integradas.

Deploy automatizado poderá ser adicionado depois.

---

# 22. Custos e restrições

O objetivo inicial é desenvolver o projeto gastando o mínimo possível.

## 22.1. Estratégia de custo

Priorizar:

- Bibliotecas open source;
- Datasets públicos com uso permitido;
- Execução local;
- Modelos pequenos;
- Inferência em CPU;
- Ferramentas gratuitas quando disponíveis;
- Limites de utilização controlados.

## 22.2. Restrições de hardware

O desenvolvimento ocorrerá em um computador pessoal Windows.

Evitar assumir disponibilidade de GPU dedicada.

A primeira versão deverá trabalhar com:

- Datasets menores;
- Treinamentos reproduzíveis;
- Modelos adequados para CPU;
- Geração de embeddings em lotes;
- Processamento incremental quando possível.

Treinamentos mais pesados poderão utilizar ambientes externos gratuitos sujeitos a limites.

## 22.3. Custos futuros possíveis

- Hospedagem do back-end;
- Banco de dados gerenciado;
- Armazenamento;
- Domínio personalizado;
- Computação para treinamento;
- APIs comerciais;
- Serviços de monitoramento.

O sistema não deverá exigir assinatura de API comercial de inteligência artificial para funcionar no MVP.

---

# 23. Roadmap de implementação

## Fase 0 — Planejamento e configuração

**Objetivo:** preparar a base técnica.

Tarefas:

1. Criar repositório GitHub.
2. Definir arquitetura.
3. Inicializar React + TypeScript + Vite.
4. Inicializar FastAPI.
5. Configurar ferramentas de lint e testes.
6. Definir variáveis de ambiente.
7. Configurar Supabase.
8. Criar documentação inicial.

**Critério de conclusão:**

Front-end e back-end executando localmente, com estrutura organizada, conexão configurada e testes básicos funcionando.

## Fase 1 — Catálogo de mídias

**Objetivo:** disponibilizar conteúdos reais.

Tarefas:

1. Criar esquema do banco.
2. Implementar migrations.
3. Integrar TMDB.
4. Integrar Open Library.
5. Criar serviços de normalização.
6. Implementar importação e atualização.
7. Criar endpoints de catálogo.
8. Criar busca por título.
9. Desenvolver cards e página de detalhes.

**Critério de conclusão:**

Usuário consegue navegar, pesquisar e visualizar filmes, séries e livros, mesmo antes de existir personalização.

## Fase 2 — Usuários e interações

**Objetivo:** permitir a construção de perfis.

Tarefas:

1. Configurar autenticação.
2. Criar perfil.
3. Implementar onboarding.
4. Implementar avaliações.
5. Implementar favoritos.
6. Criar biblioteca pessoal.
7. Proteger endpoints privados.

**Critério de conclusão:**

Usuário consegue criar conta, selecionar interesses, avaliar obras e gerenciar sua biblioteca.

## Fase 3 — Primeiro sistema de Machine Learning

**Objetivo:** desenvolver a primeira recomendação personalizada.

Tarefas:

1. Estudar e preparar MovieLens.
2. Implementar baseline de popularidade.
3. Criar pipeline textual.
4. Gerar embeddings.
5. Implementar similaridade.
6. Construir perfil vetorial do usuário.
7. Implementar recomendação baseada em conteúdo.
8. Criar endpoints de recomendação.
9. Avaliar resultados.

**Critério de conclusão:**

O sistema recomenda conteúdos com base nas preferências dos usuários e possui experimentos reproduzíveis.

## Fase 4 — Integração completa

**Objetivo:** conectar a interface ao motor de IA.

Tarefas:

1. Criar página de recomendações.
2. Exibir obras personalizadas.
3. Implementar explicações fundamentadas.
4. Implementar estados vazios.
5. Criar fallback para usuários novos.
6. Melhorar experiência visual.
7. Implementar testes de integração.

**Critério de conclusão:**

O usuário consegue utilizar a plataforma de ponta a ponta.

## Fase 5 — Recomendação híbrida

**Objetivo:** aprofundar Machine Learning.

Tarefas:

1. Implementar Collaborative Filtering para dados compatíveis.
2. Comparar algoritmos.
3. Combinar candidatos de diferentes métodos.
4. Testar estratégias de ranking.
5. Avaliar relevância e diversidade.
6. Versionar experimentos.

**Critério de conclusão:**

Existem comparações quantitativas entre baselines, modelo baseado em conteúdo e estratégias híbridas.

## Fase 6 — Recursos avançados

Implementar gradualmente:

- Mood-Based Discovery;
- Taste DNA;
- Taste Graph;
- Diversidade;
- Recomendação entre domínios mais elaborada;
- Melhorias no cold start;
- Monitoramento;
- MLflow;
- Otimização de latência.

## Fase 7 — Portfólio e publicação

Tarefas:

1. Revisar arquitetura.
2. Limpar código.
3. Executar testes.
4. Documentar decisões.
5. Criar diagramas.
6. Preparar demonstração.
7. Publicar projeto.
8. Criar README em inglês.
9. Documentar experimentos.
10. Explicar limitações e melhorias futuras.

O projeto deverá ser apresentável mesmo que nem todas as funcionalidades avançadas estejam concluídas.

---

# 24. Documentação do GitHub

O repositório deverá demonstrar qualidade técnica e organização.

O README deverá conter:

- Descrição do problema;
- Visão geral da solução;
- Principais funcionalidades;
- Stack tecnológica;
- Diagrama de arquitetura;
- Explicação do sistema de recomendação;
- Fontes de dados e licenças;
- Instruções de instalação;
- Configuração de ambiente;
- Execução local;
- Testes;
- Métricas;
- Screenshots;
- Limitações;
- Roadmap.

Também criar documentação técnica específica sobre os modelos.

Exemplo de arquivos:

- `docs/architecture.md`;
- `docs/database.md`;
- `docs/api.md`;
- `docs/recommendation-system.md`;
- `docs/ml-experiments.md`;
- `docs/development.md`.

O README não deverá apresentar métricas inventadas ou funcionalidades não implementadas como concluídas.

---

# 25. Como utilizar IA para auxiliar no desenvolvimento

Este projeto será desenvolvido com apoio de uma IA de programação.

A IA deverá atuar como:

- Assistente de Engenharia de Software;
- Mentora de programação;
- Revisora de código;
- Assistente de arquitetura;
- Auxiliar em Machine Learning;
- Auxiliar de documentação;
- Assistente de testes e debugging.

A IA não deverá assumir que todas as decisões precisam ser tomadas automaticamente.

O desenvolvimento deverá ser colaborativo e incremental.

## 25.1. Regras obrigatórias para a IA desenvolvedora

**Regra 1 — Ler a documentação**

Antes de implementar funcionalidades, compreender os objetivos, limitações e decisões documentadas neste arquivo.

**Regra 2 — Não gerar o projeto inteiro de uma vez**

Dividir o desenvolvimento em tarefas pequenas, testáveis e organizadas.

**Regra 3 — Priorizar código funcional**

Escrever código consistente, legível e adequado às versões utilizadas.

Evitar exemplos incompletos apresentados como soluções prontas.

**Regra 4 — Verificar dependências**

Não assumir que exemplos antigos continuam compatíveis com versões atuais.

Verificar a documentação oficial quando possível.

**Regra 5 — Não inventar resultados**

Nunca criar métricas falsas, resultados de treinamento fictícios ou alegações de funcionamento não verificadas.

**Regra 6 — Explicar decisões**

Antes de introduzir tecnologias ou mudar a arquitetura, explicar por que a mudança é necessária.

**Regra 7 — Preservar a arquitetura**

Evitar mudanças desnecessárias na estrutura existente.

**Regra 8 — Implementar testes**

Criar testes compatíveis com as funcionalidades desenvolvidas.

**Regra 9 — Não esconder erros**

Quando ocorrer uma falha, identificar a causa e propor uma correção fundamentada.

**Regra 10 — Segurança**

Não expor segredos, não criar autenticação insegura e não ignorar autorização.

**Regra 11 — Respeitar o hardware**

Priorizar soluções que possam ser desenvolvidas e testadas em um notebook pessoal.

**Regra 12 — Evitar complexidade desnecessária**

Não instalar novas bibliotecas ou criar serviços adicionais sem necessidade técnica.

**Regra 13 — Explicar o código para aprendizado**

Como este projeto também tem objetivo educacional, explicar os conceitos importantes.

**Regra 14 — Seguir boas práticas**

Utilizar tipagem, validação, separação de responsabilidades, tratamento de erros, logs apropriados e testes.

**Regra 15 — Nunca afirmar que algo foi testado sem executar o teste**

Caso não seja possível executar comandos, informar claramente quais validações ainda precisam ser realizadas.

---

# 26. Fluxo de trabalho com a IA

Para cada funcionalidade, seguir o processo:

**Etapa 1 — Planejamento**

A IA deverá explicar:

- O que será implementado;
- Qual problema resolve;
- Quais arquivos serão criados;
- Quais arquivos serão modificados;
- Quais dependências serão necessárias;
- Como o resultado será validado.

**Etapa 2 — Implementação**

Desenvolver somente a funcionalidade combinada.

**Etapa 3 — Explicação**

Explicar os trechos técnicos importantes, especialmente quando envolverem conceitos novos.

**Etapa 4 — Verificação**

Executar ou orientar a execução de:

- Testes;
- Lint;
- Verificação de tipos;
- Build;
- Verificação de integração, quando apropriada.

**Etapa 5 — Correção**

Resolver erros encontrados antes de avançar.

**Etapa 6 — Documentação**

Atualizar a documentação relevante quando houver mudanças significativas.

**Etapa 7 — Próxima tarefa**

Prosseguir somente após validar o resultado atual, salvo se a tarefa depender explicitamente de outra etapa.

---

# 27. Regras específicas sobre Machine Learning

A IA desenvolvedora deverá:

1. Explicar a escolha de cada algoritmo.
2. Diferenciar treinamento, validação e inferência.
3. Documentar a origem dos dados.
4. Impedir data leakage.
5. Criar baselines.
6. Avaliar modelos com métricas adequadas.
7. Registrar hiperparâmetros.
8. Garantir reprodutibilidade sempre que possível.
9. Evitar treinamento desnecessário a cada execução.
10. Considerar desempenho em CPU.
11. Não afirmar que o modelo compreende emoções humanas ou narrativas de maneira perfeita.
12. Documentar limitações de embeddings e similaridade.
13. Distinguir resultados offline de desempenho observado em usuários reais.
14. Priorizar a qualidade do recomendador em vez da quantidade de modelos utilizados.

O sistema de IA deve ser uma implementação real, não apenas uma simulação visual de recomendações inteligentes.

---

# 28. Ordem de aprendizado durante o projeto

Como o Nexo também será utilizado para desenvolver competências profissionais, a implementação deverá acompanhar a evolução dos conhecimentos técnicos.

## Fundamentos de dados

Estudar:

- Pandas;
- NumPy;
- Preparação de datasets;
- Estatística básica;
- Exploração de dados;
- Validação de dados.

## Fundamentos de Machine Learning

Estudar:

- Treinamento;
- Validação;
- Teste;
- Overfitting;
- Generalização;
- Similaridade;
- Avaliação de modelos;
- Features;
- Baselines.

## Sistemas de recomendação

Estudar:

- Content-Based Filtering;
- Collaborative Filtering;
- Matrix Factorization;
- Embeddings;
- Hybrid Recommenders;
- Cold Start;
- Ranking;
- Métricas de recomendação.

## Deep Learning e NLP

Estudar:

- Redes neurais;
- PyTorch;
- Transformers;
- Sentence Embeddings;
- Busca semântica;
- Similaridade vetorial.

## Engenharia de IA

Estudar:

- FastAPI;
- Inferência;
- Versionamento de modelos;
- Docker;
- APIs de ML;
- MLflow;
- Monitoramento;
- Testes de sistemas de IA.

A IA poderá sugerir materiais de estudo relacionados à tarefa atual, mas não deverá bloquear o desenvolvimento exigindo domínio prévio de todos os assuntos.

---

# 29. Critérios gerais de qualidade

O Nexo deverá atender aos seguintes princípios:

## Funcionalidade

As funcionalidades implementadas precisam funcionar de ponta a ponta.

## Desempenho

Evitar requisições e processamento desnecessários.

## Organização

Código dividido por responsabilidades.

## Segurança

Autenticação, autorização e proteção de credenciais.

## Manutenção

Arquitetura compreensível e documentada.

## Reprodutibilidade

Experimentos e configurações registrados.

## Testabilidade

Regras importantes cobertas por testes.

## Experiência do usuário

Interface simples, acessível e responsiva.

## Honestidade técnica

Documentar resultados e limitações reais.

## Evolução

Permitir adicionar novos modelos e tipos de mídia sem reconstruir a aplicação inteira.

---

# 30. Definição de projeto concluído

O Nexo poderá ser considerado pronto para apresentação em um portfólio profissional quando:

- O site estiver funcional;
- Usuários conseguirem criar contas;
- O catálogo apresentar filmes, séries e livros;
- A pesquisa funcionar;
- As avaliações forem persistidas;
- A biblioteca pessoal funcionar;
- Existir um recomendador real implementado;
- As recomendações utilizarem informações do usuário;
- O back-end estiver integrado ao front-end;
- Existirem testes automatizados relevantes;
- Os experimentos de ML estiverem documentados;
- O código estiver versionado no GitHub;
- O README explicar a arquitetura;
- Os resultados apresentados forem verificáveis;
- O sistema possuir uma demonstração executável.

Funcionalidades avançadas como Taste Graph, Learning to Rank e retreinamento automatizado poderão continuar em desenvolvimento.

---

# 31. Objetivo profissional do projeto

O Nexo não será somente um site de entretenimento.

Ele será desenvolvido como um projeto de portfólio para demonstrar capacidade de construir sistemas de Inteligência Artificial aplicados a problemas reais.

As principais competências que deverá evidenciar são:

**Machine Learning Engineering**

Desenvolvimento, avaliação, versionamento e utilização de modelos.

**Recommendation Systems**

Personalização, filtragem colaborativa, similaridade e ranking.

**Natural Language Processing**

Embeddings, representação de textos e busca semântica.

**Back-end Engineering**

APIs, bancos de dados, arquitetura e integração.

**MLOps**

Reprodutibilidade, testes, experimentos e disponibilização de modelos.

**Full-Stack Development**

Integração entre interface, serviços e modelos inteligentes.

O resultado esperado é um projeto que possa ser explicado tecnicamente em entrevistas de estágio ou vagas iniciais nas áreas de Artificial Intelligence, Machine Learning e Software Engineering.

---

# 32. Instrução inicial para a IA desenvolvedora

Você será minha assistente de desenvolvimento no projeto Nexo.

Leia toda esta documentação e utilize-a como referência principal para o desenvolvimento.

O projeto será uma aplicação web responsiva, utilizando React, TypeScript, Python, FastAPI, PostgreSQL e Machine Learning.

Meu ambiente de desenvolvimento é Windows com Visual Studio Code.

Quero construir um projeto profissional, funcional, organizado, seguro e tecnicamente consistente, com foco especial no sistema de recomendação.

O objetivo é aprender durante o desenvolvimento e produzir um projeto relevante para meu portfólio de Engenharia de Inteligência Artificial.

Siga estas instruções:

1. Não tente implementar todo o projeto de uma vez.
2. Comece pela Fase 0 do roadmap.
3. Apresente um plano de implementação da fase.
4. Explique as decisões arquiteturais.
5. Utilize bibliotecas e versões compatíveis.
6. Escreva código limpo e fortemente tipado sempre que apropriado.
7. Crie testes para funcionalidades importantes.
8. Não utilize soluções improvisadas para esconder problemas.
9. Não introduza serviços pagos sem necessidade.
10. Não altere decisões fundamentais sem justificar.
11. Explique conceitos novos para que eu possa aprender.
12. Evite complexidade prematura.
13. Não invente testes executados ou resultados de ML.
14. Priorize o desenvolvimento incremental.
15. Antes de avançar, informe como validar a implementação atual.

**Primeira tarefa:**

Analise esta documentação, proponha a estrutura inicial do repositório e apresente o plano técnico da Fase 0.

Não implemente funcionalidades avançadas ainda.

Começaremos pela configuração do ambiente, estrutura do front-end, estrutura do back-end, qualidade de código e preparação da arquitetura.

O objetivo é construir o Nexo de maneira organizada, compreendendo as tecnologias utilizadas e garantindo que cada etapa tenha uma base sólida.

---

**Fim da documentação inicial — Nexo**

*Este documento representa a especificação inicial do projeto. Decisões técnicas poderão evoluir durante a implementação, desde que sejam justificadas, documentadas e compatíveis com os objetivos principais.*