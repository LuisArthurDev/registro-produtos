# Correção: erro no OneSignal e confirmação de sessão no celular

Data: 10/11/2026. Base: `registro-validades-vercel-supabase-fluxos-atualizados-2026-11-09.zip`.

## O que foi alterado

- `public/assets/push.js`: carga do SDK OneSignal v16 com mensagem específica quando o CDN falha; nova tentativa de carregamento; inicialização antecipada sem solicitar permissão; relatório de erro de inicialização, incluindo possíveis divergências entre domínio do Vercel e site configurado no OneSignal; não registra consentimento como concluído se a assinatura falhar.
- `public/index.html` e `public/lancamentos.html`: script do SDK identificado, `OneSignalDeferred` criado antes do SDK, diagnóstico de falha de carregamento e botão **Tentar confirmar sessão novamente**.
- `public/assets/app.js`: preserva status HTTP dos erros, sem confundir sessão inválida (`401`) com falha de rede; permite tentar validar o token novamente sem redigitar o PIN. Depois de um login confirmado pela API no celular, transfere a sessão recém-validada para `/lancamentos.html` com validade de 30 segundos e uso único, evitando uma segunda consulta ao Supabase exatamente no redirecionamento. Todas as operações de leitura/gravação continuam autenticadas no servidor.
- `api/index.js`: falha transitória ao atualizar `ultima_atividade` não invalida uma sessão já confirmada. Expiração, bloqueio e permissões permanecem obrigatórios.
- `public/sw.js`: versão de cache PWA atualizada para distribuir os novos arquivos.
- `tests/correcao-sessao-onesignal.test.js`: regressão para HTTP 401/503, ponte móvel, falha de SDK e presença dos controles de recuperação.

## Instalação

1. Atualize os arquivos do ZIP no repositório GitHub e confirme o deploy novo no Vercel.
2. Abra `https://SEU-PROJETO.vercel.app/api/health?check=1`: deve informar `sucesso:true`, `banco:acessivel`.
3. **OneSignal > Settings > Web Push / Site Setup**: confirme que a **Site URL** cadastrada corresponde exatamente à origem HTTPS usada no Vercel (incluindo subdomínio, sem caminho). Um domínio alternativo precisa estar corretamente configurado no OneSignal. O App ID no código é `2e84a1da-d84f-4f22-a24f-8515dd357558`.
4. No navegador, abra a URL `https://SEU-PROJETO.vercel.app/push/onesignal/OneSignalSDKWorker.js`: ela deve devolver JavaScript, e não HTML/404. No Vercel esse arquivo vem de `public/push/onesignal/OneSignalSDKWorker.js`.
5. Confira o carregamento de `https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js` no navegador. Extensões de privacidade e Brave Shields podem bloquear essa requisição; se necessário permita o domínio no navegador **para teste**. Em redes corporativas, o CDN pode estar indisponível.
6. No iPhone, instale o site na Tela de Início e abra-o pelo ícone para habilitar Web Push (em dispositivos e versões compatíveis). Em Android, utilize navegador compatível em HTTPS.
7. Depois de publicar, **feche e reabra a PWA** e, se o dispositivo ainda usar arquivos antigos, atualize a página e limpe somente o cache do site. Não apague o armazenamento local se houver lançamentos pendentes.
8. Faça login novamente no celular. O redirecionamento para Lançamentos não deverá exigir revalidação imediata; se houver falha posterior, use o botão **Tentar confirmar sessão novamente**.
9. Clique **Permitir notificações** e verifique se aparece solicitação do navegador. A escolha **Agora não** continua disponível, sem aprovação administrativa.

## Limitações e diagnóstico

Não é possível garantir o recebimento de notificações sem testar a origem do Vercel, a configuração do OneSignal, a política do navegador e a chave REST do backend. Se o SDK retornar um erro de inicialização, envie **somente a mensagem exibida**, sem chaves nem PINs. Se a API retornar 5xx, use a referência de erro e os logs do Vercel.

Este pacote não altera banco SQL nem necessita executar a migração de dados. O agendamento de 8 horas continua como antes, dependendo da configuração do GitHub Actions e dos Secrets do Vercel.
