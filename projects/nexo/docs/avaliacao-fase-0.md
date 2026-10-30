# Avaliação da Fase 0 — Nexo

A Fase 0 prepara o ambiente e a estrutura para você desenvolver as próximas funcionalidades. A mudança de escopo está registrada em [ADR 001](decisions/001-phase-0-local-foundation.md): banco e Supabase entram depois da modelagem, conforme nossa conversa.

## O que foi preparado e por quê

| Parte | O que existe | Por que existe |
| --- | --- | --- |
| Interface | React, TypeScript estrito, Vite, Tailwind | Permite desenvolver telas reutilizáveis com verificação de tipos e build |
| Navegação | Home pública, Explorar e Minha lista | Separa apresentação do produto da área de uso |
| Preferências | Temas claro/escuro e lista no navegador | Permite avaliar a experiência antes de existir uma conta |
| API | FastAPI, Pydantic, configuração validada e /health | Prepara o servidor e um primeiro contrato HTTP verificável |
| Ambiente Python | Python 3.12 e ambiente virtual do projeto | Evita depender dos atalhos Windows que falharam e separa dependências |
| Configuração | Exemplos .env e arquivos locais ignorados | Separa valores de ambiente do código |
| Qualidade | ESLint, Prettier, Ruff, mypy, Vitest e Pytest | Verifica estilo, problemas de código, tipos e comportamentos importantes |
| Reprodutibilidade | package-lock.json, uv.lock e scripts | Registra versões e permite recriar o ambiente |
| GitHub | ML-lab privado, projects/nexo e CI | Organiza o portfólio e repete a validação em outra máquina |
| Documentação | Produto, arquitetura, interface, desenvolvimento e publicação | Explica o estado real e como continuar sem depender desta conversa |

## 1. Iniciar o projeto

Na pasta local Nexo, rode uma vez se precisar instalar ou recriar o ambiente:

    .\scripts\setup.ps1

O script verifica os pré-requisitos, cria os .env a partir dos exemplos apenas quando não existem, instala o Python isolado e utiliza os lockfiles. Não substitui configurações suas.

Para a API, em um terminal:

    .\scripts\backend.ps1 dev

Para a interface, em outro:

    npm.cmd --prefix frontend run dev

## 2. Avaliar no navegador

- http://127.0.0.1:5173/ — confira a apresentação pública.
- Clique em Explorar títulos — deve abrir /explore.
- Alterne o tema e recarregue — a preferência deve continuar.
- Use Filmes, Séries e Livros — a seleção deve mudar.
- Busque por um título, autor ou gênero.
- Abra uma capa — deve aparecer a janela de detalhes.
- Guarde um título e abra Minha lista — ele deve estar lá após recarregar.
- Remova o título — a lista deve atualizar, incluindo o estado vazio.
- Pressione Escape em uma janela de detalhes — ela deve fechar.

A lista é local ao navegador. Os oito títulos são uma seleção estática para desenvolver a interface, sem personalização por ML.

## 3. Avaliar a API

- http://127.0.0.1:8000/health — deve retornar status ok e serviço nexo-api.
- http://127.0.0.1:8000/docs — documentação OpenAPI interativa.
- http://127.0.0.1:5173/dev/status — diagnóstico da comunicação real, disponível apenas em desenvolvimento.

O health check confirma que o servidor responde; não é uma verificação de banco.

## 4. Repetir a validação

Na raiz do Nexo:

    .\scripts\check.ps1

O script para no primeiro erro. Os testes de interface incluem simulações controladas de respostas da API; a verificação pelo diagnóstico acima usa os servidores reais.

## 5. Avaliar o GitHub privado

- [ML-lab](https://github.com/withxlari/ml-lab)
- [Pasta do Nexo](https://github.com/withxlari/ml-lab/tree/main/projects/nexo)
- [GitHub Actions](https://github.com/withxlari/ml-lab/actions)

Verifique o indicador Private. O CI deve apresentar os jobs frontend e backend.

O agrupamento funciona como um repositório com pastas por projeto. Sua pasta local Nexo continua no mesmo lugar. Veja [como sincronizar as próximas alterações](github.md).

## O que você vai fazer na próxima etapa

Seu primeiro exercício continua sendo o desenho de MediaItem: campos, tipos, obrigatoriedade, valores nulos e validações. Depois, você pode implementar um schema Pydantic e a primeira rota de catálogo.

Não foram implementados banco, login, catálogo importado, avaliações em servidor ou recomendador. Esses itens continuam nas fases seguintes. Nenhum site foi colocado em hospedagem pública.
