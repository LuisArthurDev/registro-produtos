# Configurar OneSignal no Registro de Validades (Supabase + Vercel)

**Situação desta entrega:** o projeto contém o arquivo do *service worker* do OneSignal, mas **a assinatura de dispositivos, o envio automático e o agendamento de 8 horas ainda não estão ativos**. Este guia é a sequência de configuração e homologação, não um aviso de implantação concluída.

## 1. Criar a aplicação OneSignal

1. Entre em https://dashboard.onesignal.com/ e crie uma aplicação chamada, por exemplo, "Registro de Validades".
2. Abra **Settings → Push & In-App → Web** e selecione **Custom Code** (não WordPress nem Shopify).
3. Cadastre a **URL HTTPS estável do Vercel** que será a origem real do sistema, por exemplo `https://seu-projeto.vercel.app`. Não cadastre a URL do GitHub Pages, porque ela apenas redireciona. Se usar domínio próprio no futuro, confirme a migração de origem e assinaturas.
4. Anote o **App ID** (identificador público). O **REST API Key** é privado e **não** deve ir para `public/`, GitHub ou código de navegador.

## 2. Conferir o service worker no Vercel

Este repositório já tem:

`public/push/onesignal/OneSignalSDKWorker.js`

Seu conteúdo é:

```js
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
```

Depois do deploy, abra no navegador:

`https://SEU-PROJETO.vercel.app/push/onesignal/OneSignalSDKWorker.js`

A página deve exibir o `importScripts`, sem 404 e sem exigir login. O arquivo deve ser servido como JavaScript. **Não use a raiz para esse worker**, pois o projeto já registra `/sw.js` como PWA. O OneSignal recomenda diretórios separados quando há mais de um service worker.

## 3. Inicializar o SDK nas páginas da aplicação

Na configuração **Custom Code**, adicione ao `<head>` de `public/index.html` **e** `public/lancamentos.html` (uma vez por página), ajustando `SEU-ONESIGNAL-APP-ID`:

```html
<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
<script>
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    await OneSignal.init({
      appId: 'SEU-ONESIGNAL-APP-ID',
      serviceWorkerPath: 'push/onesignal/OneSignalSDKWorker.js',
      serviceWorkerParam: {scope: '/push/onesignal/'},
      notifyButton: {enable: false}
    });
  });
</script>
```

**Importante:** esse snippet prepara o SDK, mas **não implementa sozinho** as regras de autorização de dispositivo, segmentação por loja, consentimento e envio. Para uso por funcionários, integre as etapas seguintes no código, não apenas no HTML.

## 4. Vincular a assinatura ao funcionário certo

Depois de validar a sessão do usuário no backend e aprovar seu aparelho:

```js
window.OneSignalDeferred.push(async function(OneSignal) {
  await OneSignal.login(ID_INTERNO_DO_USUARIO);
  OneSignal.User.addTag('loja', CODIGO_DA_LOJA);
  OneSignal.User.addTag('perfil', PERFIL_DO_USUARIO);
});
```

Use o ID estável da tabela `usuarios` (não PIN, nome, EAN ou e-mail privado). Não confie somente em tags do navegador para autorizar ações ou definir destinatários sensíveis: a API Vercel deve validar loja, perfil, funcionário ativo e autorização do dispositivo no Supabase.

No logout, desvincule a identidade do SDK para impedir que um próximo funcionário no mesmo aparelho receba mensagens da conta anterior:

```js
window.OneSignalDeferred.push(async function(OneSignal) {
  await OneSignal.logout();
});
```

Não marque o celular como autorizado automaticamente por ele ter aceitado notificações. **Permissão de push** e **dispositivo autorizado** são controles diferentes.

## 5. Pedir permissão de forma contextual

Crie um botão de usuário "Ativar notificações" na aba Notificações. Quando o funcionário tocar nele, após autenticação e autorização do aparelho:

```js
window.OneSignalDeferred.push(async function(OneSignal) {
  if (!OneSignal.Notifications.isPushSupported()) return;
  await OneSignal.Notifications.requestPermission();
});
```

Não solicite permissão a cada login nem faça chamadas repetidas quando o usuário já negou. No iPhone, o usuário precisa adicionar a PWA à Tela de Início e abri-la por esse ícone, com iOS/iPadOS 16.4+.

## 6. Configurar a API de envio com segurança

No Vercel em **Settings → Environment Variables** (Production e, para testes, Preview), configure os segredos **apenas no backend**:

- `ONESIGNAL_APP_ID`: App ID criado no painel OneSignal.
- `ONESIGNAL_REST_API_KEY`: credencial REST privada gerada pelo OneSignal.
- `NOTIFICATION_CRON_SECRET`: segredo longo gerado para autorizar o agendador.

Faça um novo deploy para carregar as variáveis. Implemente um endpoint protegido, por exemplo `/api/notificacoes/enviar-vencidos`, que:

1. Exija `NOTIFICATION_CRON_SECRET` do agendador e recuse qualquer chamada sem autorização;
2. Consulte no Supabase somente registros elegíveis às regras de vencimento;
3. Aplique os limites por funcionário, loja, `celular_proprio`, status ativo e autorização individual do dispositivo;
4. Gere lotes por destinatário sem expor dados de outros funcionários;
5. Grave uma chave única de deduplicação por janela/loja/destinatário antes de enviar, com controle de concorrência, para evitar alertas repetidos;
6. Envie a mensagem pela API REST do OneSignal no backend e guarde o resultado na auditoria.

Não coloque a chave REST no navegador nem chame a API REST de envios diretamente pelo `app.js`.

## 7. Agendar a cada 8 horas

Depois de validar manualmente os destinatários, configure **um** agendador, não vários simultâneos. Uma alternativa é GitHub Actions com cron UTC:

```yaml
on:
  schedule:
    - cron: '0 0,8,16 * * *'
  workflow_dispatch:
```

Os horários correspondem aproximadamente a 21h, 5h e 13h (horário de Brasília; a primeira execução pertence ao dia local anterior). O workflow deve chamar o endpoint protegido do Vercel enviando o segredo **apenas em header**, guardado em GitHub Actions Secrets, nunca em parâmetros de URL ou logs.

**Não basta adicionar esse YAML:** é necessário implementar e homologar antes o endpoint, o controle de acesso, a seleção de destinatários e a deduplicação. A execução agendada do GitHub Actions pode atrasar.

## 8. Homologação

- Primeiro teste em uma loja piloto e em um aparelho autorizado de teste.
- Confirme a assinatura em Chrome/Android e PWA instalada no iPhone.
- Envie uma notificação pelo painel OneSignal para esse usuário de teste.
- Confira que login/logout em aparelho compartilhado altera a vinculação corretamente.
- Confirme que administradores de loja não enviam nem acessam dados de outras lojas; somente Admin Geral opera escopo global.
- Desative um usuário/dispositivo e confirme que não recebe novos alertas.
- Faça dois disparos no mesmo intervalo de 8 horas e verifique que **não** gera avisos duplicados.

## Referências oficiais

- [Web SDK setup](https://documentation.onesignal.com/docs/en/web-sdk-setup)
- [Service worker e escopos](https://documentation.onesignal.com/docs/en/onesignal-service-worker)
- [Web SDK v16](https://documentation.onesignal.com/docs/en/web-sdk-reference)
- [Web push no iOS](https://documentation.onesignal.com/docs/en/web-push-for-ios)
- [API para enviar mensagens](https://documentation.onesignal.com/reference/create-message)
