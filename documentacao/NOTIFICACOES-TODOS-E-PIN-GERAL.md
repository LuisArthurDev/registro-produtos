# Notificações para todos e troca de PIN do Geral

## Pré-requisitos

O repositório GitHub continua sendo o mesmo, com frontend e API no Vercel, banco no
Supabase e redirecionamento no GitHub Pages. Não compartilhe chaves no repositório.

## 1. Executar migrações no GitHub Actions (não importa dados novamente)

Abra **Actions → Supabase - preparar e importar → Run workflow** na branch com os arquivos atualizados.
Execute nesta ordem:

1. **`configurar_notificacoes`** (somente se ainda não executou a SQL 005).
2. **`notificacoes_para_todos`** (SQL 006; remove exigência de loja não nula para o Geral e inclui `consentimento_em`).
3. **`pin_administrador_geral`** (SQL 007; função RPC de troca de PIN).

Essas etapas não reenviam catálogo nem mapas. Confira que as três terminaram com sucesso.

## 2. Configure Vercel (Production)

- `SUPABASE_URL`: URL do projeto Supabase
- `SUPABASE_SECRET_KEY`: chave administrativa do Supabase (somente servidor)
- `ONESIGNAL_APP_ID`: `2e84a1da-d84f-4f22-a24f-8515dd357558`
- `ONESIGNAL_REST_API_KEY`: chave REST privada OneSignal
- `NOTIFICATION_CRON_SECRET`: segredo aleatório com 32+ caracteres
- `NOTIFICATIONS_ENABLED`: inicialmente `false`

Faça redeploy para aplicar as variáveis. Verifique se o site, o SDK e o Service Worker
`/push/onesignal/OneSignalSDKWorker.js` são acessíveis via HTTPS no **domínio do Vercel**.
O OneSignal deve estar configurado para esse mesmo domínio (não o GitHub Pages).

## 3. Teste com funcionários e administradores

1. Abra o Vercel ou a PWA no celular. Não há nenhuma etapa de aprovação por administrador. A pergunta **Deseja receber notificações?**
   aparece se ainda não houve escolha para aquela conta nesse aparelho.
2. Escolha **Permitir notificações**. O navegador apresenta a permissão nativa.
3. Faça login. O aparelho é associado à conta. **Não** é necessário `Celular próprio`
   ou aprovação do administrador.
4. No menu **Notificações**, confirme o dispositivo. O administrador de loja pode
   enviar um teste aos assinantes da própria loja.
5. Teste **Agora não** e a revogação na página Notificações. A opção é individual por conta.
6. Em iPhone, é necessário adicionar a PWA à Tela de Início antes de ativar Web Push.

Não compartilhe aparelho sem sair da conta. Ao sair, a associação anterior ao OneSignal
é desativada; ao entrar novamente, se a conta já havia optado por receber, é refeita.

## 4. Ativar rotina de 8 horas

Em **GitHub → Settings → Secrets and variables → Actions**, configure:

- `VERCEL_NOTIFICATION_URL`: `https://SEU-DOMINIO-VERCEL/api/notificacoes/cron`
- `NOTIFICATION_CRON_SECRET`: mesmo valor do Vercel

Após confirmar o teste individual, defina `NOTIFICATIONS_ENABLED=true` no Vercel
e faça redeploy. Execute **Actions → OneSignal - avisos de validade (8 horas) → Run workflow**.
As execuções estão programadas para aproximadamente **05h17, 13h17 e 21h17**
(horário de Brasília), sujeito a atrasos de tarefas agendadas do GitHub Actions.
A API impede envios repetidos dentro da mesma janela de 8 horas.

## 5. Administrador Geral muda a própria senha

No **Painel Geral**, clique em **Alterar minha senha**. Informe PIN atual, novo PIN
numérico de 6 a 12 dígitos e confirmação. A API valida o PIN atual, grava somente
o hash scrypt e encerra todas as **outras** sessões na mesma transação PostgreSQL.
Somente o perfil **geral** pode usar essa rota. Admins de loja continuam restritos
às suas lojas e aos PINs de funcionários de sua loja.

## Testes e limites

Esta entrega inclui verificações automatizadas para API, PIN, permissões e consentimento.
Não foi possível executar envios reais nem validar a entrega em Android/iOS com suas
credenciais OneSignal. O plano gratuito do Vercel depende do GitHub Actions para os
envios a cada 8 horas. Nunca ative notificações para toda a equipe antes de testar
com pelo menos um aparelho por perfil.

## Login sem barras de rolagem

A tela `index.html` do login ocupa a altura da janela e impede rolagem horizontal e vertical do documento. Em alturas pequenas o formulário compacta espaços e tipografia; se o teclado virtual reduzir demais o espaço, um pequeno deslocamento interno pode ser necessário para manter o campo focado acessível, sem exibir a barra.
