# Registro de Mapa de Validade — Repositório reorganizado

## Estrutura

- `index.html`: login e seleção de usuário.
- `lancamento.html`: lançamento e consulta do mapa.
- `painelconferente.html`: painel administrativo, funcionários, celular próprio e notificações.
- `painelgeral.html`: painel geral.
- `visualizacao.html`: visualização.
- `Code.gs` e `login.gs`: backend Google Apps Script.
- `auth.js`: autenticação do frontend.
- `notificacoes.js` e `OneSignalSDKWorker.js`: integração Web Push.
- `pwa.js`, `manifest.webmanifest`, `icon-*.png`: PWA.
- `catalogo-sqlite.js`, `produtos_ean.db`, `produtos_ean.json`, `catalogo_versao.json`: catálogo local.
- `worker/src/index.js`, `worker/wrangler.toml` e `worker/migrations/`: API Cloudflare D1 e migrações do catálogo.
- `Items.ods`, `estoque.ods`: fontes de dados auxiliares existentes.

## Cloudflare D1

- O Worker está em `worker/src/index.js`; o `worker/wrangler.toml` aponta para esse arquivo.
- Configure o secret `API_SECRET` no Cloudflare Worker.
- O workflow `.github/workflows/importar-catalogo-d1.yml` importa o catálogo existente para D1; ele não publica automaticamente o Worker. Para publicar o Worker, use `wrangler deploy --config worker/wrangler.toml` depois de configurar a conta e o secret.
- O endpoint público de leitura tem CORS limitado ao GitHub Pages deste projeto.

## Apps Script

1. Substitua o conteúdo do projeto Apps Script por `Code.gs` e `login.gs` deste pacote.
2. Confirme `SPREADSHEET_ID` e as configurações de fuso/nomes das abas antes de publicar.
3. Publique como Web App, mantendo a URL que o frontend já utiliza.
4. Em Configurações do projeto > Propriedades do script, configure `MV_ONESIGNAL_APP_ID` e `MV_ONESIGNAL_REST_API_KEY`. O App ID é público e entregue ao frontend por `configNotificacoes`; a REST API Key permanece apenas no servidor.
5. Execute `configurarAgendamentoNotificacoesVencidos` uma vez e autorize os gatilhos. O gatilho verifica a cada 6 horas. Execute `verificarNotificacoesVencidos` manualmente para teste inicial.

## Notificações

- O painel tem a página Notificações para ativar o dispositivo, enviar comunicado a usuários ativos da abrangência autorizada e enviar avisos manuais de vencidos.
- O servidor também tem envio automático por gatilho. O aviso automático é individual e evita repetir o mesmo conjunto de vencidos.
- A autorização de envio é validada no backend: Administrador de Loja alcança apenas sua loja; Administrador Geral pode alcançar todas.
- O destinatário precisa ter concedido permissão e estar inscrito no OneSignal. Push em segundo plano depende do navegador, sistema e instalação/permissões.
- Não coloque a REST API Key em arquivos do GitHub.

## Celular Próprio

- A autorização individual é persistida na coluna `Celular Próprio` da aba `Funcionarios`.
- O token do dispositivo é armazenado como hash nas Propriedades do Script.
- Administrador de Loja controla apenas a própria loja; Administrador Geral controla todas.
- Desativar remove o hash de autorização e invalida a sessão de dispositivo próprio na próxima verificação.

## Testes necessários após implantação

A validação feita na geração deste pacote é estática. Antes de usar em produção, teste login por PIN, sessão, celular próprio, escopo das lojas, transferências, estoque, perdas/Queima, funcionários, histórico, OneSignal e o gatilho de vencidos. Confirme também as credenciais OneSignal e o domínio/site configurado no painel OneSignal.
