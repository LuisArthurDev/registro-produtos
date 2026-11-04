/* Inicialização PWA para GitHub Pages. O worker do OneSignal é compartilhado
   com o escopo do aplicativo para não sobrescrever o worker de notificações. */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/registro-produtos/OneSignalSDKWorker.js", { scope: "/registro-produtos/" })
      .then(function (registration) {
        console.info("PWA: service worker registrado", registration.scope);
        if (registration.update) registration.update().catch(function () {});
      })
      .catch(function (error) {
        console.warn("PWA: não foi possível registrar o service worker", error);
      });
  }, { once: true });

  // Ao reabrir uma tela restaurada pelo cache de navegação, busca a versão atual.
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) window.location.reload();
  });

  // Se o app ficar em segundo plano por pelo menos um minuto, atualiza ao voltar.
  let ocultoDesde = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { ocultoDesde = Date.now(); return; }
    if (ocultoDesde && Date.now() - ocultoDesde >= 60000) {
      ocultoDesde = 0;
      window.location.reload();
    }
  });
})();
