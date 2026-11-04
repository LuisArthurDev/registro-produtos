(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) {
    return;
  }

  let verificacaoEmAndamento = false;

  async function verificarAtualizacao() {
    if (verificacaoEmAndamento) return;

    verificacaoEmAndamento = true;

    try {
      const registrations =
        await navigator.serviceWorker.getRegistrations();

      const registroPrincipal = registrations.find(registro => {
        return registro.scope.includes('/registro-produtos/');
      });

      if (registroPrincipal) {
        await registroPrincipal.update();
      }
    } catch (erro) {
      console.warn(
        '[PWA] Não foi possível verificar atualizações:',
        erro
      );
    } finally {
      verificacaoEmAndamento = false;
    }
  }

  async function iniciarPWA() {
    try {
      const registro = await navigator.serviceWorker.register(
        './service-worker.js',
        { scope: './' }
      );

      console.log('[PWA] Service Worker registrado.');

      await registro.update();

    } catch (erro) {
      console.warn(
        '[PWA] Falha ao registrar Service Worker:',
        erro
      );
    }
  }

  // Inicializa somente quando a página é aberta.
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      iniciarPWA,
      { once: true }
    );
  } else {
    iniciarPWA();
  }

  // Não recarrega a página ao trocar de aba,
  // voltar do histórico ou retornar ao navegador.

})();
