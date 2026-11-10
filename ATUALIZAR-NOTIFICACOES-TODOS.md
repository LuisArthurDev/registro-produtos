# Atualização — Notificações para todos, sem aprovação por administrador

## O que muda

- Ao entrar na aplicação, o usuário recebe **Deseja receber notificações?** e escolhe **Permitir notificações** ou **Agora não**. Não é obrigatório aceitar para entrar.
- Se optar por receber e autorizar a permissão nativa, a API registra automaticamente o aparelho. **Ninguém precisa aprovar**.
- **Funcionários, administradores de loja e Administrador Geral** têm o mesmo direito de optar. A flag `Celular próprio` não é exigida.
- Ao sair da conta, a assinatura é desvinculada. Cada conta mantém sua preferência individual no dispositivo; pode mudar pelo menu **Notificações**.
- O Administrador Geral pode **Alterar minha senha** no Painel Geral, confirmando o PIN atual.
- A tela de login (`index.html`) foi adaptada para não gerar scroll horizontal/vertical no documento; o layout compacta em telas de baixa altura.

## Ativar (no mesmo repositório)

1. Atualize os arquivos deste ZIP no GitHub. O Vercel usará o mesmo repositório.
2. Em GitHub Actions → **Supabase - preparar e importar**, execute `configurar_notificacoes` se o SQL 005 ainda não foi aplicado.
3. Execute `notificacoes_para_todos` (SQL 006). Essa migração é **aditiva**, não reimporta dados.
4. Execute `pin_administrador_geral` (SQL 007) para liberar a troca do próprio PIN pelo Geral.
5. No Vercel, configure `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `NOTIFICATION_CRON_SECRET` e `NOTIFICATIONS_ENABLED=false`. As variáveis do Supabase continuam necessárias.
6. Faça **Redeploy**. Teste a opção de aceitar e recusar com **um funcionário e um administrador**.
7. No GitHub Actions, configure os Secrets `VERCEL_NOTIFICATION_URL` e `NOTIFICATION_CRON_SECRET` com o mesmo segredo do Vercel.
8. Depois do teste real, altere `NOTIFICATIONS_ENABLED=true`, faça **Redeploy** e execute uma vez o workflow **OneSignal - avisos de validade (8 horas)** manualmente. O agendamento é automático em 05h17/13h17/21h17 (Brasília), sujeito a atrasos do GitHub.

**Segurança:** nunca coloque a REST API Key do OneSignal ou a chave administrativa do Supabase em HTML, arquivos públicos ou Secrets de clientes. Não é necessário compartilhar essas chaves aqui.

**Homologação:** testes locais não verificam entrega em aparelhos reais; confirme o push em Android/iPhone e as regras por loja antes de habilitar toda a equipe.
