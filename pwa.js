/* Inicialização PWA para GitHub Pages.
 * Verifica atualizações do Service Worker ao abrir cada página, sem recarregar
 * a página atual. O worker do OneSignal continua responsável pelas notificações.
 */
(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  var workerUrl = "/registro-produtos/OneSignalSDKWorker.js";
  var workerScope = "/registro-produtos/";

  function registrarEVerificarAtualizacao() {
    navigator.serviceWorker
      .getRegistration(workerScope)
      .then(function (atual) {
        const instalado = atual && (atual.active || atual.waiting || atual.installing);
        const correto = instalado && new URL(instalado.scriptURL, location.origin).pathname === workerUrl;
        return correto ? atual : navigator.serviceWorker.register(workerUrl, { scope: workerScope });
      })
      .then(function (registration) {
        console.info("PWA: service worker registrado", registration.scope);

        // Consulta se há uma versão nova do worker. Não força reload da página:
        // evita interromper formulários, lançamentos e consultas em andamento.
        if (typeof registration.update === "function") {
          return registration.update().catch(function (error) {
            console.warn("PWA: não foi possível verificar atualizações", error);
          });
        }
      })
      .catch(function (error) {
        console.warn("PWA: não foi possível registrar o service worker", error);
      });
  }

  // Ao abrir a página, o navegador verifica o worker e instala uma versão nova
  // quando disponível. A página atual permanece aberta, sem recarga automática.
  if (document.readyState === "complete") {
    registrarEVerificarAtualizacao();
  } else {
    window.addEventListener("load", registrarEVerificarAtualizacao, { once: true });
  }
})();
