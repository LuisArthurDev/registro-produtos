# Revisão técnica — 04/11/2026

## Correção de tema escuro no Painel Conferente
- Criados `assets/css/painel-darkmode.css` e `assets/js/painel-theme.js`.
- O CSS é carregado depois dos scripts-base e antes dos estilos embutidos, mas usa seletores de tema com `!important` onde os estilos antigos tinham cores fixas.
- Corrigidos explicitamente cards de indicadores (`.stat-card`), painéis (`.panel`), tabelas (`.table-panel`, `th`, `td`), filtros, botões secundários, avisos, ícones de indicadores, modais de mapas/sinalizações/funcionários, modal de produto e tela de carregamento.
- O `topbar` recebe um controle de tema; escolha manual persistida na chave `tema`; sem escolha manual, segue o tema do sistema. Mudanças feitas em outra aba são sincronizadas.
- O centro dos gráficos donut passou a usar `var(--surface)` em vez de branco fixo.

## Organização aplicada
Removidos somente arquivos comprovadamente redundantes ou não ativos:
- Cópias byte a byte de `0001_schema.sql` e dos nove lotes `0002_import_*.sql` na raiz. A cópia canônica permanece em `worker/migrations/`, que é o caminho utilizado pelo workflow ativo.
- Cópias byte a byte dos scripts Python na raiz. Os arquivos canônicos permanecem em `scripts/`, caminho utilizado pelo workflow ativo.
- Cópia byte a byte de `importar-catalogo-d1.yml` na raiz. O workflow ativo permanece em `.github/workflows/`.
- Workflow antigo `atualiza_produtos_ean.yml` movido para `archive/legacy-workflows/`; o GitHub Actions só executa workflows dentro de `.github/workflows/`.
- Criado README com mapa da estrutura.

Preservados `Items.ods`, `estoque.ods`, `estoque/estoque_151.ods`, `produtos_ean.json`, `produtos_ean.db`, arquivos Apps Script, catálogo, OneSignal, PWA e migrações canônicas. Não removi os dados SQLite/JSON porque ainda existem componentes locais e caminhos de fallback no repositório.

## Pendências detectadas no material recebido
- `wrangler.toml` e `worker/wrangler.toml` apontam para `src/index.js`, mas o arquivo `src/index.js` não foi incluído no ZIP. Não foi criado um Worker fictício nem alterada a configuração de produção; é necessário recuperar o código-fonte correspondente ao Worker já publicado.
- `code.gs` contém referência ao caminho `estoque/estoque.ods`, enquanto o arquivo dentro da pasta `estoque/` no ZIP está nomeado `estoque_151.ods`. Mantive ambos os arquivos originais sem renomear para não interferir no fluxo de planilhas; confirmar no Google Drive se o nome real é diferente.
- A aplicação tem estilos inline e estilos legados extensos; a camada de tema corrige as superfícies mais comuns do painel sem reescrever a lógica operacional.

## Verificações
Foram realizadas verificações estáticas de sintaxe dos scripts JavaScript embutidos nas páginas, scripts JS externos, Apps Script e Python. Isso não substitui testes reais de autenticação, gravação, câmera, notificações, PWA, D1 ou permissões no ambiente publicado.
