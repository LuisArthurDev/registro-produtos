# Registro de Mapa de Validade

Aplicação web estática (GitHub Pages) com autenticação via Apps Script, API Cloudflare Workers/D1, PWA e notificações.

## Páginas
- `index.html`: autenticação e seleção/entrada no sistema.
- `lancamento.html`: lançamento de produtos e consulta de código de barras.
- `painelconferente.html`: painel operacional, mapas, estoque e funcionários.
- `painelgeral.html`: administração geral.
- `visualizacao.html`: consulta de lançamentos.
- `instalar.html`: instruções de instalação PWA.
- `erro.html`: página de acesso/erro.

## Estrutura de apoio
- `assets/css/theme-fixes.css`: correções transversais de cores, superfícies, tabelas, formulários e tema escuro.
- `assets/js/theme-controller.js`: tema global; preferência manual em `localStorage.tema`, ou preferência do sistema quando não há escolha salva.
- `scripts/`: scripts Python utilizados pelos GitHub Actions.
- `.github/workflows/`: automações de atualização do catálogo e importação D1.
- `worker/`: Cloudflare Worker e migrações D1.
- `libs/sql.js/`: runtime SQLite/sql.js legado ainda presente no repositório.
- `docs/`: documentação técnica e inventário.

## Publicação
O projeto é servido pela raiz do GitHub Pages e possui referências relativas/absolutas já utilizadas pelo PWA e pelos workflows. Por segurança, páginas, endpoints, migrações, dados e arquivos de workflow que possuem caminhos operacionais na raiz foram mantidos nos caminhos atuais. A organização foi feita por meio de `assets/` e `docs/` sem mover arquivos que poderiam quebrar URLs, cache do Service Worker ou automações.

## Tema
A ausência de escolha manual faz o sistema acompanhar `prefers-color-scheme`. Se o usuário escolher claro/escuro, a preferência fica salva em `localStorage` e é aplicada nas páginas. Para voltar ao automático, remover a chave `tema` do armazenamento local do site.

## Importante
Não executar novamente migrações/importações D1 apenas para publicar alterações visuais. O catálogo remoto não é modificado por este pacote.
