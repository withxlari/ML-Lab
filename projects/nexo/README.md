# Nexo

Plataforma em desenvolvimento para descobrir filmes, séries, livros, mangás e jogos, organizar uma lista pessoal e receber recomendações a partir dos próprios gostos.

Publicado em https://nexo-aiproject.vercel.app. API: https://nexo-api-sooty.vercel.app/health.

## Rodar localmente

Requisitos: Node.js 24, Python 3.12 e uv. Na primeira instalação, execute `./scripts/setup.ps1` e preencha `backend/.env` e `frontend/.env` usando os respectivos arquivos `.env.example`.

Abra dois terminais na raiz do projeto:

```powershell
.\scripts\backend.ps1 dev
```

```powershell
npm.cmd --prefix frontend run dev
```

Site: http://127.0.0.1:5173. API: http://127.0.0.1:8000. Se a porta já estiver ocupada, confira se o servidor já está aberto antes de iniciar outro.

## Estrutura

- `frontend/`: React, TypeScript e Vite; temas claro/escuro, catálogo, lista, avaliações e perfis.
- `backend/app/`: FastAPI, integrações de catálogo, validação de contas e recomendações.
- `backend/tests/`: testes automatizados e testes SQL de privacidade com transação revertida.
- `backend/*.sql`: instalação do banco. Em um projeto novo, use catálogo, conta, preferências da biblioteca, onboarding legado, comunidade, avatares, pessoas, `profile-details.sql`, `completed-and-search.sql` e `book-lookup-stats.sql`. O projeto conectado já está configurado até `completed-and-search.sql`.
- Medição: toda resposta da API traz `X-Request-Id` e `Server-Timing` (tempo de cache, de cada fonte e total). Com `NEXO_SUPABASE_SECRET_KEY` configurada, cada chamada às fontes de livros vira uma linha em `lookup_stats`; a consulta de taxa de acerto e latência está no fim de `book-lookup-stats.sql`.
- `scripts/`: execução, verificações e exportação para o repositório privado ML-lab.

## Dados e recomendações

Filmes e séries usam TMDB; livros priorizam Google Books e edições em português, com Open Library como alternativa. A seleção brasileira vem da lista pública BookInfo, com fonte e período exibidos e cache de 24 horas. Mangás usam Kitsu e jogos usam IGDB. O catálogo inicial não representa todas as obras disponíveis nas buscas externas.

A recomendação combina embeddings multilíngues MiniLM, gêneros, notas, favoritos, Top 5 e preferências escritas. Avaliações negativas também influenciam. O modelo roda no backend; textos privados não são enviados a uma API externa de IA. Os pesos são heurísticos e a qualidade ainda precisa de avaliação com usuários reais. Há experimentos didáticos anteriores preservados no backend.

Para preparar o modelo em uma instalação nova, dentro de `backend/`:

```powershell
uv run python -m app.semantic
```

Metadados públicos e vetores ficam em `.cache/`, com validade e limites de tamanho. As consultas públicas são reaproveitadas; trocar o destaque não faz uma nova busca. A interface espera uma pausa de 450 ms ao digitar. Não são gravados tokens ou textos privados no cache público.

## Conta e privacidade

Explorar é público. Guardar, avaliar, favoritar e seguir exigem conta. Supabase Auth valida a sessão; a API usa o JWT do usuário e o banco aplica RLS por proprietário. A biblioteca e os gostos permanecem privados.

Em Pessoas, a busca por nome ou @usuário encontra apenas perfis publicados. Nas sugestões, “Já assisti”, “Já li” e “Já joguei” adicionam a obra como concluída. “Gostei” e “Não gostei” são opiniões privadas que influenciam as recomendações, sem criar uma nota em estrelas. Essa opinião pode ser alterada ou removida na própria lista.

O perfil público é opcional e reúne Top 5 e avaliações explicitamente públicas. Nas configurações de perfil, é possível mostrar totais de obras concluídas e favoritos, seguidores e quem se segue. Os controles novos começam desligados. Publicar um total não publica os títulos privados. Perfis fechados não aparecem nas listas públicas de conexões.

Os agregados públicos são calculados por funções limitadas no schema interno `nexo_private`, com caminho fixo, verificação de perfil publicado e das opções de visibilidade. O schema não é exposto no Data API. As funções públicas são invoker; acesso direto às tabelas privadas continua bloqueado. Avatares ficam em bucket privado, com arquivo WebP de até 1 MB e links assinados de curta duração.

## Segurança e publicação

Credenciais reais ficam somente em `.env` ou nas variáveis secretas do servidor. No frontend, apenas URL da API, URL do Supabase e chave **publishable**. Nunca use service_role ou chaves privadas em variáveis `VITE_`.

A API limita consultas por IP e por processo, restringe corpos a 4 MB e impede cache compartilhado das respostas pessoais. A compilação do frontend inclui CSP; o arquivo `_headers` configura cabeçalhos nos serviços que o suportam. No hospedeiro escolhido, confirme cabeçalhos, HTTPS e limites na borda; múltiplos workers precisam de limitação compartilhada. Não confie em X-Forwarded-For vindo de proxies desconhecidos.

Antes de abrir ao público: configure SMTP próprio, integre o widget de CAPTCHA ao formulário e ative-o no Supabase; ajuste a política de senhas, o domínio HTTPS e as URLs exatas de retorno. Ajuste `NEXO_ENVIRONMENT=production`, `NEXO_CORS_ORIGINS`, `VITE_API_BASE_URL` e URLs públicas do Supabase. O backend precisa de memória para o modelo e volume persistente para o cache; publicar só o frontend não disponibiliza a recomendação.

O Free confirmado na revisão oferece 50 mil usuários ativos por mês, 500 MB de banco e 1 GB de Storage, sujeitos às cotas vigentes. O SMTP padrão é de testes, restrito a membros da equipe e a dois e-mails por hora. A proteção nativa contra senhas vazadas exige Pro ou superior. Consulte os limites atuais em https://supabase.com/pricing e https://supabase.com/docs/guides/auth/auth-smtp.

A revisão não substitui teste de carga ou auditoria independente. O projeto é adequado para preparar uma beta controlada; qualidade das sugestões e capacidade para tráfego público ainda precisam de medição.

## Verificações

```powershell
.\scripts\check.ps1
backend\.venv\Scripts\python.exe scripts/check-secrets.py
```

A verificação de segredos examina arquivos candidatos ao Git e o histórico local, sem imprimir valores de credenciais. Mantenha testes, lockfiles, SQLs e licenças no repositório. `.env`, dependências, modelos, caches, builds e ZIPs ficam ignorados. A documentação histórica permanece arquivada localmente em `.cache/reference-docs`, fora do Git.

O projeto é publicado na pasta `projects/nexo` do repositório público ML-Lab. Credenciais, modelos e dados locais não são enviados ao GitHub. Alterações locais precisam de commit e publicação explícita.

Na Vercel, o frontend usa `frontend/vercel.json` e a API usa `backend/vercel.json`. O build da API prepara o modelo em `.model/`; em execução, os caches graváveis usam `/tmp/nexo`. Esse cache é temporário e separado por instância: pode haver novas consultas às fontes após reinícios. Para mais tráfego, substitua-o por um cache compartilhado e aplique limites na borda. Nunca execute o treinamento ou o download do modelo durante uma requisição.
