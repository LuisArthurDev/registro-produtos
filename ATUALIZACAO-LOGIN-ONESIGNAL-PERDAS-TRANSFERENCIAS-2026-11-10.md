# Atualização de 10/11/2026 — Login, OneSignal, Perdas, Transferências e Tentativa de Venda

Versão de homologação para o projeto Registro de Validades (GitHub + Vercel + Supabase).

## O que foi modificado

- **Login e sessão:** em falha temporária de rede, não apaga a sessão validada; tenta novamente a consulta de `/sessao` e apresenta botão de confirmação quando a rede falha. Erros de credencial/sessão realmente inválida (401/403) continuam exigindo login.
- **OneSignal:** worker do SDK configurado em `public/push/onesignal/OneSignalSDKWorker.js`, caminho do SDK corrigido para `push/onesignal/OneSignalSDKWorker.js`, com escopo `/push/onesignal/`. O botão **Diagnosticar OneSignal** na aba Notificações exibe se HTTPS, SDK e worker estão acessíveis, ajudando a distinguir bloqueio externo de configuração incorreta. Todos os perfis podem optar por receber notificações; nenhuma aprovação administrativa é necessária.
- **Mapa de Validade:** ação **Excluir registro** (exclusão lógica, com auditoria); a lista também mostra registros com quantidade zero, para poder administrar e corrigir registros existentes.
- **Perdas:** **Editar** e **Excluir** para vencidos retirados e danificados. As exclusões não apagam fisicamente o histórico. A seção de vencidos ainda presentes no mapa continua usando as ações do mapa.
- **Transferências:** modal **Registrar Transferência**, **Editar** e **Excluir**, filtros, impressão, exportação e 15/25/50 itens por página. A loja de destino vem obrigatoriamente da conta autenticada e não pode ser alterada. O cadastro mantém identificador único de tentativa, para prevenir duplicações por reenvio.
- **Controle de Validade:** seção **Elegíveis a Tentativa de Venda / Prevenção**, aplicando a regra do painel antigo: validade a partir de **3 meses até 9 meses de calendário**, inclusive. Filtro por responsável/aba, busca, CSV, impressão, 15/25/50 itens por página e botão **Retirar da Loja**, com confirmação e registro de auditoria. A remoção é lógica e preserva o registro original.

## Instalação — ordem obrigatória

1. **Faça backup** do banco Supabase e use uma branch de testes antes de substituir a aplicação operacional.
2. Suba os arquivos atualizados no mesmo repositório do GitHub que publica o Vercel.
3. Se ainda não executou a migração `supabase/008_operacoes_lancamento.sql`, no GitHub entre em **Actions → Supabase - preparar e importar → Run workflow** e selecione a etapa `atualizar_operacoes`. A migração 008 é necessária para o campo `mapa_lancamentos.excluido_em`.
4. Depois execute a nova etapa **`atualizar_perdas_transferencias`**. Ela aplica o script aditivo `supabase/009_operacoes_perdas_transferencias.sql`, criando campos de exclusão auditável para `vencidos`, `transferencias` e retirada de loja nos mapas.
5. Confirme a implantação no Vercel, atualize a PWA para carregar o cache `registro-validades-v11-validade-perdas-one`, e teste as ações **somente com dados de homologação**.
6. Confirme que `ONESIGNAL_APP_ID=2e84a1da-d84f-4f22-a24f-8515dd357558` corresponde ao aplicativo OneSignal correto e que a **Site URL** cadastrada no painel OneSignal é exatamente o domínio HTTPS do **Vercel**; não use o domínio do GitHub Pages que redireciona.
7. Acesse `https://SEU-DOMINIO-VERCEL/push/onesignal/OneSignalSDKWorker.js`: deve responder HTTP 200 com `importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');`. Em **Notificações → Diagnosticar OneSignal**, confira os resultados de carregamento do SDK e do worker. Extensões anti-rastreamento e bloqueio de scripts podem impedir o OneSignal, mesmo com os arquivos corretos.

## Verificações de produção sugeridas

- Fazer login e recarregar a aplicação com internet lenta; não deve apagar a sessão válida devido apenas à falha transitória.
- Um funcionário vê exclusivamente o próprio mapa. Administradores só podem registrar transferências para a loja do login.
- Tentar Editar/Excluir Perdas e Transferências de outra loja: o servidor deve bloquear.
- Conferir o estado original do registro excluído nas tabelas Supabase e na auditoria.
- Comparar elegibilidade de Tentativa de Venda nas bordas de 3 e 9 meses com o painel antigo; conferir feb/ano bissexto.
- Validar notificação com um aparelho físico em HTTPS. O sistema não pode exigir aprovação de administrador; o consentimento do usuário continua obrigatório.

## O que não foi possível comprovar aqui

Não houve acesso aos seus segredos do OneSignal, banco Supabase real, telefone nem deployment Vercel. Os testes automatizados cobrem cálculos, rotas e permissões por simulação, mas **não** demonstram envio de push ou gravações reais. Não publique diretamente em produção sem testar. A confirmação de autenticação sempre requer sinal para validar a sessão no servidor quando não há autenticação anterior validada.
