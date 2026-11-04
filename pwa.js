/* Inicialização PWA para GitHub Pages. O worker do OneSignal é compartilhado
   com o escopo do aplicativo para não sobrescrever o worker de notificações. */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/registro-produtos/OneSignalSDKWorker.js", { scope: "/registro-produtos/" })
      .then(function (registration) {
        console.info("PWA: service worker registrado", registration.scope);
      })
      .catch(function (error) {
        console.warn("PWA: não foi possível registrar o service worker", error);
      });
  }, { once: true });
})();
