# Revisão técnica e alterações

## Correção visual desta versão
- Corrigida a herança de cores no tema escuro para cartões, painéis, tabelas, campos e modais.
- Corrigidas superfícies brancas inline nos modais do Painel Conferente.
- Unificados tokens legados (`--bg`, `--surface`, `--text`, `--ink`, `--muted`, `--border`, `--line`) para que estilos existentes usem as cores do tema.
- Criado controlador comum: preferência manual persistente e modo automático baseado no tema do sistema quando não há preferência salva.
- Adicionado controle de tema nas páginas protegidas que não tinham botão visível.
- Respeitadas as classes e funções existentes; nenhuma regra de negócio ou endpoint foi intencionalmente alterado.

## Inventário e observações
- As páginas possuem estilos embutidos extensos, com algumas regras duplicadas e estilos inline. A camada transversal corrige os pontos visuais sem reescrever os componentes funcionais.
- Há cópias duplicadas dos scripts Python na raiz e em `scripts/`. Os workflows usam explicitamente `scripts/`; as cópias na raiz foram mantidas para não quebrar links ou uso manual.
- SQLs de importação existem na raiz e em `worker/migrations/`; o workflow D1 aponta para `worker/migrations/`. Ambos foram preservados.
- O projeto contém tanto artefatos do catálogo SQLite legado (`produtos_ean.db`, `produtos_ean.json`, `libs/sql.js`) quanto a integração D1. Não removidos, pois a aplicação pode manter compatibilidade/fallbacks e remover esses artefatos sem testes funcionais seria arriscado.
- `catalogo-sqlite.js` contém `garantir()` e `buscarPagina()` na cópia recebida. A inclusão desta revisão não substitui nem modifica essa integração.

## Validações estáticas
- HTMLs principais: `index.html`, `lancamento.html`, `painelconferente.html`, `painelgeral.html`, `visualizacao.html`, `instalar.html`, `erro.html`.
- Scripts JavaScript inline e externos submetidos a verificação de sintaxe com Node.js.
- Scripts Python submetidos a compilação sintática.
- Referências locais a `assets/css/theme-fixes.css` e `assets/js/theme-controller.js` verificadas.

## Testes que ainda exigem ambiente real
- Login e perfis (funcionário, administrador de loja e administrador geral).
- Leitura e gravação do Apps Script e sincronização D1.
- Câmera e leitor de código de barras em Android/iOS.
- Notificações OneSignal e permissões do navegador.
- Instalação/atualização PWA e Service Worker.
- CRUD de funcionários, celular próprio, mapas, estoque e produtos.

Uma verificação estática não comprova o funcionamento dessas integrações. Recomenda-se homologar cada fluxo no ambiente publicado antes de substituir a versão em produção.

## Pendências estruturais encontradas no ZIP recebido
- `wrangler.toml` na raiz e `worker/wrangler.toml` declaram `main = "src/index.js"`, mas o arquivo `src/index.js` não está presente nem na raiz nem em `worker/src/`. O código-fonte do Worker Cloudflare não veio neste ZIP. O Worker publicado pode continuar operando no Cloudflare, mas este repositório, isoladamente, não consegue reproduzir/atualizar o deploy do Worker até que o entrypoint seja incluído no caminho configurado.
- A revisão visual não criou um Worker fictício nem substituiu a implementação remota, para evitar quebrar autenticação, endpoints ou gravações no D1. É necessário recuperar o `src/index.js` correspondente à versão que está atualmente publicada.
- Os arquivos `atualizar_produtos.py` e `gerar_banco_sqlite.py` na raiz são duplicatas dos arquivos em `scripts/`. Os workflows utilizam `scripts/`; os duplicados foram mantidos por compatibilidade.
