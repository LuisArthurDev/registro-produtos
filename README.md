# Registro de Mapa de Validade

Aplicação web publicada pelo GitHub Pages, com páginas operacionais, Google Apps Script, catálogo local legado e integração com Cloudflare D1.

## Páginas principais
- `index.html` — login e entrada no sistema.
- `lancamento.html` — lançamento de produtos.
- `painelconferente.html` — painel operacional.
- `painelgeral.html` — administração geral.
- `visualizacao.html` — consulta de registros.
- `instalar.html` — instruções de instalação PWA.
- `erro.html` — tela de acesso/erro.

## Estrutura
- `assets/css/` — estilos compartilhados.
- `assets/js/` — scripts compartilhados de interface.
- `scripts/` — scripts Python chamados pelos GitHub Actions.
- `.github/workflows/` — workflows ativos.
- `worker/migrations/` — schema e lotes de importação D1 usados pelo workflow.
- `libs/sql.js/` — biblioteca SQLite usada pelo catálogo local/fallback.
- `archive/legacy-workflows/` — workflow antigo preservado, mas não executado pelo GitHub Actions.

## Tema do Painel Conferente
O painel agora acompanha `prefers-color-scheme` quando não existe preferência manual. O botão na barra superior alterna claro/escuro; a escolha é salva em `localStorage` na chave `tema` e sincroniza entre abas. Os estilos estão em `assets/css/painel-darkmode.css`.

## Publicação
Publique os arquivos mantendo os caminhos relativos. Não execute novamente os lotes SQL de importação apenas por causa desta atualização visual. O workflow de importação D1 é manual e pode ser destrutivo em termos operacionais mesmo com `INSERT OR IGNORE`; não o execute sem necessidade.

## Arquivos sensíveis à compatibilidade
Os workflows ativos usam `scripts/` e `worker/migrations/`. Os arquivos duplicados byte a byte na raiz foram removidos. Os dados de catálogo, planilhas, Apps Script, autenticação e endpoints foram preservados.
