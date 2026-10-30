# Guia de desenvolvimento do Nexo

## O que foi preparado

O front-end é o processo que apresenta a interface no navegador. O back-end recebe requisições HTTP e devolve dados. Nesta etapa eles se comunicam por `GET /health`, sem depender de banco de dados.

O Git já existia na pasta. Node 24.19.0, npm 11.17.0, Git 2.55.0 e uv 0.12.13 estavam disponíveis. Os atalhos `python` e `py` do Windows falharam; foi encontrada outra instalação Python 3.14.7. Para o Nexo, foi instalado Python 3.12.14 dentro de `.runtime/python`, sem alterar o PATH ou o registro do Windows.

## Instalar e executar

Abra dois terminais PowerShell na raiz do Nexo. Primeiro, instale as dependências:

```powershell
.\scripts\setup.ps1
```

No primeiro terminal:

```powershell
.\scripts\backend.ps1 dev
```

No segundo:

```powershell
cd frontend
npm.cmd run dev
```

Acesse http://127.0.0.1:5173 para a home pública. A seleção fica em /explore e a lista local em /library. O diagnóstico da API foi separado em /dev/status, disponível apenas no modo de desenvolvimento. A documentação interativa da API fica em http://127.0.0.1:8000/docs.

Use Ctrl+C para encerrar cada processo. A porta da interface é fixa: se 5173 estiver ocupada, encerre o processo conhecido ou altere a configuração conscientemente. Isso evita que o navegador abra uma aplicação diferente sem perceber.

Usamos `npm.cmd` para chamar diretamente o executável no Windows. Não é necessário ativar manualmente o ambiente virtual: o script utiliza `uv run`.

## Como os arquivos se relacionam

1. `frontend/src/main.tsx` monta a aplicação React e o cliente do TanStack Query.
2. `frontend/src/App.tsx` define as rotas, a navegação e as preferências compartilhadas. A home pública fica em `frontend/src/pages/HomePage.tsx`.
3. `frontend/src/components/ApiStatus.tsx` representa os estados de uma requisição.
4. `frontend/src/services/api.ts` acessa a API e valida a resposta recebida.
5. `backend/app/main.py` cria a aplicação FastAPI.
6. `backend/app/api/health.py` declara a rota e seu contrato.
7. `backend/app/core/config.py` lê e valida configurações.

O proxy do Vite encaminha `/health` ao servidor Python. Assim, o navegador usa um endereço local para a interface e a API. CORS continua configurado para permitir os endereços locais quando necessário.

## Conceitos desta etapa

**Ambiente virtual:** uma pasta com dependências Python exclusivas do projeto.

**Lockfile:** um registro das versões exatas das dependências, incluindo as indiretas. Por isso usamos `npm ci` e `uv sync --locked` ao reinstalar.

**Tipagem estrita:** ajuda a detectar uso incorreto de dados antes de executar o programa. O TypeScript verifica o código, mas não garante que uma resposta de rede seja válida; por isso também validamos o JSON recebido.

**Lint e formatação:** o lint procura problemas no código; o formatador padroniza sua apresentação. Não substituem testes.

**Teste com resposta simulada:** os testes React controlam respostas de rede para verificar sucesso, falha e recuperação. A integração com o servidor real deve ser validada separadamente.

**Health check:** confirma que a API responde. Um futuro teste de prontidão verificará banco e outras dependências.

## Validar

Na raiz:

```powershell
.\scripts\check.ps1
```

O script interrompe no primeiro erro e executa Ruff, mypy e Pytest no back-end; ESLint, Prettier, Vitest e build com TypeScript no front-end.

Para formatar o front-end:

```powershell
cd frontend
npm.cmd run format
```

Para formatar Python, a partir da raiz:

```powershell
$env:UV_CACHE_DIR = Join-Path (Get-Location) '.cache\uv'
uv run --project backend ruff format backend
```

## Configuração e credenciais

Os arquivos `.env.example` mostram as opções. Copie para `.env` dentro de cada componente apenas quando precisar. Os valores padrão já permitem executar a base local.

As opções de Supabase e banco são preparação; ainda não existe conexão implementada. Variáveis `VITE_*` vão para o navegador e só podem conter informações públicas. Senhas e chaves administrativas ficam no servidor.

Conforme a decisão em docs/decisions/001-phase-0-local-foundation.md, banco e Supabase ficam para depois da modelagem de dados/API. Nenhum recurso de infraestrutura foi criado para fechar esta base local.

## Windows e OneDrive

Não mova `.runtime` ou `.venv` entre máquinas: recrie com o script. Se o OneDrive gerar conflitos ou lentidão nas dependências, poderemos mover o checkout para uma pasta local fora da sincronização em uma etapa futura.

## Interface e navegação

A preferência de tema fica salva entre visitas. O script `public/theme-init.js` aplica a escolha antes de a interface aparecer. Os tokens CSS definem as cores de cada tema; assim, todos os componentes usam a mesma paleta.

A seleção atual é editorial e está em `frontend/src/data/selection.ts`. Ela serve para desenvolver a interface, sem simular recomendações de ML. A lista salva funciona neste navegador. Consulte `docs/interface.md` para as decisões, fontes das imagens e validação.


## Avaliação e publicação privada

Use o roteiro em docs/avaliacao-fase-0.md para revisar a entrega. O repositório privado ML-lab agrupa o Nexo em projects/nexo; docs/github.md explica a sincronização da pasta local e o CI.
